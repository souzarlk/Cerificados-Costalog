# Certificados Costalog

Portal inicial para consulta e download de certificados da Costalog.

## Acesso
Senha de acesso inicial: `Costalog@2026`

## Primeira versão
- Login somente por senha.
- Identidade visual Costalog em vermelho, preto e branco.
- Busca por certificado.
- Filtro por status.
- Cadastro de certificado com:
  - nome;
  - senha do PDF;
  - data de emissão;
  - data de expiração;
  - arquivo PDF.
- Download direto do certificado.
- Indicador de certificado válido, vencendo em 30 dias ou expirado.

### Importante
Esta primeira versão é um front-end estático. Os certificados adicionados pelo formulário são armazenados no **localStorage do navegador**, portanto não ficam disponíveis automaticamente para outros usuários/dispositivos.

Para a próxima etapa, o portal deve receber um backend/banco de dados e armazenamento de arquivos (por exemplo, Supabase/Firebase ou uma API própria), além de autenticação administrativa separada da senha de acesso dos usuários.

## Estrutura
- `index.html` — interface.
- `style.css` — identidade visual e responsividade.
- `app.js` — login e gerenciamento local dos certificados.
- `assets/logo-costalog.svg` — logo padrão.
- `assets/logo-costalog-white.svg` — versão branca para fundos escuros/vermelhos.
