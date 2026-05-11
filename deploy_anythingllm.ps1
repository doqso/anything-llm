#Requires -Version 7
<#
.SYNOPSIS
    Despliega el stack AnythingLLM en el servidor via Portainer API.
    Usa docker-compose.server.yml como base e inyecta las variables del .env local
    como environment: inline, evitando el problema de env_file con Portainer.

.EXAMPLE
    .\deploy_anythingllm.ps1 -Pass "mipassword"
#>
param(
    [Parameter(Mandatory)][string]$Pass,
    [string]$PortainerUrl  = "https://10.0.0.69:9443",
    [int]$EndpointId       = 2,
    [string]$PortainerUser = "admin",
    [string]$StackName     = "anythingllm"
)

$ErrorActionPreference = "Stop"

function Invoke-P {
    param([string]$Method, [string]$Path, [hashtable]$Headers=@{}, [object]$Body=$null)
    $p = @{ Method=$Method; Uri="$PortainerUrl$Path"; Headers=$Headers; SkipCertificateCheck=$true }
    if ($Body) { $p.Body = ($Body | ConvertTo-Json -Depth 10 -Compress); $p.ContentType = "application/json" }
    try {
        Invoke-RestMethod @p
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        Write-Host "  ERROR $code en $Method $Path : $_" -ForegroundColor Red
        exit 1
    }
}

# ── 1. Leer compose base ──────────────────────────────────────────────────────
$composeFile = Join-Path $PSScriptRoot "docker-compose.server.yml"
if (-not (Test-Path $composeFile)) { Write-Host "No se encuentra $composeFile" -ForegroundColor Red; exit 1 }
$composeBase = Get-Content $composeFile -Raw

# ── 2. Leer .env local y construir bloque environment ─────────────────────────
$envFile = Join-Path $PSScriptRoot "docker\.env"
if (-not (Test-Path $envFile)) { Write-Host "No se encuentra $envFile" -ForegroundColor Red; exit 1 }

$envLines = [System.Collections.Generic.List[string]]::new()
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line -match '^([^=]+)=(.*)$') {
        $key = $Matches[1].Trim()
        $val = $Matches[2].Trim().Trim("'").Trim('"')
        $envLines.Add("      - ${key}=${val}")
    }
}

Write-Host "  Variables leidas del .env local: $($envLines.Count)" -ForegroundColor DarkGray

$envBlock = "    environment:`n" + ($envLines -join "`n")

# Insertar el bloque environment justo antes de "    volumes:"
if ($composeBase -notmatch '(?m)^\s+environment:') {
    $composeYaml = $composeBase -replace '(?m)^(    volumes:)', "$envBlock`n`$1"
} else {
    # Si ya existe environment: en el compose, lo reemplazamos
    $composeYaml = $composeBase -replace '(?ms)^    environment:.*?(?=\n    \w)', "$envBlock`n"
}

# ── 3. Autenticar en Portainer ────────────────────────────────────────────────
Write-Host "`n==> Autenticando en Portainer" -ForegroundColor Cyan
$jwt = (Invoke-P POST "/api/auth" -Body @{ username=$PortainerUser; password=$Pass }).jwt
$h   = @{ Authorization = "Bearer $jwt" }
Write-Host "  JWT OK"

# ── 4. Eliminar stack existente si hay ────────────────────────────────────────
Write-Host "`n==> Buscando stack '$StackName'" -ForegroundColor Cyan
$stacks   = Invoke-P GET "/api/stacks" -Headers $h
$existing = $stacks | Where-Object { $_.Name -eq $StackName }
if ($existing) {
    Write-Host "  Encontrado stack ID $($existing.Id) — eliminando"
    try {
        Invoke-P DELETE "/api/stacks/$($existing.Id)?endpointId=$EndpointId" -Headers $h | Out-Null
        Write-Host "  Stack eliminado"
    } catch {
        Write-Host "  Aviso: no se pudo eliminar stack (puede que ya no exista)" -ForegroundColor Yellow
    }
    Start-Sleep 3
}

# Eliminar contenedor huerfano si existe
$filters    = [uri]::EscapeDataString('{"name":["/' + $StackName + '"]}')
$containers = Invoke-P GET "/api/endpoints/$EndpointId/docker/containers/json?all=true&filters=$filters" -Headers $h
if ($containers -and $containers.Count -gt 0) {
    $cid = $containers[0].Id
    Write-Host "  Contenedor huerfano $($cid.Substring(0,12)) — parando y eliminando"
    try { Invoke-P POST "/api/endpoints/$EndpointId/docker/containers/$cid/stop" -Headers $h | Out-Null } catch {}
    Invoke-P DELETE "/api/endpoints/$EndpointId/docker/containers/$($cid)?v=false" -Headers $h | Out-Null
    Start-Sleep 2
}

# ── 5. Crear stack ─────────────────────────────────────────────────────────────
Write-Host "`n==> Creando stack '$StackName'" -ForegroundColor Cyan
$body   = @{
    name             = $StackName
    stackFileContent = $composeYaml
    env              = @()
}
$result = Invoke-P POST "/api/stacks/create/standalone/string?endpointId=$EndpointId" -Headers $h -Body $body
Write-Host "  Stack creado: ID $($result.Id)" -ForegroundColor Green

# ── 6. Esperar y verificar estado del contenedor ──────────────────────────────
Write-Host "`n==> Esperando que arranque el contenedor (15s)..." -ForegroundColor Cyan
Start-Sleep 15

$filters    = [uri]::EscapeDataString('{"name":["/' + $StackName + '"]}')
$containers = Invoke-P GET "/api/endpoints/$EndpointId/docker/containers/json?all=true&filters=$filters" -Headers $h
if ($containers -and $containers.Count -gt 0) {
    $c = $containers[0]
    Write-Host "  Contenedor: $($c.Id.Substring(0,12))  Estado: $($c.State)  Status: $($c.Status)" -ForegroundColor $(if ($c.State -eq 'running') {'Green'} else {'Yellow'})

    Write-Host "`n==> Ultimas lineas de log:" -ForegroundColor Cyan
    $logs = Invoke-RestMethod -Method GET `
        -Uri "$PortainerUrl/api/endpoints/$EndpointId/docker/containers/$($c.Id)/logs?stdout=true&stderr=true&tail=20&timestamps=false" `
        -Headers $h -SkipCertificateCheck
    Write-Host $logs
} else {
    Write-Host "  No se encontro el contenedor" -ForegroundColor Red
}

Write-Host "`n✔  Hecho. Accede en http://10.0.0.69:3001" -ForegroundColor Green
