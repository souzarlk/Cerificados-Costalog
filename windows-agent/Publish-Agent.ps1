$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$dist = Join-Path $root "dist"
$projects = @(
  @{ Name = "Service"; Path = Join-Path $root "Costalog.Agent.Service/Costalog.Agent.Service.csproj" },
  @{ Name = "Setup"; Path = Join-Path $root "Costalog.Agent.Setup/Costalog.Agent.Setup.csproj" },
  @{ Name = "NativeHost"; Path = Join-Path $root "Costalog.Agent.NativeHost/Costalog.Agent.NativeHost.csproj" }
)

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw "Instale o .NET 8 SDK antes de compilar o AGENTE COSTALOG."
}
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dist | Out-Null

foreach ($project in $projects) {
  $target = Join-Path $dist $project.Name
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Write-Host "Publicando $($project.Name)..."
  & dotnet publish $project.Path -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $target
  if ($LASTEXITCODE -ne 0) { throw "Falha ao publicar $($project.Name)." }
}

$extensionOut = Join-Path $dist "BrowserExtension"
New-Item -ItemType Directory -Force -Path $extensionOut | Out-Null
Copy-Item (Join-Path $root "../browser-extension/*") $extensionOut -Recurse -Force
$keyFile = Join-Path $root "policy-public.pem"
if (Test-Path $keyFile) {
  Copy-Item $keyFile (Join-Path $dist "Setup/policy-public.pem") -Force
}
Write-Host "Publicação concluída em: $dist"
Write-Host "Coloque a chave pública da API em windows-agent/policy-public.pem e publique novamente antes da instalação."
