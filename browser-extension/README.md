# Extensão gerenciada do AGENTE COSTALOG

Extensão Manifest V3 para Google Chrome e Microsoft Edge. Ela lê somente o estado de política validado pelo serviço Windows por Native Messaging.

## Comportamento

- **Opção A (certificate):** não bloqueia a navegação. A extensão remove suas regras de bloqueio. O serviço continua sincronizando políticas e auditando a instalação. Isso não bloqueia por si só o uso da chave privada em outros sites; a imposição da Opção A exige integração criptográfica específica e homologação dos fluxos reais de certificado.
- **Opção B (certificate-and-web):** bloqueia navegação de páginas HTTP/HTTPS (main_frame) por padrão e cria exceções HTTPS na porta padrão para cada hostname exato permitido na política local assinada. HTTP e portas não padrão continuam bloqueados. Domínios externos carregados como sub-recursos dentro de uma página permitida não são bloqueados por esta regra inicial.
- Se a política estiver ausente, expirada ou inválida, a extensão bloqueia navegação principal na Opção B. Na Opção A, ela não bloqueia a navegação.

A extensão deve ser instalada à força pela política corporativa do navegador. Instalação manual pelo usuário ou modo desenvolvedor não é uma garantia de proteção.

## Empacotamento corporativo

1. Em uma estação Windows com PowerShell 7 e Google Chrome, execute `windows-agent/Package-Extension.ps1`. Ele gera o CRX, calcula o ID da extensão e cria `updates.xml`.
2. Guarde `dist/ExtensionPackage/private/extension-signing.pem` em cofre institucional. Nunca publique essa chave ou a pasta `private`.
3. Execute `windows-agent/Publish-Agent.ps1` em máquina com .NET 8 SDK para compilar o serviço e o Native Host.
4. Hospede somente `agente-costalog.crx` e `updates.xml` em HTTPS no servidor da empresa, mantendo o mesmo ID e versão.
5. Durante a instalação, informe o ID e o URL do `updates.xml`; o script do agente registra o Native Messaging Host e força a instalação nos navegadores Chrome e Edge.

A chave privada de empacotamento da extensão e a chave privada de assinatura das políticas são coisas diferentes. Proteja ambas e mantenha backup institucional.

## Limitações

O bloqueio de navegação é aplicado a páginas principais no Chrome/Edge gerenciados. Não controla outros navegadores, aplicativos nativos, tráfego de API em background nem o upload manual de um PFX para qualquer programa. A Opção A ainda precisa de enforcement criptográfico validado para cada tipo de uso.
