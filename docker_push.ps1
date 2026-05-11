#Requires -Version 7
<#
.SYNOPSIS
    Build y despliegue de la imagen Docker de AnythingLLM.

.DESCRIPTION
    Sin parámetros  → solo compila la imagen localmente.
    -Redeploy       → compila y sube al registry (10.0.0.69:5000).
    -Bootstrap      → compila sin caché, sube, y recrea el contenedor en el servidor
                      usando la API de Portainer (no necesita SSH).

.PARAMETER Redeploy
    Compila y hace push al registry privado.

.PARAMETER Bootstrap
    Compila sin caché, hace push, y recrea el contenedor en el servidor vía Portainer API.

.PARAMETER Tag
    Tag de la imagen. Por defecto: "latest".

.PARAMETER PortainerUser
    Usuario de Portainer para Bootstrap. Por defecto: "admin".

.PARAMETER PortainerPass
    Contraseña de Portainer. Si se omite en Bootstrap, se pedirá interactivamente.

.EXAMPLE
    .\docker_push.ps1
    .\docker_push.ps1 -Redeploy
    .\docker_push.ps1 -Bootstrap
    .\docker_push.ps1 -Bootstrap -Tag "1.2" -PortainerPass "mipassword"
#>
param(
    [switch]$Redeploy,
    [switch]$Bootstrap,
    [string]$Tag            = "latest",
    [string]$PortainerUser  = "admin",
    [string]$PortainerPass  = "",
)

$ErrorActionPreference = "Stop"

# ── Configuración ────────────────────────────────────────────────────────────
$REGISTRY        = "10.0.0.69:5000"
$IMAGE_NAME      = "anything-llm"
$FULL_IMAGE      = "${REGISTRY}/${IMAGE_NAME}:${Tag}"
$DOCKERFILE      = "docker/Dockerfile"
$PORTAINER_URL   = "https://10.0.0.69:9443"
$ENDPOINT_ID     = 2
$CONTAINER_NAME  = "anythingllm"
$HOST_PORT       = "3001"
$DATA_DIR        = "/opt/anythingllm"   # ruta en el servidor donde se guardan datos y .env
# ─────────────────────────────────────────────────────────────────────────────

function Write-Step([string]$msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Assert-ExitCode([string]$step) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: '$step' falló (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

# Garantizar que el script se ejecuta desde la raíz del repo
$repoRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $repoRoot $DOCKERFILE))) {
    # Si el script está en la raíz, ajustar
    $repoRoot = $PSScriptRoot
}
Set-Location $repoRoot

# ── 1. BUILD ─────────────────────────────────────────────────────────────────
Write-Step "Building $FULL_IMAGE"

$buildArgs = @("build", "-t", $FULL_IMAGE, "-f", $DOCKERFILE)
if ($Bootstrap) { $buildArgs += "--no-cache" }
$buildArgs += "."

docker @buildArgs
Assert-ExitCode "docker build"

# ── 2. PUSH ──────────────────────────────────────────────────────────────────
if ($Redeploy -or $Bootstrap) {
    Write-Step "Pushing $FULL_IMAGE al registry $REGISTRY"
    docker push $FULL_IMAGE
    Assert-ExitCode "docker push"
}

# ── 3. BOOTSTRAP (redeploy en servidor via Portainer API) ────────────────────
if ($Bootstrap) {

    # Pedir contraseña si no se pasó
    if (-not $PortainerPass) {
        $secPass      = Read-Host "Contraseña de Portainer ($PortainerUser)" -AsSecureString
        $PortainerPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPass))
    }

    # Helper para llamadas a Portainer (ignora certificado autofirmado)
    function Invoke-Portainer {
        param(
            [string]$Method,
            [string]$Path,
            [hashtable]$Headers = @{},
            [object]$Body = $null
        )
        $params = @{
            Method               = $Method
            Uri                  = "$PORTAINER_URL$Path"
            Headers              = $Headers
            SkipCertificateCheck = $true
        }
        if ($Body) {
            $params.Body        = ($Body | ConvertTo-Json -Depth 15 -Compress)
            $params.ContentType = "application/json"
        }
        try {
            return Invoke-RestMethod @params
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            Write-Host "  ERROR $code en $Method $Path" -ForegroundColor Red
            Write-Host "  $_" -ForegroundColor Red
            exit 1
        }
    }

    # 3.1 Autenticar
    Write-Step "Autenticando en Portainer"
    $authResp = Invoke-Portainer -Method POST -Path "/api/auth" -Body @{
        username = $PortainerUser
        password = $PortainerPass
    }
    $authHeaders = @{ Authorization = "Bearer $($authResp.jwt)" }

    # 3.2 Pull de la nueva imagen en el servidor
    Write-Step "Pulling imagen en el servidor ($FULL_IMAGE)"
    Invoke-Portainer -Method POST `
        -Path "/api/endpoints/$ENDPOINT_ID/docker/images/create?fromImage=${REGISTRY}/${IMAGE_NAME}&tag=${Tag}" `
        -Headers $authHeaders | Out-Null

    # 3.3 Buscar el contenedor existente
    Write-Step "Buscando contenedor '$CONTAINER_NAME' en el servidor"
    $filterJson  = [uri]::EscapeDataString('{"name":["/' + $CONTAINER_NAME + '"]}')
    $containers  = Invoke-Portainer -Method GET `
        -Path "/api/endpoints/$ENDPOINT_ID/docker/containers/json?all=true&filters=$filterJson" `
        -Headers $authHeaders

    # Config base del contenedor (usada tanto para crear desde cero como para recrear)
    $baseCreateBody = @{
        Image        = $FULL_IMAGE
        ExposedPorts = @{ "3001/tcp" = @{} }
        HostConfig   = @{
            PortBindings  = @{ "3001/tcp" = @(@{ HostPort = $HOST_PORT }) }
            Binds         = @(
                "${DATA_DIR}/.env:/app/server/.env",
                "${DATA_DIR}/server/storage:/app/server/storage",
                "${DATA_DIR}/collector/hotdir:/app/collector/hotdir",
                "${DATA_DIR}/collector/outputs:/app/collector/outputs"
            )
            CapAdd        = @("SYS_ADMIN")
            RestartPolicy = @{ Name = "unless-stopped" }
            ExtraHosts    = @("host.docker.internal:host-gateway")
        }
    }

    if (-not $containers -or $containers.Count -eq 0) {
        # Crear desde cero
        Write-Step "Contenedor no existe — creando desde cero"
        $createBody = $baseCreateBody
    } else {
        $containerId = $containers[0].Id
        Write-Host "  Encontrado: $($containerId.Substring(0,12))"

        # 3.4 Inspeccionar para reutilizar env vars y redes personalizadas
        $inspect = Invoke-Portainer -Method GET `
            -Path "/api/endpoints/$ENDPOINT_ID/docker/containers/$containerId/json" `
            -Headers $authHeaders

        # 3.5 Parar
        Write-Step "Parando contenedor"
        Invoke-Portainer -Method POST `
            -Path "/api/endpoints/$ENDPOINT_ID/docker/containers/$containerId/stop" `
            -Headers $authHeaders | Out-Null

        # 3.6 Eliminar (sin borrar volúmenes)
        Write-Step "Eliminando contenedor antiguo"
        Invoke-Portainer -Method DELETE `
            -Path "/api/endpoints/$ENDPOINT_ID/docker/containers/$containerId?v=false" `
            -Headers $authHeaders | Out-Null

        # Recrear preservando env vars y redes del contenedor anterior
        Write-Step "Recreando contenedor con $FULL_IMAGE"
        $createBody = $baseCreateBody
        $createBody.Env = $inspect.Config.Env
        if ($inspect.NetworkSettings.Networks.Count -gt 1) {
            $createBody.NetworkingConfig = @{ EndpointsConfig = $inspect.NetworkSettings.Networks }
        }
    }

    $newContainer = Invoke-Portainer -Method POST `
        -Path "/api/endpoints/$ENDPOINT_ID/docker/containers/create?name=$CONTAINER_NAME" `
        -Headers $authHeaders `
        -Body $createBody

    # 3.8 Arrancar
    Write-Step "Arrancando contenedor $($newContainer.Id.Substring(0,12))"
    Invoke-Portainer -Method POST `
        -Path "/api/endpoints/$ENDPOINT_ID/docker/containers/$($newContainer.Id)/start" `
        -Headers $authHeaders | Out-Null

    Write-Host "`n✔  Bootstrap completado. Contenedor '$CONTAINER_NAME' corriendo con $FULL_IMAGE" -ForegroundColor Green
}

if (-not $Redeploy -and -not $Bootstrap) {
    Write-Host "`n✔  Build completado: $FULL_IMAGE" -ForegroundColor Green
    Write-Host "   Usa -Redeploy para subir al registry." -ForegroundColor DarkGray
}
