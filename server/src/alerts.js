const webhookUrl = String(process.env.SECURITY_ALERT_WEBHOOK_URL || "").trim();

export async function sendSecurityAlert(event) {
  if (!webhookUrl) return;
  let target;
  try { target = new URL(webhookUrl); }
  catch { console.error("Webhook de alertas inválido; configure uma URL HTTPS."); return; }
  if (target.protocol !== "https:") {
    console.error("Webhook de alertas ignorado: HTTPS é obrigatório.");
    return;
  }
  const body = {
    source: "AGENTE COSTALOG",
    eventType: event.eventType,
    title: event.title,
    message: event.message,
    domain: event.domain || "",
    deviceName: event.deviceName || "Dispositivo Costalog",
    occurredAt: event.createdAt || new Date().toISOString()
  };
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) console.error("Webhook de alerta respondeu HTTP", response.status);
  } catch (error) {
    console.error("Falha ao enviar alerta de segurança:", error.message);
  }
}
