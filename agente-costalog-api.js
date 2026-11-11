/* Cliente HTTP do AGENTE COSTALOG.
 * A identidade é validada pela Central de Notas Fiscais.
 * O token retornado fica somente em memória e é enviado à API do agente quando hospedada.
 */
(function (global) {
  "use strict";
  const config = global.COSTALOG_AGENT_CONFIG || {};
  const AUTH_STORAGE_KEY = "costalog_admin_token";
  function readStoredToken() {
    try { return global.sessionStorage.getItem(AUTH_STORAGE_KEY) || null; }
    catch { return null; }
  }
  let accessToken = readStoredToken();

  function baseUrl() {
    return String(config.apiBaseUrl || "").trim().replace(/\/+$/, "");
  }
  function identityBaseUrl() {
    return String(config.identityBaseUrl || "").trim().replace(/\/+$/, "");
  }
  function prefix() {
    const value = String(config.apiPrefix || "/api/v1").trim();
    return "/" + value.replace(/^\/+|\/+$/g, "");
  }
  function isConfigured() { return Boolean(baseUrl()); }
  function hasIdentityService() { return Boolean(identityBaseUrl()); }
  function hasAccessToken() { return Boolean(accessToken); }
  function setAccessToken(token) {
    accessToken = typeof token === "string" && token.trim() ? token.trim() : null;
    try {
      if (accessToken) global.sessionStorage.setItem(AUTH_STORAGE_KEY, accessToken);
      else global.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {}
  }
  function clearAccessToken() {
    accessToken = null;
    try { global.sessionStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
  }

  async function fetchJson(url, options, timeoutMessage, connectionMessage) {
    const timeout = Math.max(1000, Number(config.requestTimeoutMs) || 12000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetch(url, {
        ...options,
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error(timeoutMessage);
      throw new Error(connectionMessage);
    } finally {
      clearTimeout(timer);
    }
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { throw new Error("O servidor retornou uma resposta inválida."); }
    }
    return { response, data };
  }

  async function resumeIdentitySession() {
    if (!accessToken) return false;
    const base = identityBaseUrl();
    if (!base) {
      clearAccessToken();
      return false;
    }
    const verified = await fetchJson(
      base + String(config.identityMePath || "/api/auth/me"),
      { method: "GET", headers: { "Accept": "application/json", "Authorization": "Bearer " + accessToken } },
      "Tempo limite ao confirmar a sessão da Central de Notas Fiscais.",
      "Não foi possível confirmar a sessão da Central de Notas Fiscais."
    );
    if (verified.response.status === 401 || verified.response.status === 403 ||
        !verified.response.ok || !verified.data || verified.data.authenticated !== true) {
      clearAccessToken();
      return false;
    }
    return true;
  }

  async function identityLogin(username, password) {
    const base = identityBaseUrl();
    if (!base) throw new Error("O serviço de login da Central de Notas Fiscais não está configurado.");
    const { response, data } = await fetchJson(
      base + String(config.identityLoginPath || "/api/auth/login"),
      {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      },
      "Tempo limite ao validar o acesso na Central de Notas Fiscais.",
      "Não foi possível conectar ao serviço de login da Central de Notas Fiscais."
    );
    if (!response.ok) {
      if (response.status === 401) throw new Error("Usuário ou senha incorretos. Utilize o mesmo acesso da Central de Notas Fiscais.");
      if (response.status === 429) throw new Error("Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.");
      throw new Error((data && data.error) || "Não foi possível validar o acesso na Central de Notas Fiscais.");
    }
    if (!data || typeof data.token !== "string" || !data.token) {
      throw new Error("A Central de Notas Fiscais não retornou uma sessão válida.");
    }
    const verified = await fetchJson(
      base + String(config.identityMePath || "/api/auth/me"),
      { method: "GET", headers: { "Accept": "application/json", "Authorization": "Bearer " + data.token } },
      "Tempo limite ao confirmar sua sessão na Central de Notas Fiscais.",
      "Não foi possível confirmar sua sessão na Central de Notas Fiscais."
    );
    if (!verified.response.ok || !verified.data || verified.data.authenticated !== true) {
      throw new Error("A sessão da Central de Notas Fiscais não pôde ser confirmada.");
    }
    setAccessToken(data.token);
    return data;
  }

  async function request(path, options) {
    if (!isConfigured()) throw new Error("API corporativa do AGENTE COSTALOG ainda não configurada.");
    const opts = options || {};
    const headers = new Headers(opts.headers || {});
    headers.set("Accept", "application/json");
    if (opts.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (accessToken) headers.set("Authorization", "Bearer " + accessToken);
    const { response, data } = await fetchJson(
      baseUrl() + prefix() + path,
      {
        method: opts.method || "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
      },
      "Tempo limite ao conectar à API do AGENTE COSTALOG.",
      "Não foi possível conectar à API do AGENTE COSTALOG. Verifique servidor, HTTPS e CORS."
    );
    if (!response.ok) {
      const message = data && (data.message || data.error);
      if (response.status === 401) throw new Error("Sua sessão da Central de Notas Fiscais expirou. Entre novamente.");
      if (response.status === 403) throw new Error("A API recusou a operação: seu acesso não possui permissão.");
      throw new Error(message || ("Falha na API (HTTP " + response.status + ")."));
    }
    return data;
  }

  const api = {
    isConfigured,
    hasIdentityService,
    hasAccessToken,
    setAccessToken,
    clearAccessToken,
    login: identityLogin,
    resumeIdentitySession,
    me: () => request("/auth/me"),
    createEnrollmentToken: expiresMinutes => request("/admin/agent/enrollment-tokens", { method: "POST", body: { expiresMinutes: expiresMinutes || 60 } }),
    health: () => request("/health"),
    listSites: () => request("/admin/agent/sites"),
    createSite: body => request("/admin/agent/sites", { method: "POST", body }),
    deleteSite: id => request("/admin/agent/sites/" + encodeURIComponent(id), { method: "DELETE" }),
    setSiteEnabled: (id, enabled) => request("/admin/agent/sites/" + encodeURIComponent(id), { method: "PATCH", body: { enabled } }),
    listDevices: () => request("/admin/agent/devices"),
    setDeviceStatus: (id, status) => request("/admin/agent/devices/" + encodeURIComponent(id) + "/status", { method: "PATCH", body: { status } }),
    listEvents: limit => request("/admin/agent/events?limit=" + encodeURIComponent(limit || 50)),
    getPolicy: () => request("/admin/agent/policy"),
    publishPolicy: () => request("/admin/agent/policy/publish", { method: "POST", body: {} })
  };
  global.CostalogAgentAPI = Object.freeze(api);
})(window);
