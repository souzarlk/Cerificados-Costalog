/* Configuração pública do AGENTE COSTALOG.
 * A autenticação usa o mesmo serviço e o mesmo usuário/senha da Central de Notas Fiscais.
 * apiBaseUrl permanece vazio até a API do AGENTE COSTALOG ser hospedada no servidor Costalog.
 * Nunca incluir segredos ou tokens neste arquivo.
 */
window.COSTALOG_AGENT_CONFIG = Object.freeze({
  identityBaseUrl: "https://central-notas-fiscais-costalog-api.onrender.com",
  identityLoginPath: "/api/auth/login",
  identityMePath: "/api/auth/me",
  apiBaseUrl: "",
  apiPrefix: "/api/v1",
  requestTimeoutMs: 12000,
  authMode: "central-notas-fiscais",
  localDraftWhenApiIsEmpty: true
});
