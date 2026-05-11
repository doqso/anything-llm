#Requires -Version 7
param(
    [Parameter(Mandatory)][string]$Pass,
    [string]$PortainerUrl  = "https://10.0.0.69:9443",
    [int]$EndpointId       = 2,
    [string]$PortainerUser = "admin",
    [string]$Registry      = "10.0.0.69:5000"
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

Write-Host "`n==> Autenticando en Portainer" -ForegroundColor Cyan
$jwt = (Invoke-P POST "/api/auth" -Body @{ username=$PortainerUser; password=$Pass }).jwt
$h   = @{ Authorization = "Bearer $jwt" }
Write-Host "  JWT OK"

# Borrar contenedor anterior si existe
$filters  = [uri]::EscapeDataString('{"name":["/fix-daemon-config"]}')
$existing = Invoke-P GET "/api/endpoints/$EndpointId/docker/containers/json?all=true&filters=$filters" -Headers $h
if ($existing.Count -gt 0) {
    $oldId = $existing[0].Id
    Write-Host "  Eliminando contenedor anterior $($oldId.Substring(0,12))"
    try { Invoke-P POST "/api/endpoints/$EndpointId/docker/containers/$oldId/stop" -Headers $h | Out-Null } catch {}
    Invoke-P DELETE "/api/endpoints/$EndpointId/docker/containers/$($oldId)?v=false" -Headers $h | Out-Null
}

# Construir comando shell: escribe daemon.json y recarga dockerd con SIGHUP
# $Registry se expande en PowerShell; el resto es sh literal
$shellCmd = "mkdir -p /hostdocker && printf '{`"insecure-registries`":[`"$Registry`"]}' > /hostdocker/daemon.json && kill -HUP `$(pgrep -x dockerd) && echo `"OK: `$(cat /hostdocker/daemon.json)`""

Write-Host "`n==> Creando contenedor fix-daemon-config" -ForegroundColor Cyan
Write-Host "  Cmd: $shellCmd"

$createBody = @{
    Image      = "alpine"
    Cmd        = @("/bin/sh", "-c", $shellCmd)
    HostConfig = @{
        Binds      = @("/etc/docker:/hostdocker")
        Privileged = $true
        PidMode    = "host"
    }
}

$nc = Invoke-P POST "/api/endpoints/$EndpointId/docker/containers/create?name=fix-daemon-config" -Headers $h -Body $createBody
Write-Host "  Creado: $($nc.Id.Substring(0,12))" -ForegroundColor Green

Write-Host "`n==> Arrancando contenedor" -ForegroundColor Cyan
Invoke-P POST "/api/endpoints/$EndpointId/docker/containers/$($nc.Id)/start" -Headers $h | Out-Null
Start-Sleep 5

Write-Host "`n==> Logs del contenedor" -ForegroundColor Cyan
$logs = Invoke-RestMethod -Method GET `
    -Uri "$PortainerUrl/api/endpoints/$EndpointId/docker/containers/$($nc.Id)/logs?stdout=true&stderr=true&tail=30" `
    -Headers $h -SkipCertificateCheck
Write-Host $logs

Write-Host "`n✔  Hecho. Ahora vuelve a desplegar el stack en Portainer." -ForegroundColor Green
