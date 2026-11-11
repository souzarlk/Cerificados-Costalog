# AGENTE COSTALOG — integração com o servidor da empresa

## Objetivo

O portal estático hospeda somente a interface administrativa e pode ser movido para o mesmo servidor da API na implantação final. O navegador **não acessa o banco de dados diretamente**. A comunicação ocorre por uma API HTTPS hospedada na infraestrutura da Costalog; essa API é responsável por autenticação, regras de negócio, auditoria e persistência no banco escolhido pela empresa.

O contrato REST e o portal são independentes do banco. A primeira implementação do backend usa PostgreSQL; se o servidor da empresa utilizar SQL Server, MariaDB ou outro produto, será necessário criar o adaptador/repositórios e as migrações correspondentes no backend, sem alterar as telas nem o contrato HTTP.

## Ponto único de configuração

Arquivo: `agente-costalog-config.js`

Quando a API da empresa estiver disponível, preencher somente:

```js
apiBaseUrl: "https://ENDERECO-DA-API-DA-EMPRESA"
```

Manter `apiPrefix: "/api/v1"` salvo se a equipe definir outra versão de API.

Não colocar neste arquivo:
- senha do banco;
- connection string;
- chave privada;
- client secret;
- token de acesso;
- credenciais de serviço.

O valor de `apiBaseUrl` fica público no JavaScript entregue ao navegador. Ele é apenas o endereço do serviço, nunca uma credencial.

Com `apiBaseUrl: ""`, o módulo entra explicitamente em **Modo local de rascunho**. A lista local não é compartilhada e não representa política ativa. Quando o endereço da API estiver preenchido, o módulo deixa de usar o rascunho local como fallback. Se o servidor falhar, as operações ficam bloqueadas para evitar que o usuário confunda dados locais com dados centrais.

## Camadas da arquitetura

1. **Portal estático:** interface do AGENTE COSTALOG, sem segredo de infraestrutura.
2. **Cliente HTTP:** `agente-costalog-api.js`, responsável por chamadas REST e tratamento de erros.
3. **API corporativa:** serviço hospedado no servidor da Costalog, com autorização de administrador, validação, auditoria e assinatura/publicação de políticas.
4. **Camada de persistência:** repositórios/serviços que conversam com o banco escolhido pela empresa.
5. **Banco da empresa:** permanece na rede interna, sem exposição direta à internet ou ao navegador.
6. **Agente Windows:** autentica cada dispositivo, recebe políticas assinadas e envia eventos.

A API deve ser a única camada que conhece detalhes do banco. As telas e o agente consomem contratos estáveis, não SQL.

## Autenticação e transporte

- HTTPS obrigatório.
- Login administrativo inicial por e-mail/senha na API, hash bcrypt e JWT de curta duração. O endpoint pode ser integrado posteriormente ao provedor corporativo OIDC/OAuth 2.0.
- O access token deve permanecer somente em memória no navegador; não salvar bearer tokens no localStorage ou em arquivos públicos.
- A API valida emissor, audiência, assinatura, expiração e escopos/perfis em cada chamada.
- A API deve exigir perfil administrativo nas rotas `/admin/*`.
- Configurar CORS somente para a origem efetivamente usada pelo portal, inicialmente `https://souzarlk.github.io`; não usar `*` com autorização.
- Permitir apenas métodos e cabeçalhos necessários: GET, POST, PATCH, DELETE, OPTIONS; Authorization e Content-Type.
- Aplicar rate limit, logs sem segredos, limite de payload e validação de hostname.
- O endpoint `/api/v1/health` pode ser público, mas deve retornar apenas estado operacional sem detalhes de infraestrutura.
- Não habilitar acesso remoto ao banco para os navegadores.

O painel já apresenta formulário de login que chama POST /auth/login; o access token é mantido apenas em memória. A API valida a sessão em /auth/me. Para migrar para SSO/OIDC, o callback corporativo poderá fornecer o token por `window.CostalogAgentAPI.setAccessToken(token)` e disparar `window.dispatchEvent(new Event('costalog:auth-changed'))`; no logout, chamar `window.CostalogAgentAPI.clearAccessToken()`.

## Contrato REST esperado

Prefixo padrão: `/api/v1`. Todos os corpos e respostas são JSON.

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/health` | Verificar disponibilidade sem dados sensíveis |
| GET | `/admin/agent/sites` | Listar domínios |
| POST | `/admin/agent/sites` | Cadastrar domínio |
| DELETE | `/admin/agent/sites/{siteId}` | Remover domínio |
| GET | `/admin/agent/devices` | Listar instalações do agente |
| GET | `/admin/agent/events?limit=50` | Consultar auditoria |
| GET | `/admin/agent/policy` | Consultar revisão e estado da política |
| POST | `/admin/agent/policy/publish` | Validar, versionar, assinar e publicar a política |

### Exemplos de dados

Site:
```json
{
  "id": "uuid",
  "name": "Portal de assinatura",
  "hostname": "assinador.exemplo.com.br",
  "enabled": true,
  "createdAt": "2026-11-11T12:00:00Z",
  "updatedAt": "2026-11-11T12:00:00Z"
}
```

Lista:
```json
{
  "items": [],
  "revision": 1,
  "updatedAt": "2026-11-11T12:00:00Z"
}
```

Política:
```json
{
  "revision": 12,
  "status": "published",
  "mode": "deny-by-default",
  "defaultInstallMode": "certificate",
  "allowedDestinations": [
    { "hostname": "assinador.exemplo.com.br", "enabled": true }
  ],
  "updatedAt": "2026-11-11T12:00:00Z"
}
```

Dispositivo:
```json
{
  "id": "uuid",
  "deviceName": "CST-FROTA-001",
  "username": "usuario@costalog",
  "status": "active",
  "installMode": "certificate",
  "policyRevision": 12,
  "lastSeenAt": "2026-11-11T12:00:00Z"
}
```

Evento:
```json
{
  "id": "uuid",
  "eventType": "certificate_use_denied",
  "title": "Utilização bloqueada",
  "message": "Destino fora da lista autorizada",
  "deviceId": "uuid",
  "deviceName": "CST-FROTA-001",
  "domain": "site-nao-autorizado.exemplo",
  "createdAt": "2026-11-11T12:00:00Z"
}
```

Erros devem usar formato consistente, por exemplo:
```json
{
  "error": "forbidden",
  "message": "Perfil administrativo necessário",
  "requestId": "correlation-id"
}
```

## Persistência no banco da empresa

A implementação do backend deverá usar uma camada de repositórios, por exemplo:
- `SiteRepository`
- `DeviceRepository`
- `PolicyRepository`
- `AuditEventRepository`
- `UserRepository`

Os serviços de domínio não devem depender de SQL específico. A escolha do driver, connection string, pool, migrações e backup fica no backend e na infraestrutura, nunca no front-end.

Entidades mínimas sugeridas:
- sites autorizados (hostname normalizado, nome, ativo, autor da mudança e timestamps);
- dispositivos (identidade, status, modo de instalação, versão da política e último contato);
- políticas e revisões imutáveis;
- eventos de auditoria;
- associação entre certificados, dispositivos e usuários (sem armazenar senhas em texto puro).

As credenciais do banco devem ficar em secret manager/variáveis protegidas do servidor. Banco e API devem ter backup, retenção, monitoramento e procedimento de restauração.

## Sincronização e segurança do agente

- Toda alteração administrativa deve gerar nova revisão da política e trilha de auditoria.
- A publicação deve validar domínios, gerar versão e assinar o documento da política.
- Cada agente autentica o dispositivo separadamente do login do administrador.
- O agente verifica assinatura, versão, validade e integridade antes de aplicar uma política.
- Eventos podem ser enfileirados localmente de forma protegida quando offline e enviados ao retornar a conexão.
- Política expirada ou inválida não pode autorizar novas operações de chave privada.
- O backend deve definir validade, revogação, rotação de chaves e atualização segura do agente.

## Estado desta entrega

Implementado no repositório:
- configuração central do endereço da API em `agente-costalog-config.js`; 
- cliente REST isolado em `agente-costalog-api.js`;
- cliente REST separado da interface;
- modo local de rascunho explicitamente identificado;
- modo API sem fallback para dados locais em caso de falha;
- tela preparada para sites, dispositivos, auditoria e publicação;
- contrato de integração para orientar a equipe que desenvolverá o serviço.

Ainda pendente:
- API corporativa executável;
- banco conectado e migrações;
- login OIDC/PKCE e autorização real;
- implementação dos endpoints;
- processo de assinatura e publicação de políticas;
- agente Windows e provedor de chave com enforcement;
- alertas e homologação.

**Esta entrega não bloqueia o uso de certificados ainda. Não publicar como proteção ativa nem cadastrar certificados reais com base nesta interface.**
