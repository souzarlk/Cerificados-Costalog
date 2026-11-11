# Windows Agent — requisitos de implementação

Este diretório documenta o componente Windows planejado. Ainda não existe aqui um executável nem um mecanismo de bloqueio funcional.

## Responsabilidades
- Executar como serviço Windows com identidade de serviço dedicada.
- Registrar o dispositivo por processo de enrollment autenticado.
- Receber políticas assinadas e validar assinatura, versão, expiração e integridade.
- Aplicar a política deny-by-default antes de qualquer operação de chave privada.
- Registrar tentativas negadas e autorizadas com dados mínimos necessários.
- Enviar eventos à API e manter fila local protegida quando estiver offline.
- Não expor PFX, senha ou chave privada ao painel web ou ao usuário comum.

## Requisito criptográfico
Apenas instalar um PFX no repositório de certificados do Windows ou configurar políticas do Chrome/Edge não garante que o certificado só seja usado em domínios permitidos. A implementação precisa de um provedor criptográfico/serviço de assinatura controlado (por exemplo, integração CNG/KSP adequada) que imponha autorização no caminho de uso da chave.

## Segurança operacional
- Chaves privadas devem ser não exportáveis quando tecnicamente possível.
- ACLs devem permitir acesso somente ao serviço/provedor autorizado.
- O serviço deve validar a política localmente e falhar fechado quando não conseguir provar que a autorização está válida.
- Atualizações do agente devem ser assinadas.
- Não registrar senha, conteúdo PFX ou material de chave nos logs.
- Testar autenticação TLS, assinatura e aplicações nativas separadamente.

## Estado
Especificação inicial apenas. Não distribuir nem considerar este componente operacional até existir implementação, assinatura, testes de bypass e homologação.
