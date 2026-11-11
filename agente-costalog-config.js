/* Configuração do AGENTE COSTALOG.
 * Para conectar ao servidor da empresa, altere SOMENTE apiBaseUrl.
 * Ex.: https://api.interno.empresa (substituir pelo endereço aprovado pela TI).
 * Nunca coloque senhas, tokens ou credenciais de banco neste arquivo.
 */
window.COSTALOG_AGENT_CONFIG = Object.freeze({
  apiBaseUrl: "",
  apiPrefix: "/api/v1",
  requestTimeoutMs: 12000,
  authMode: "oidc-pkce",
  localDraftWhenApiIsEmpty: true
});
