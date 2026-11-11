#requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$serviceName = "CostalogAgent"
$programRoot = Join-Path $env:ProgramFiles "Costalog/Agent"
$dataRoot = Join-Path $env:ProgramData "Costalog/Agent"
$installInfoPath = Join-Path $dataRoot "agent-install-info.json"

$info = $null
if (Test-Path $installInfoPath) {
  try { $info = Get-Content $installInfoPath -Raw | ConvertFrom-Json } catch {}
}

Write-Warning "A remoção interrompe a sincronização e deixa de aplicar políticas do AGENTE COSTALOG neste computador."
$confirm = Read-Host "Digite REMOVER para continuar"
if ($confirm -cne "REMOVER") {
  Write-Host "Operação cancelada."
  exit 0
}

Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
& sc.exe delete $serviceName | Out-Null
Start-Sleep -Seconds 2

if ($info -and $info.extensionId) {
  foreach ($policyPath in @(
    "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist",
    "HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist"
  )) {
    if (Test-Path $policyPath) {
      $properties = Get-ItemProperty -Path $policyPath
      foreach ($property in $properties.PSObject.Properties) {
        if ($property.Value -is [string] -and $property.Value.StartsWith("$($info.extensionId);")) {
          Remove-ItemProperty -Path $policyPath -Name $property.Name -ErrorAction SilentlyContinue
        }
      }
    }
  }
  foreach ($registryPath in @(
    "HKLM:\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.costalog.agent",
    "HKLM:\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\com.costalog.agent"
  )) {
    Remove-Item -Path $registryPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Remove-Item -Path $programRoot -Recurse -Force -ErrorAction SilentlyContinue
$removeData = Read-Host "Deseja excluir também o cadastro local, a fila de eventos e o token protegido? (S/N)"
if ($removeData -match '^(S|SIM)$') {
  Remove-Item -Path $dataRoot -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Dados locais removidos. O registro remoto do dispositivo continua no histórico administrativo até a TI revogá-lo."
} else {
  Write-Host "Dados locais preservados em $dataRoot. A TI pode revogar o dispositivo no painel."
}

Write-Host "AGENTE COSTALOG removido deste computador."
