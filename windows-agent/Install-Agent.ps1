#requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$serviceName = "CostalogAgent"
$displayName = "AGENTE COSTALOG"
$programRoot = Join-Path $env:ProgramFiles "Costalog/Agent"
$dataRoot = Join-Path $env:ProgramData "Costalog/Agent"
$privateRoot = Join-Path $dataRoot "Private"
$publicRoot = Join-Path $dataRoot "Public"
$pendingRoot = Join-Path $dataRoot "pending-events"
$dist = Join-Path $PSScriptRoot "dist"

function Add-ForcedExtension([string]$BrowserName, [string]$PolicyPath, [string]$ExtensionId, [string]$UpdateUrl) {
  New-Item -Path $PolicyPath -Force | Out-Null
  $existing = Get-ItemProperty -Path $PolicyPath -ErrorAction SilentlyContinue
  if ($existing) {
    foreach ($property in $existing.PSObject.Properties) {
      if ($property.Value -is [string] -and $property.Value.StartsWith("$ExtensionId;")) {
        Write-Host "$BrowserName já possui a extensão AGENTE COSTALOG configurada."
        return
      }
    }
  }
  $index = 1
  while ($true) {
    try { Get-ItemPropertyValue -Path $PolicyPath -Name "$index" -ErrorAction Stop | Out-Null; $index++ }
    catch { break }
  }
  New-ItemProperty -Path $PolicyPath -Name "$index" -Value "$ExtensionId;$UpdateUrl" -PropertyType String -Force | Out-Null
  Write-Host "Política de instalação forçada configurada para $BrowserName."
}

if (-not (Test-Path (Join-Path $dist "Service/Costalog.Agent.Service.exe"))) {
  throw "Arquivos compilados não encontrados. Execute Publish-Agent.ps1 primeiro."
}
New-Item -ItemType Directory -Force -Path $programRoot,$dataRoot,$privateRoot,$publicRoot,$pendingRoot | Out-Null
Copy-Item (Join-Path $dist "Service/*") $programRoot -Recurse -Force
Copy-Item (Join-Path $dist "Setup/*") $programRoot -Recurse -Force
Copy-Item (Join-Path $dist "NativeHost/*") $programRoot -Recurse -Force

$serviceExe = Join-Path $programRoot "Costalog.Agent.Service.exe"
$setupExe = Join-Path $programRoot "Costalog.Agent.Setup.exe"
$nativeHostExe = Join-Path $programRoot "Costalog.Agent.NativeHost.exe"

$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service) {
  Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
  & sc.exe delete $serviceName | Out-Null
  Start-Sleep -Seconds 2
}
$binPathArg = 'binPath= "' + $serviceExe + '"'
& sc.exe create $serviceName $binPathArg "start= auto" "obj= NT SERVICE\CostalogAgent" "DisplayName= $displayName" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Não foi possível criar o serviço Windows." }
& sc.exe sidtype $serviceName unrestricted | Out-Null

Write-Host ""
Write-Host "O assistente solicitará servidor, opção A/B, código de instalação e chave pública."
& $setupExe
if ($LASTEXITCODE -ne 0) {
  & sc.exe delete $serviceName | Out-Null
  throw "Configuração cancelada ou inválida."
}

$configPath = Join-Path $privateRoot "agent.json"
if (-not (Test-Path $configPath)) { throw "Arquivo de configuração não foi criado." }
$config = Get-Content $configPath -Raw | ConvertFrom-Json

# Raiz apenas para navegação; segredos ficam isolados em Private.
& icacls $dataRoot /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "NT SERVICE\CostalogAgent:(OI)(CI)M" "BUILTIN\Users:RX" | Out-Null
& icacls $privateRoot /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "NT SERVICE\CostalogAgent:(OI)(CI)M" | Out-Null
& icacls $publicRoot /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "NT SERVICE\CostalogAgent:(OI)(CI)M" "BUILTIN\Users:(OI)(CI)RX" | Out-Null
& icacls $pendingRoot /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "NT SERVICE\CostalogAgent:(OI)(CI)M" "BUILTIN\Users:(OI)(CI)M" | Out-Null
& icacls $configPath /inheritance:r /grant:r "SYSTEM:F" "BUILTIN\Administrators:F" "NT SERVICE\CostalogAgent:F" | Out-Null

 $extensionId = ""
 $updateUrl = ""
if ($config.installMode -eq "certificate-and-web") {
  Write-Host ""
  Write-Warning "A Opção B necessita que a extensão corporativa CRX esteja publicada em HTTPS."
  $extensionId = (Read-Host "ID da extensão CRX (32 letras entre a-p)").Trim()
  if ($extensionId -notmatch '^[a-p]{32}$') { throw "ID da extensão inválido. Empacote e publique a extensão primeiro." }
  $updateUrl = (Read-Host "URL HTTPS do arquivo updates.xml hospedado pela empresa").Trim()
  if ($updateUrl -notmatch '^https://') { throw "O endereço updates.xml precisa usar HTTPS." }

  $manifestPath = Join-Path $dataRoot "native-host-manifest.json"
  $nativeManifest = @{
    name = "com.costalog.agent"
    description = "Native Messaging Host do AGENTE COSTALOG"
    path = $nativeHostExe
    type = "stdio"
    allowed_origins = @("chrome-extension://$extensionId/")
  }
  [System.IO.File]::WriteAllText($manifestPath, ($nativeManifest | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
  foreach ($registryPath in @(
    "HKLM:\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.costalog.agent",
    "HKLM:\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\com.costalog.agent"
  )) {
    New-Item -Path $registryPath -Force | Out-Null
    Set-Item -Path $registryPath -Value $manifestPath
  }

  Add-ForcedExtension "Google Chrome" "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist" $extensionId $updateUrl
  Add-ForcedExtension "Microsoft Edge" "HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist" $extensionId $updateUrl
}

$installInfo = @{ extensionId = $extensionId; updateUrl = $updateUrl; installMode = $config.installMode; installedAt = (Get-Date).ToUniversalTime().ToString("o") }
$installInfo | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $dataRoot "agent-install-info.json") -Encoding UTF8

Start-Service -Name $serviceName
Start-Sleep -Seconds 3
$state = Get-Service -Name $serviceName
if ($state.Status -ne "Running") { throw "O serviço AGENTE COSTALOG não iniciou. Consulte o Visualizador de Eventos." }

Write-Host ""
Write-Host "AGENTE COSTALOG instalado e serviço iniciado."
Write-Host "Computador: $env:COMPUTERNAME"
Write-Host "Modo: $($config.installMode)"
Write-Host "O cadastro remoto ocorrerá automaticamente com o código de uso único."
if ($config.installMode -eq "certificate") {
  Write-Warning "A Opção A ainda não possui bloqueio universal da chave privada. A integração criptográfica deve ser homologada antes de produção."
}
