# Certificados Costalog — plano de segurança

## Decisões aprovadas
- Política de domínio: negar por padrão; permitir somente destinos cadastrados explicitamente.
- Tentativas negadas: bloquear, registrar evento e gerar alerta imediato para o TI.
- Certificados A1: instalados nos computadores Windows.
- Navegadores contemplados: Google Chrome e Microsoft Edge.

## Estado atual do portal
A versão publicada é um front-end estático. O código atual mantém dados no armazenamento local do navegador e contém credenciais de acesso no JavaScript/README. O arquivo PFX/P12 e a senha também são tratados pelo navegador. Isso não constitui um cofre seguro nem uma política de uso por domínio.

**Não cadastrar certificados A1 reais na versão atual.** Antes de produção, será necessário migrar autenticação, dados e auditoria para serviços confiáveis e remover os segredos do código público.

## Arquitetura-alvo
1. **Portal administrativo:** cadastro e gestão de certificados, dispositivos, usuários, domínios autorizados, políticas e eventos.
2. **API autenticada no servidor Costalog:** única autoridade para políticas, permissões e auditoria. O portal conversa com ela por HTTPS; o navegador não será fonte de verdade para papéis ou permissões.
3. **Banco de dados no servidor da empresa:** a implementação de referência usa MariaDB/InnoDB. Se a infraestrutura escolher outro fornecedor, adaptar driver, repositórios/consultas e migrações no backend; portal e contrato REST permanecem estáveis. Nunca armazenar senha de PFX em texto puro.
4. **Windows Agent:** serviço instalado e gerenciado nos computadores; identifica o dispositivo, recebe políticas assinadas e registra eventos.
5. **Chave privada:** permanece no Windows sob controle de um provedor criptográfico/serviço de assinatura com autorização. ACLs e políticas do navegador, isoladamente, não garantem bloqueio por domínio.
6. **Chrome e Edge:** aplicar políticas corporativas como camada complementar; não considerar seleção automática de certificado como mecanismo de bloqueio absoluto.

## Regra de autorização
Uma operação só poderá ser autorizada quando:
- o dispositivo estiver cadastrado e ativo;
- o certificado estiver ativo e associado ao dispositivo/usuário autorizado;
- o destino corresponder a uma entrada explícita da allowlist;
- a política recebida estiver válida e atualizada;
- o mecanismo criptográfico conseguir impor a decisão antes de usar a chave privada.

Caso contrário: negar, registrar motivo, horário, dispositivo, usuário, certificado (identificador não secreto), domínio e aplicação; emitir alerta imediato ao TI.

## Limites importantes
- Um PFX/P12 que já tenha sido copiado e cuja senha seja conhecida pode continuar sendo usado fora deste sistema. A implantação precisa controlar a chave gerenciada e tratar cópias anteriores.
- Portais podem usar certificado cliente TLS, assinatura de documentos, aplicações nativas ou upload de PFX. São fluxos diferentes e precisam ser testados individualmente.
- Domínios autorizados devem ser cadastrados com precisão, incluindo subdomínios e destinos auxiliares necessários. Evitar curingas amplos.
- A primeira validação deve ocorrer em um computador piloto e com portais reais aprovados pela Costalog.

## Etapas de implementação
- [x] Registrar as decisões e a arquitetura em branch separada.
- [ ] Definir e disponibilizar o host HTTPS da API no servidor da empresa (o banco permanece atrás da API).
- [x] Criar painel AGENTE COSTALOG integrado à API, com rascunho local somente para desenvolvimento.
- [x] Criar cliente REST e ponto único de configuração do endereço da API corporativa.
- [x] Documentar contrato OpenAPI e arquitetura de persistência independente do banco.
- [x] Separar modo local de rascunho do modo API; falhas da API não recorrem a dados locais.
- [x] Implementar autenticação inicial por e-mail/senha com bcrypt e JWT de curta duração; integração OIDC/SSO permanece pendente.
- [x] Desenvolver endpoints iniciais da API corporativa; hospedagem no servidor da Costalog permanece pendente.
- [x] Criar schema inicial e adaptador MariaDB/InnoDB; conectar ao MariaDB definitivo do servidor permanece pendente.
- [ ] Remover armazenamento de PFX/senhas do localStorage e desativar download direto para usuários comuns.
- [x] Criar cadastro de sites, dispositivos, tokens de enrollment e publicação de política assinada.
- [x] Criar serviço Windows de sincronização, assistente A/B, Native Messaging Host e extensão Chrome/Edge para bloqueio de navegação principal na Opção B.
- [ ] Implementar e homologar provedor criptográfico CNG/KSP para impedir o uso da chave privada A1 fora dos destinos autorizados na Opção A.
- [x] Criar integração webhook HTTPS opcional para eventos de bloqueio; endpoint corporativo de alertas precisa ser configurado.
- [ ] Executar piloto, testes de bypass e homologação antes da distribuição geral.
