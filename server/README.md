# AGENTE COSTALOG — API corporativa

API para hospedar no servidor da Costalog. O portal web e o agente Windows consomem esta API; **somente o servidor acessa o banco**.

## Requisitos

- Node.js 20 ou superior (recomendado Node.js 22 LTS).
- PostgreSQL 14 ou superior nesta primeira implementação.
- HTTPS via proxy reverso (IIS, Nginx ou infraestrutura corporativa).
- Uma origem web autorizada configurada em `ALLOWED_ORIGINS`.

A API é a única camada que acessa o banco. Nesta primeira versão foi implementado PostgreSQL em `src/db.js` e as consultas/migrações usam SQL compatível com PostgreSQL. Se a infraestrutura decidir utilizar SQL Server, MariaDB ou outro banco, o backend precisará receber o driver, repositórios/consultas e migrações específicos; o contrato REST e as telas não precisam mudar. O banco nunca deve ficar exposto à internet.

Para implantação em Windows Server, consulte `WINDOWS-SERVER-DEPLOYMENT.md`.

## Preparação no servidor

### Opção recomendada: Docker Compose

1. Copie a pasta `server/` para o servidor da empresa.
2. Na pasta `server/`, copie `.env.example` para `.env` e substitua todos os valores `CHANGE_ME`/`REPLACE_*` por segredos aleatórios guardados pela TI.
3. Confirme que `POSTGRES_PASSWORD` e a senha embutida em `DATABASE_URL` são iguais; para senhas com caracteres especiais, codifique-os para URL.
4. Execute `docker compose up -d db` e aguarde o Postgres ficar saudável.
5. Execute `docker compose build api`.
6. Execute `docker compose run --rm api npm run db:migrate`.
7. Execute `docker compose run --rm api npm run admin:create` para criar o primeiro administrador. Defina uma senha forte com pelo menos 14 caracteres.
8. Execute `docker compose up -d api`.
9. Configure IIS/Nginx/proxy corporativo para encaminhar HTTPS para `127.0.0.1:8080`; não exponha a porta 8080 nem a porta do PostgreSQL à internet.

### Execução direta com Node.js

1. Copie a pasta `server/` para o servidor da empresa.
2. Crie um banco e usuário exclusivos para o AGENTE COSTALOG, com permissões mínimas.
3. Copie `.env.example` para `.env` e preencha os valores reais fora do Git.
4. Configure `DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS` e as chaves de assinatura.
5. Instale dependências com `npm install` (o arquivo de lock será gerado no servidor).
6. Execute `npm run db:migrate`. Em Docker Compose, a API usa o hostname `db` na rede interna do Compose; fora do Docker, ajuste `DATABASE_URL` para o endereço privado do PostgreSQL da empresa.
7. Execute `npm run admin:create` para criar o primeiro administrador. Use senha forte e não a reutilize.
8. Inicie com `npm start` e coloque um proxy HTTPS corporativo na frente.
9. Restrinja a porta do banco à rede/host da API. O banco não deve ser publicado.

## Chaves de assinatura

Execute `npm run keys:generate` em ambiente seguro. Guarde `POLICY_SIGNING_PRIVATE_KEY_B64` em cofre de segredos do servidor. A chave pública correspondente será configurada no agente Windows. **Nunca versione a chave privada.** Planeje rotação com identificador de chave e período de sobreposição.

## Variáveis obrigatórias

- `DATABASE_URL`: string de conexão PostgreSQL no servidor.
- `JWT_SECRET`: segredo aleatório com no mínimo 32 caracteres.
- `POLICY_SIGNING_PRIVATE_KEY_B64`: chave RSA privada em PEM codificada em Base64.
- `POLICY_SIGNING_KEY_ID`: identificador público da chave.
- `ALLOWED_ORIGINS`: origens exatas do portal.
- `TRUST_PROXY=true`: somente quando a API estiver atrás de proxy reverso confiável e a porta da API estiver restrita a loopback/rede privada.

## Autenticação

A primeira versão disponibiliza login administrativo por e-mail/senha, com hash bcrypt e JWT de curta duração. Credenciais são criadas por comando administrativo, nunca pelo front-end. O login corporativo SSO/OIDC poderá substituir esse mecanismo sem alterar os endpoints de negócio. No painel web, o access token permanece apenas em memória. Ao cadastrar ou remover um site, a API cria automaticamente uma nova revisão assinada na mesma transação; os agentes buscam a revisão na sincronização seguinte (intervalo padrão de 45 segundos).

O cadastro de dispositivos usa token de enrollment de uso único, criado em `POST /api/v1/admin/agent/enrollment-tokens`. O token do dispositivo é exibido somente uma vez e deverá ser protegido localmente pelo Windows Agent usando DPAPI e ACL.

## Endpoints

Veja `../api-contract/openapi.yaml` para o contrato completo.

- `GET /api/v1/health`
- `POST /api/v1/auth/login`, `GET /api/v1/auth/me`
- `GET/POST /api/v1/admin/agent/sites`
- `DELETE /api/v1/admin/agent/sites/{siteId}`
- `GET /api/v1/admin/agent/devices`
- `PATCH /api/v1/admin/agent/devices/{deviceId}/status`
- `POST /api/v1/admin/agent/enrollment-tokens`
- `GET /api/v1/admin/agent/events?limit=50`
- `GET /api/v1/admin/agent/policy`, `POST /api/v1/admin/agent/policy/publish`
- `POST /api/v1/admin/agent/enrollment-tokens`
- `POST /api/v1/agent/enroll`, `POST /api/v1/agent/heartbeat`
- `GET /api/v1/agent/policy`, `POST /api/v1/agent/events`

## Alertas imediatos à TI

Configure SECURITY_ALERT_WEBHOOK_URL com um endpoint HTTPS de webhook aprovado pela empresa. Quando um agente reportar browser_navigation_blocked, o backend grava o evento e envia um POST JSON ao webhook. Se não estiver configurado, o registro permanece no banco, mas não há notificação externa imediata. Mantenha essa URL somente no ambiente do servidor.

## Importante

O backend registra e distribui políticas assinadas. Isso, sozinho, ainda não garante controle total de cada forma de uso de um certificado A1. O enforcement de TLS cliente, assinatura documental e upload de PFX tem fluxos distintos e precisa ser homologado nos portais reais. O modo de navegação restrita depende também da extensão de navegador gerenciada pela TI.
