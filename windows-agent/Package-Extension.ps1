param(
  [string]$SourceDirectory = (Join-Path $PSScriptRoot "..\browser-extension"),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "dist\ExtensionPackage"),
  [string]$ChromePath = "",
  [string]$PrivateKeyPath = "",
  [string]$UpdateBaseUrl = "https://HOST-INTERNO/agent-extension"
)
$ErrorActionPreference = "Stop"

if (-not $ChromePath) {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
  )
  $ChromePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $ChromePath -or -not (Test-Path $ChromePath)) {
  throw "Google Chrome não encontrado. Informe -ChromePath."
}
if (-not (Test-Path (Join-Path $SourceDirectory "manifest.json"))) {
  throw "manifest.json da extensão não encontrado em $SourceDirectory."
}

if (Test-Path $OutputDirectory) { Remove-Item $OutputDirectory -Recurse -Force }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$staging = Join-Path $OutputDirectory "extension-source"
New-Item -ItemType Directory -Force -Path $staging | Out-Null
Copy-Item (Join-Path $SourceDirectory "*") $staging -Recurse -Force

$manifest = Get-Content (Join-Path $staging "manifest.json") -Raw | ConvertFrom-Json
$stagingCrx = "$staging.crx"
$stagingKey = ""
if ($PrivateKeyPath) {
  if (-not (Test-Path $PrivateKeyPath)) { throw "Chave privada da extensão não encontrada: $PrivateKeyPath" }
  $stagingKey = Join-Path $OutputDirectory "extension-signing.pem"
  Copy-Item $PrivateKeyPath $stagingKey -Force
  & $ChromePath "--pack-extension=$staging" "--pack-extension-key=$stagingKey"
} else {
  Write-Warning "Será criada uma nova chave privada de extensão. Guarde-a fora do servidor público e faça backup institucional."
  & $ChromePath "--pack-extension=$staging"
  $candidateKey = "$staging.pem"
  if (Test-Path $candidateKey) {
    $stagingKey = Join-Path $OutputDirectory "extension-signing.pem"
    Move-Item $candidateKey $stagingKey -Force
  }
}
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $stagingCrx)) {
  throw "Chrome não conseguiu empacotar a extensão."
}
if (-not $stagingKey -or -not (Test-Path $stagingKey)) {
  throw "A chave privada de empacotamento não foi localizada. Não publique um CRX sem guardar a chave."
}

# O ID do Chrome é derivado dos primeiros 16 bytes do SHA-256 do SubjectPublicKeyInfo.
$rsa = [System.Security.Cryptography.RSA]::Create()
try {
  $pem = Get-Content $stagingKey -Raw
  $rsa.ImportFromPem($pem)
  $spki = $rsa.ExportSubjectPublicKeyInfo()
  $digest = [System.Security.Cryptography.SHA256]::HashData($spki)
  $alphabet = "abcdefghijklmnop"
  $builder = [System.Text.StringBuilder]::new()
  for ($i = 0; $i -lt 16; $i++) {
    [void]$builder.Append($alphabet[[int]($digest[$i] -shr 4)])
    [void]$builder.Append($alphabet[[int]($digest[$i] -band 15)])
  }
  $extensionId = $builder.ToString()
} finally { $rsa.Dispose() }

$crxOut = Join-Path $OutputDirectory "agente-costalog.crx"
Copy-Item $stagingCrx $crxOut -Force
$updateUrl = $UpdateBaseUrl.TrimEnd("/") + "/updates.xml"
$crxUrl = $UpdateBaseUrl.TrimEnd("/") + "/agente-costalog.crx"
$xml = @"
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="$extensionId">
    <updatecheck codebase="$crxUrl" version="$($manifest.version)" />
  </app>
</gupdate>
"@
Set-Content -Path (Join-Path $OutputDirectory "updates.xml") -Value $xml -Encoding UTF8

Write-Host ""
Write-Host "Empacotamento concluído."
Write-Host "ID da extensão: $extensionId"
Write-Host "CRX: $crxOut"
Write-Host "Manifesto de atualização: $(Join-Path $OutputDirectory 'updates.xml')"
Write-Host "URL a informar na instalação: $updateUrl"
Write-Host "CHAVE PRIVADA: $stagingKey"
Write-Warning "Não publique extension-signing.pem no servidor web. Guarde-a em cofre institucional; perder esta chave exige reinstalar a extensão com outro ID."
