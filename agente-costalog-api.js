/* Cliente HTTP do AGENTE COSTALOG.
 * O navegador conversa somente com a API. Nunca conecta diretamente ao banco.
 * Token de sessão mantido em memória; não persistir em localStorage/sessionStorage.
 */
(function (global) {
  "use strict";
  const config = global.COSTALOG_AGENT_CONFIG || {};
  let accessToken = null;

  function baseUrl() {
    return String(config.apiBaseUrl || "").trim().replace(/\\/+$/, "");
  }
  function identityBaseUrl() {
    return String(config.identityBaseUrl || "").trim().replace(/\\/+$/, "");
  }
  function prefix() {
    const value = String(config.apiPrefix || "/api/v1").trim();
    return "/" + value.replace(/^\\/+|\\/+$/g, "");
  }
  function isConfigured() { return Boolean(baseUrl()); }
  function hasAccessToken() { return Boolean(accessToken); }
  function setAccessToken(token) {
    accessToken = typeof token === "string" && token.trim() ? token.trim() : null;
  }
  function clearAccessToken() { accessToken = null; }

  async function identityLogin(username, password) {
    const base = identityBaseUrl();
    if (!base) throw new Error("O serviço de autenticação da Central de Notas Fiscais não está configurado.");
    const timeout = Math.max(1000, Number(config.requestTimeoutMs) || 12000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetch(base + String(config.identityLoginPath || "/api/auth/login"), {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("Tempo limite ao validar o acesso na Central de Notas Fiscais.");
      throw new Error("Não foi possível conectar ao serviço de login da Central de Notas Fiscais.");
    } finally {
      clearTimeout(timer);
    }
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { throw new Error("A Central de Notas Fiscais retornou uma resposta inválida."); }
    }
    if (!response.ok) {
      if (response.status === 401) throw new Error("Usuário ou senha incorretos. Utilize o mesmo acesso da Central de Notas Fiscais.");
      if (response.status === 429) throw new Error("Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.");
      throw new Error((data && data.error) || "Não foi possível validar o acesso na Central de Notas Fiscais.");
    }
    if (!data || typeof data.token !== "string" || !data.token) throw new Error("A Central de Notas Fiscais não retornou uma sessão válida.");
    const meResponse = await fetch(base + String(config.identityMePath || "/api/auth/me"), {
      method: "GET",
      headers: { "Accept": "application/json", "Authorization": "Bearer " + data.token },
      credentials: "omit",
      cache: "no-store"
    });
    if (!meResponse.ok) throw new Error("A sessão da Central de Notas Fiscais não pôde ser confirmada.");
    setAccessToken(data.token);
    return data;
  }
  async function request(path, options) {
    if (!isConfigured()) throw new Error("Endereço da API não configurado.");
    const opts = options || {};
    const headers = new Headers(opts.headers || {});
    headers.set("Accept", "application/json");
    if (opts.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (accessToken) headers.set("Authorization", "Bearer " + accessToken);
    const controller = new AbortController();
    const timeout = Math.max(1000, Number(config.requestTimeoutMs) || 12000);
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetch(baseUrl() + prefix() + path, {
        method: opts.method || "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("Tempo limite ao conectar à API do AGENTE COSTALOG.");
      throw new Error("Não foi possível conectar à API do AGENTE COSTALOG. Verifique servidor, HTTPS e CORS.");
    } finally {
      clearTimeout(timer);
    }
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { throw new Error("A API retornou uma resposta inválida."); }
    }
    if (!response.ok) {
      const message = data && (data.message || data.error);
      if (response.status === 401) throw new Error("Sessão administrativa inválida ou expirada. Entre novamente no AGENTE COSTALOG.");
      if (response.status === 403) throw new Error("A API recusou a operação: perfil administrativo necessário.");
      throw new Error(message || ("Falha na API (HTTP " + response.status + ")."));
    }
    return data;
  }

  const api = {
    isConfigured,
    hasAccessToken,
    setAccessToken,
    clearAccessToken,
    login: async (email,password) => { const result=await request("/auth/login",{method:"POST",body:{email,password}}); setAccessToken(result.accessToken); return result; },
    me: () => request("/auth/me"),
    createEnrollmentToken: expiresMinutes => request("/admin/agent/enrollment-tokens",{method:"POST",body:{expiresMinutes:expiresMinutes||60}}),
    health: () => request("/health"),
    listSites: () => request("/admin/agent/sites"),
    createSite: body => request("/admin/agent/sites", { method: "POST", body }),
    deleteSite: id => request("/admin/agent/sites/" + encodeURIComponent(id), { method: "DELETE" }),
    setSiteEnabled: (id,enabled) => request("/admin/agent/sites/"+encodeURIComponent(id),{method:"PATCH",body:{enabled}}),
    listDevices: () => request("/admin/agent/devices"),
    setDeviceStatus: (id,status) => request("/admin/agent/devices/"+encodeURIComponent(id)+"/status",{method:"PATCH",body:{status}}),
    listEvents: limit => request("/admin/agent/events?limit=" + encodeURIComponent(limit || 50)),
    getPolicy: () => request("/admin/agent/policy"),
    publishPolicy: () => request("/admin/agent/policy/publish", { method: "POST", body: {} })
  };
  global.CostalogAgentAPI = Object.freeze(api);
})(window);
