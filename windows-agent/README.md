# AGENTE COSTALOG — componente Windows

Este diretório contém a primeira implementação do agente Windows: serviço de sincronização, assistente de instalação e Native Messaging Host para Chrome/Edge. O serviço faz enrollment de uso único, protege o token do dispositivo com DPAPI, consulta a API, verifica assinatura RSA da política e publica um estado local somente após validação.

## Compilar

Em uma estação administrativa com .NET 8 SDK e Windows PowerShell:

~~~powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Publish-Agent.ps1
~~~

Os binários ficam em dist/. A publicação é self-contained para Windows x64.

## Preparar a chave pública

1. No servidor seguro, execute npm run keys:generate dentro da pasta server.
2. Guarde POLICY_SIGNING_PRIVATE_KEY_B64 em cofre de segredos do servidor.
3. Copie apenas a chave pública PEM para policy-public.pem neste diretório.
4. Execute Publish-Agent.ps1 novamente para incluir a chave pública no pacote de instalação.

A chave privada nunca deve entrar no pacote Windows ou no Git.

## Instalação em cada computador

1. No painel AGENTE COSTALOG, gere um código de instalação de uso único.
2. Execute Install-Agent.ps1 como administrador no computador Windows.
3. Informe o endereço HTTPS da API, selecione Opção A ou B, cole o código e confirme a chave pública.
4. O serviço será cadastrado automaticamente na API e passará a enviar heartbeat e buscar políticas a cada 45 segundos.

## O que já faz

- Serviço Windows com inicialização automática.
- Cadastro do computador mediante token de uso único.
- Token exclusivo por dispositivo, armazenado localmente com DPAPI LocalMachine.
- Segredos em `ProgramData\Costalog\Agent\Private`, protegidos por ACL para SYSTEM, Administradores e serviço.
- Estado público da política em `Public`, somente leitura para usuários; fila de eventos em pasta separada com permissões de gravação necessárias para o Native Host.
- Heartbeat, sincronização e verificação de assinatura RSA.
- Expiração da política e bloqueio preventivo de navegação na Opção B quando o estado local estiver ausente, inválido ou expirado.
- Eventos de falha de sincronização enviados à API, com limitação de repetição.

## Diferença entre os modos

- Opção A mantém a navegação normal sem restrição. O serviço sincroniza política e mantém a identidade do dispositivo, mas isso ainda não impede de forma universal que um programa use uma chave A1 fora dos destinos permitidos. Para esse bloqueio é necessário um provedor criptográfico gerenciado e homologação dos fluxos reais dos portais (mTLS, assinatura documental, aplicações nativas e upload de PFX). Não distribuir como bloqueio efetivo da chave até concluir essa camada.
- Opção B força a extensão corporativa de navegação no Chrome e Edge. A extensão bloqueia navegação principal para domínios fora da allowlist, por padrão. Sub-recursos e outros aplicativos não são bloqueados por esta primeira versão.

## Pré-requisitos de Opção B

1. Em uma estação Windows com Google Chrome, execute `Package-Extension.ps1`. O script gera o CRX, o ID da extensão e o updates.xml.
2. Guarde a chave extension-signing.pem em cofre institucional. Ela não pode ser publicada no servidor web nem commitada no Git.
3. Empacotar a extensão browser-extension como CRX com uma chave da TI.
- Hospedar CRX e updates.xml em HTTPS no servidor da empresa.
- Atualizar o appid e URL no updates.xml.
- Durante a instalação, informar ID da extensão e URL updates.xml. O script registra o Native Messaging Host e políticas de instalação forçada no Chrome e Edge.

## Remoção

Execute `Uninstall-Agent.ps1` como administrador. O script para e remove o serviço, retira as políticas da extensão gerenciada e pergunta se deve apagar os dados locais. O registro remoto deve ser revogado pela TI no painel.

## Limites e homologação

Esta primeira versão do agente é um componente real de cadastro/sincronização/verificação de política; ainda não representa uma solução completa de proteção criptográfica de A1. A extensão protege somente navegação principal nos navegadores gerenciados. Não impede upload do mesmo PFX para outro programa, uso em outro computador ou cópia que já tenha sido exportada. Testar primeiro em um PC piloto e com portais reais da Costalog.
