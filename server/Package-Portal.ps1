param(
  [string]$Destination = (Join-Path $PSScriptRoot "dist/portal"),
  [string]$ApiBaseUrl = ""
)
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
$excludedDirectories = @(".git",".github","server","windows-agent","browser-extension","api-contract","security","node_modules")
$excludedFiles = @("*.md",".gitignore",".env",".env.*","*.pem","*.key","*.crx","*.log","*.sql","package.json")

if ($ApiBaseUrl) {
  $apiUri = $null
  if (-not [Uri]::TryCreate($ApiBaseUrl,[UriKind]::Absolute,[ref]$apiUri) -or $apiUri.Scheme -ne "https" -or $apiUri.AbsolutePath -ne "/" -or $apiUri.Query -or $apiUri.Fragment) {
    throw "ApiBaseUrl deve ser uma origem HTTPS, sem caminho, query ou fragmento."
  }
  $ApiBaseUrl = $apiUri.GetLeftPart([UriPartial]::Authority).TrimEnd("/")
}

if (Test-Path $destinationPath) { Remove-Item $destinationPath -Recurse -Force }
New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null

Get-ChildItem -LiteralPath $repoRoot -Force | ForEach-Object {
  $item = $_
  if ($item.PSIsContainer) {
    if ($excludedDirectories -contains $item.Name) { return }
    Copy-Item -LiteralPath $item.FullName -Destination $destinationPath -Recurse -Force
  } else {
    if ($excludedFiles | Where-Object { $item.Name -like $_ }) { return }
    Copy-Item -LiteralPath $item.FullName -Destination $destinationPath -Force
  }
}

$configPath = Join-Path $destinationPath "agente-costalog-config.js"
if (-not (Test-Path $configPath)) { throw "agente-costalog-config.js não foi incluído no pacote." }
$config = Get-Content -LiteralPath $configPath -Raw
if ($ApiBaseUrl) {
  $config = [regex]::Replace($config,'apiBaseUrl:\s*"[^"]*"','apiBaseUrl: "' + $ApiBaseUrl + '"')
  Set-Content -LiteralPath $configPath -Value $config -Encoding UTF8
  Write-Host "API configurada no pacote exportado: $ApiBaseUrl"
} else {
  Write-Warning "ApiBaseUrl não informado. O pacote permanecerá em modo local de rascunho até a TI configurar o endpoint HTTPS."
}

Write-Host ""
Write-Host "Portal AGENTE COSTALOG/Certificados preparado em:"
Write-Host $destinationPath
Write-Host "O backend e as credenciais não foram copiados para a pasta pública."
