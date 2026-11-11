# AGENTE COSTALOG — API corporativa

API para hospedar no servidor da Costalog. O portal web e o agente Windows consomem esta API; **somente o servidor acessa o banco**.

## Requisitos

- Node.js 20 ou superior (recomendado Node.js 22 LTS).
- MariaDB 10.6 ou superior (CI validado com MariaDB 11.4).
- HTTPS via proxy reverso (IIS, Nginx ou infraestrutura corporativa).
- Uma origem web autorizada configurada em `ALLOWED_ORIGINS`.

A API é a única camada que acessa o banco. Nesta versão, o banco oficial de referência é MariaDB, usando `mysql2` em `src/db.js` e tabelas InnoDB/utf8mb4. O contrato REST e as telas permanecem isolados do SQL. O banco nunca deve ficar exposto à internet.

Para implantação em Windows Server, consulte `WINDOWS-SERVER-DEPLOYMENT.md`.

## Preparação no servidor

### Opção recomendada: Docker Compose

1. Copie a pasta `server/` para o servidor da empresa.
2. Na pasta `server/`, copie `.env.example` para `.env` e substitua todos os valores `CHANGE_ME`/`REPLACE_*` por segredos aleatórios guardados pela TI. Configure `DB_PASSWORD` e `MARIADB_ROOT_PASSWORD` com senhas diferentes.
3. A senha `DB_PASSWORD` será usada pelo usuário restrito da aplicação; `MARIADB_ROOT_PASSWORD` será usada somente para administração do container.
4. Execute `docker compose up -d mariadb` e aguarde o MariaDB ficar saudável.
5. Execute `docker compose build api`.
6. Execute `docker compose run --rm api npm run db:migrate`.
7. Execute `docker compose run --rm api npm run db:smoke` para testar a conexão e as operações críticas do MariaDB.
8. Confirme que `CENTRAL_ADMIN_AUTH_SECRET` contém exatamente o mesmo valor privado de `ADMIN_AUTH_SECRET` configurado no Render da Central de Notas Fiscais.
9. Execute `docker compose up -d api`.
10. Configure IIS/Nginx/proxy corporativo para encaminhar HTTPS para `127.0.0.1:8080`; não exponha a porta 8080 nem a porta 3306 do MariaDB à internet.

### Execução direta com Node.js

1. Copie a pasta `server/` para o servidor da empresa.
2. Crie um banco MariaDB e um usuário exclusivo para o AGENTE COSTALOG, com permissões mínimas.
3. Copie `.env.example` para `.env` e preencha os valores reais fora do Git.
4. Configure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `CENTRAL_ADMIN_AUTH_SECRET`, `ALLOWED_ORIGINS` e as chaves de assinatura.
5. Instale dependências com `npm install` (o arquivo de lock será gerado no servidor).
6. Execute `npm run db:migrate` e depois `npm run db:smoke`. Em Docker Compose, a API usa o hostname `mariadb` na rede interna; fora do Docker, `DB_HOST` deve apontar para o endereço privado do MariaDB da empresa.
7. Configure `CENTRAL_ADMIN_AUTH_SECRET` com o mesmo valor de `ADMIN_AUTH_SECRET` da API da Central de Notas Fiscais.
8. Inicie com `npm start` e coloque um proxy HTTPS corporativo na frente.
9. Restrinja a porta do banco à rede/host da API. O banco não deve ser publicado.

## Chaves de assinatura

Execute `npm run keys:generate` em ambiente seguro. Guarde `POLICY_SIGNING_PRIVATE_KEY_B64` em cofre de segredos do servidor. A chave pública correspondente será configurada no agente Windows. **Nunca versione a chave privada.** Planeje rotação com identificador de chave e período de sobreposição.

## Variáveis obrigatórias

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: conexão MariaDB privada.
- `JWT_SECRET`: segredo aleatório com no mínimo 32 caracteres (compatibilidade de tokens locais legados).
- `CENTRAL_ADMIN_AUTH_SECRET`: o mesmo segredo `ADMIN_AUTH_SECRET` da API Central de Notas Fiscais, armazenado somente no ambiente privado da API do agente.
- `POLICY_SIGNING_PRIVATE_KEY_B64`: chave RSA privada em PEM codificada em Base64.
- `POLICY_SIGNING_KEY_ID`: identificador público da chave.
- `ALLOWED_ORIGINS`: origens exatas do portal.
- `DB_SSL=true`: habilita TLS validado para conexão com MariaDB quando suportado pelo servidor.
- `TRUST_PROXY=true`: somente quando a API estiver atrás de proxy reverso confiável e a porta da API estiver restrita a loopback/rede privada.

## Autenticação

O painel usa o mesmo usuário e senha da Central de Notas Fiscais Costalog. O navegador autentica em `/api/auth/login` da Central Fiscal e recebe o token HMAC-SHA256 de 12 horas; a API do AGENTE COSTALOG valida a assinatura com `CENTRAL_ADMIN_AUTH_SECRET`, que precisa ser idêntico ao `ADMIN_AUTH_SECRET` privado da Central. A API cria um identificador interno estável apenas para trilha de auditoria. Não existe um segundo usuário/senha do AGENTE. O painel compartilha a chave de sessão `costalog_admin_token` na `sessionStorage` com a Central de Notas Fiscais, permitindo abrir o AGENTE na mesma aba sem pedir as credenciais novamente. A sessão é validada novamente no endpoint `/api/auth/me`; não é gravada em `localStorage`. Ao cadastrar, remover, ativar ou desativar um site, a API cria automaticamente uma nova revisão assinada na mesma transação; os agentes buscam a revisão na sincronização seguinte (intervalo padrão de 45 segundos).

O acesso administrativo é centralizado na credencial única da Central de Notas Fiscais; não execute `npm run admin:create` para uso normal do painel.

O cadastro de dispositivos usa token de enrollment de uso único, criado em `POST /api/v1/admin/agent/enrollment-tokens`. O token do dispositivo é exibido somente uma vez e deverá ser protegido localmente pelo Windows Agent usando DPAPI e ACL.

## Endpoints

Veja `../api-contract/openapi.yaml` para o contrato completo.

- `GET /api/v1/health`
- `GET /api/v1/auth/me` (Bearer emitido pela Central de Notas Fiscais; login em `/api/auth/login` da Central)
- `GET/POST /api/v1/admin/agent/sites`
- `PATCH/DELETE /api/v1/admin/agent/sites/{siteId}`
- `GET /api/v1/admin/agent/devices`
- `PATCH /api/v1/admin/agent/devices/{deviceId}/status`
- `GET /api/v1/admin/agent/events?limit=50`
- `GET /api/v1/admin/agent/policy`, `POST /api/v1/admin/agent/policy/publish`
- `POST /api/v1/admin/agent/enrollment-tokens`
- `POST /api/v1/agent/enroll`, `POST /api/v1/agent/heartbeat`
- `GET /api/v1/agent/policy`, `POST /api/v1/agent/events`

## Alertas de bloqueio à TI

Configure SECURITY_ALERT_WEBHOOK_URL com um endpoint HTTPS de webhook aprovado pela empresa. Quando um agente reportar `browser_navigation_blocked`, o backend grava o evento e envia um POST JSON ao webhook. O agente sincroniza a fila local em ciclos de aproximadamente 45 segundos; portanto, a notificação depende desse ciclo e da disponibilidade do webhook. Se não estiver configurado, o registro permanece no banco, mas não há notificação externa imediata. Mantenha essa URL somente no ambiente do servidor.

## Importante

Os agentes consultam heartbeat e política a cada 45 segundos por padrão. O limite geral da API foi dimensionado para uma frota compartilhando o IP de saída; ajuste conforme quantidade real de máquinas e monitoramento.

O CI valida a migração e operações reais de transação, `SELECT FOR UPDATE`, JSON, `TIMESTAMPADD` e parâmetros preparados no MariaDB 11.4.

O backend registra e distribui políticas assinadas. Isso, sozinho, ainda não garante controle total de cada forma de uso de um certificado A1. O enforcement de TLS cliente, assinatura documental e upload de PFX tem fluxos distintos e precisa ser homologado nos portais reais. O modo de navegação restrita depende também da extensão de navegador gerenciada pela TI.
