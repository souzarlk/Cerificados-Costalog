# AGENTE COSTALOG — implantação em Windows Server

Este guia cobre a implantação da API e do portal no servidor da empresa. O navegador e o agente Windows nunca recebem credenciais do banco.

## Componentes

- Node.js 22 LTS para executar a API.
- MariaDB 10.6+ (recomendado MariaDB 11.4) como banco da aplicação.
- IIS com URL Rewrite + Application Request Routing (ARR), ou proxy HTTPS corporativo equivalente.
- Certificado TLS válido para o endereço interno/externo definido pela TI.
- Serviço Windows para manter a API em execução (por exemplo, WinSW/NSSM aprovados pela infraestrutura).

## Diretórios sugeridos

- C:\Costalog\AGENTE-COSTALOG\portal\ — arquivos estáticos do portal.
- C:\Costalog\AGENTE-COSTALOG\server\ — backend Node.js.
- C:\Costalog\AGENTE-COSTALOG\secrets\ — segredos e chaves fora do repositório e sem acesso a usuários comuns.
- Dados do MariaDB em volume ou diretório próprio, com backup monitorado.

## API

1. Instale Node.js 22 LTS no Windows Server.
2. Copie a pasta server/ para C:\Costalog\AGENTE-COSTALOG\server\.
3. Crie .env a partir de .env.example, fora do Git, com:
   - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_NAME apontando para o MariaDB privado;
   - JWT_SECRET aleatório de pelo menos 32 caracteres;
   - POLICY_SIGNING_PRIVATE_KEY_B64 em cofre/arquivo restrito;
   - ALLOWED_ORIGINS com a origem exata do portal;
   - SECURITY_ALERT_WEBHOOK_URL se houver integração de alertas.
4. No PowerShell, a partir da pasta server/, execute:
   - npm install
   - npm run db:migrate
   - npm run admin:create
5. Gere a chave de assinatura em estação segura com npm run keys:generate. Coloque a chave privada somente no ambiente protegido do servidor e a chave pública no pacote Windows.
6. Configure o serviço Windows da API com diretório de trabalho C:\Costalog\AGENTE-COSTALOG\server e comando node src/server.js. Defina NODE_ENV=production, HOST=127.0.0.1 e PORT=8080.
7. Configure o serviço para reiniciar automaticamente e registrar saída/erros em local com ACL restrita.
8. Verifique localmente http://127.0.0.1:8080/api/v1/health.

A API deve escutar em loopback quando estiver atrás do IIS, não em uma interface pública.

## IIS / HTTPS

- Instale e habilite URL Rewrite e Application Request Routing.
- Faça binding HTTPS com certificado corporativo válido.
- Configure proxy reverso do domínio usado pelo portal para http://127.0.0.1:8080.
- Preserve o prefixo /api/v1; não reescreva para outro caminho.
- Desabilite proxy aberto; encaminhe somente o host e caminho aprovados.
- Configure ALLOWED_ORIGINS para a origem real do portal, incluindo esquema e porta quando houver.
- Mantenha CORS sem wildcard.

## Portal no servidor

No repositório, execute o empacotador PowerShell a partir de uma estação Windows com `-Destination` apontando para a pasta que o IIS publicará. Quando o endereço HTTPS estiver definido, informe-o em `-ApiBaseUrl`:

`./Package-Portal.ps1 -Destination C:\\Costalog\\AGENTE-COSTALOG\\portal -ApiBaseUrl https://portal-interno.costalog`

O script copia apenas os arquivos estáticos, exclui backend, agente, chaves e arquivos de desenvolvimento, e configura `agente-costalog-config.js` dentro do pacote exportado. Se o endereço ainda não estiver definido, omita `-ApiBaseUrl` e configure-o antes de publicar. Em agente-costalog-config.js, aponte apiBaseUrl para a origem HTTPS da API, por exemplo:

apiBaseUrl: "https://portal-interno.costalog"

O apiPrefix permanece /api/v1. Se o IIS servir portal e API sob a mesma origem, o CORS pode ser reduzido a essa única origem. Atualize ALLOWED_ORIGINS no servidor com a mesma origem.

## Banco e rede

- Permita conexão MariaDB somente a partir do host da API e dos administradores de banco.
- Não publique a porta 3306 para a internet.
- Use usuário exclusivo do AGENTE COSTALOG com permissões mínimas; não use o usuário root na API.
- Ative backup diário, retenção, teste de restauração e monitoramento de espaço.
- Restrinja leitura de .env, chaves e backups a contas de serviço e administradores autorizados.

## Validação antes do piloto

1. GET /api/v1/health deve retornar status: ok.
2. Entre no painel com o administrador criado.
3. Gere um token de instalação de uso único.
4. Publique a primeira política (o cadastro/remoção de site já publica automaticamente a revisão).
5. Instale em um PC piloto e confirme heartbeat, revisão e eventos.
6. Teste Opção B em Chrome e Edge gerenciados com sites aprovados e não aprovados.
7. Não declare Opção A pronta até homologar o provedor CNG/KSP e os portais reais.

## MariaDB: versão, permissões e validação

O schema foi preparado para MariaDB 10.6+ e o CI valida MariaDB 11.4. Use InnoDB e utf8mb4. O usuário da aplicação precisa criar/alterar tabelas durante a migração e operar as tabelas do banco; depois da migração, a TI pode reduzir permissões conforme a política interna.

Antes de conectar o portal, execute `npm run db:migrate` e `npm run db:smoke`. Esses comandos validam o schema e operações de transação, bloqueio de linha, JSON, UUID e parâmetros preparados no banco.
