# Extensão gerenciada do AGENTE COSTALOG

Extensão Manifest V3 para Google Chrome e Microsoft Edge. Ela lê somente o estado de política validado pelo serviço Windows por Native Messaging.

## Comportamento

- **Opção A (certificate):** não bloqueia a navegação. A extensão remove suas regras de bloqueio. O serviço continua sincronizando políticas e auditando a instalação. Isso não bloqueia por si só o uso da chave privada em outros sites; a imposição da Opção A exige integração criptográfica específica e homologação dos fluxos reais de certificado.
- **Opção B (certificate-and-web):** bloqueia navegação de páginas HTTP/HTTPS (main_frame) por padrão e cria exceções para cada hostname permitido na política local assinada. Domínios externos carregados como sub-recursos dentro de uma página permitida não são bloqueados por esta regra inicial.
- Se a política estiver ausente, expirada ou inválida, a extensão bloqueia navegação principal na Opção B. Na Opção A, ela não bloqueia a navegação.

A extensão deve ser instalada à força pela política corporativa do navegador. Instalação manual pelo usuário ou modo desenvolvedor não é uma garantia de proteção.

## Empacotamento corporativo

1. Execute windows-agent/Publish-Agent.ps1 em uma máquina com .NET 8 SDK para compilar o serviço e o Native Host.
2. Empacote esta pasta como CRX em estação administrativa usando Chrome --pack-extension e uma chave privada de extensão mantida pela TI. Nunca publique o arquivo PEM privado.
3. Hospede o CRX e updates.xml em HTTPS no servidor da empresa, mantendo o mesmo ID e versão.
4. Configure appid no updates.xml com o ID gerado.
5. Na instalação do agente, informe o ID e o update URL para registrar a extensão nas políticas do Chrome e do Edge.
6. A política do navegador forçará a extensão e o Native Messaging Host autorizado.

A chave privada de empacotamento da extensão e a chave privada de assinatura das políticas são coisas diferentes. Proteja ambas e mantenha backup institucional.

## Limitações

O bloqueio de navegação é aplicado a páginas principais no Chrome/Edge gerenciados. Não controla outros navegadores, aplicativos nativos, tráfego de API em background nem o upload manual de um PFX para qualquer programa. A Opção A ainda precisa de enforcement criptográfico validado para cada tipo de uso.
