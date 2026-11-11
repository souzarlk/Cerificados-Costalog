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
2. **API autenticada:** única autoridade para políticas, permissões e auditoria. O navegador não será fonte de verdade para papéis ou permissões.
3. **Banco de dados:** metadados, políticas, dispositivos, usuários e eventos. Nunca armazenar senha de PFX em texto puro.
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
- [ ] Definir backend e ambiente de hospedagem.
- [x] Criar primeira interface do módulo AGENTE COSTALOG no portal (rascunho local, sem sincronização ou enforcement).
- [ ] Implementar autenticação real, papéis e API.
- [ ] Migrar metadados e auditoria para banco de dados.
- [ ] Remover armazenamento de PFX/senhas do localStorage e desativar download direto para usuários comuns.
- [ ] Criar cadastro de dispositivos e políticas de allowlist.
- [ ] Desenvolver e assinar o agente Windows e o provedor de chave com enforcement real.
- [ ] Integrar alertas imediatos ao TI.
- [ ] Executar piloto, testes de bypass e homologação antes da distribuição geral.
