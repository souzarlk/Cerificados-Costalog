(()=>{"use strict";
const DRAFT_KEY="costalog_agent_sites_draft_v1",DRAFT_VERSION="costalog_agent_policy_version_v1";
const $=s=>document.querySelector(s),API=window.CostalogAgentAPI;
const serverMode=Boolean(API&&API.isConfigured());
let sites=[],devices=[],events=[],serverReady=false,localMode=!serverMode,currentPolicyRevision=0;

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const validHost=v=>{if(!v||v.length>253||/[\s/@?#:]/.test(v))return false;const h=v.toLowerCase().replace(/\.$/,"");return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)};
function localLoad(){try{const x=JSON.parse(localStorage.getItem(DRAFT_KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function localSave(){localStorage.setItem(DRAFT_KEY,JSON.stringify(sites));const n=Number(localStorage.getItem(DRAFT_VERSION)||0)+1;localStorage.setItem(DRAFT_VERSION,String(n))}
function feedback(message,error=false){const el=$("#siteFeedback");el.textContent=message||"";el.classList.toggle("error",error)}
function status(label,kind){const el=$("#connectionLabel");el.textContent=label;el.dataset.kind=kind||"neutral"}
function notice(message,kind){const el=$("#integrationNotice");el.innerHTML=message;el.dataset.kind=kind||"warning"}
function editable(enabled){
 $("#siteForm").querySelectorAll("input,button").forEach(el=>el.disabled=!enabled);
 $("#syncSites").disabled=!enabled;
 $("#publishPolicy").disabled=!enabled;
 $("#createEnrollment").disabled=!enabled||!serverMode;
 $("#publishPolicy").hidden=!serverMode;
 $("#exportPolicy").hidden=serverMode;
 $("#clearSites").hidden=serverMode;
}
function listOf(value){if(Array.isArray(value))return value;if(value&&Array.isArray(value.items))return value.items;if(value&&Array.isArray(value.data))return value.data;return[]}
function renderSites(){
 $("#siteCount").textContent=String(sites.length);
 $("#siteCountLabel").textContent=sites.length+" "+(sites.length===1?"site":"sites");
 $("#emptySites").style.display=sites.length?"none":"block";
 $("#siteList").innerHTML=sites.map((s,i)=>{
  const host=s.hostname||s.host||"",id=String(s.id??i),enabled=s.enabled!==false,state=localMode?"RASCUNHO LOCAL":(enabled?"ATIVO":"INATIVO");
  return '<div class="site-item"><div><b>'+esc(s.name||host)+'</b><small>'+esc(host)+'</small></div><div class="site-item-actions"><span class="site-status">'+state+'</span>'+(localMode?'':'<button class="toggle-site" data-toggle-site="'+esc(id)+'" data-next-enabled="'+(!enabled)+'" type="button">'+(enabled?'Desativar':'Ativar')+'</button>')+'<button class="remove" data-remove="'+esc(id)+'" type="button">Remover</button></div></div>';
 }).join("");
}
function renderDevices(){
 $("#deviceCount").textContent=serverReady?String(devices.length):"—";
 const box=$("#devicesContent");
 if(!serverReady){box.className="placeholder";box.innerHTML="<span>▣</span><b>Aguardando autenticação</b><p>O inventário é carregado diretamente da API do servidor Costalog.</p>";return}
 if(!devices.length){box.className="placeholder";box.innerHTML="<span>▣</span><b>Nenhum dispositivo registrado</b><p>Gere um código de instalação para cadastrar o primeiro computador.</p>";return}
 box.className="data-list";
 box.innerHTML=devices.map(d=>{
  const applied=Number(d.policyRevision||0);
  const synced=applied>=currentPolicyRevision;
  const next=d.status==="active"?"revoked":"active";
  const label=next==="revoked"?"Revogar":"Reativar";
  const policyLabel=synced?"POLÍTICA ATUALIZADA":"AGUARDANDO SINCRONIZAÇÃO";
  return '<article class="data-row"><div><b>'+esc(d.deviceName||d.hostname||d.name||"Computador")+'</b><small>'+esc(d.username||"Usuário não informado")+' · '+esc(d.lastSeenAt?new Date(d.lastSeenAt).toLocaleString("pt-BR"):"Sem sincronização")+' · Política v'+applied+'</small></div><div class="device-row-actions"><span class="site-status">'+esc(d.status||"REGISTRADO")+'</span><span class="policy-status '+(synced?"synced":"pending")+'">'+policyLabel+'</span><button class="remove" data-device-id="'+esc(d.id)+'" data-next-status="'+next+'" type="button">'+label+'</button></div></article>';
 }).join("");
}
function renderEvents(){
 $("#eventCount").textContent=serverReady?String(events.length):"—";
 const box=$("#eventsContent");
 if(!serverReady){box.innerHTML="<article><b>Auditoria protegida</b><p>Entre no servidor para consultar eventos de dispositivos.</p></article>";return}
 if(!events.length){box.innerHTML="<article><b>Nenhum evento recebido</b><p>Os eventos dos agentes aparecerão aqui após a instalação.</p></article>";return}
 box.innerHTML=events.map(ev=>'<article><b>'+esc(ev.title||ev.eventType||"Evento")+'</b><p>'+esc(ev.message||ev.domain||"Registro de segurança")+'</p><small>'+esc(ev.deviceName||"Dispositivo não identificado")+' · '+esc(ev.createdAt?new Date(ev.createdAt).toLocaleString("pt-BR"):"Data não informada")+'</small></article>').join("");
}
function renderPolicy(policy){
 const badge=$("#policyState");
 currentPolicyRevision=Number(policy?.revision??0);
 if(localMode){badge.textContent="Rascunho local";badge.className="pill warning";$("#policyVersion").textContent=localStorage.getItem(DRAFT_VERSION)||"0";return}
 if(!serverReady){badge.textContent="Aguardando autenticação";badge.className="pill muted";$("#policyVersion").textContent="—";return}
 badge.textContent=policy?.status==="published"?"Política publicada":"Política no servidor";
 badge.className="pill "+(policy?.status==="published"?"success":"warning");
 $("#policyVersion").textContent=String(policy?.revision??"—");
}
function showGate(message){
 document.body.classList.add("auth-required");
 $("#authGate").hidden=false;
 $("#agentLogout").hidden=true;
 $("#agentLoginFeedback").textContent=message||"";
}
function hideGate(){
 document.body.classList.remove("auth-required");
 $("#authGate").hidden=true;
 $("#agentLogout").hidden=false;
}
async function refreshLocal(){
 sites=localLoad();serverReady=false;localMode=true;
 status("MODO LOCAL · NÃO SINCRONIZADO","warning");
 notice("<b>Modo local de rascunho:</b> endereços salvos somente neste navegador. Não existe distribuição para os computadores nem proteção ativa.","warning");
 editable(true);$("#publishPolicy").hidden=true;$("#exportPolicy").hidden=false;$("#clearSites").hidden=false;
 renderSites();renderDevices();renderEvents();renderPolicy(null);
}
async function refreshServer(){
 localMode=false;editable(false);status("CONECTANDO À API…","pending");
 try{await API.health()}
 catch(error){
  serverReady=false;sites=[];devices=[];events=[];currentPolicyRevision=0;status("API INDISPONÍVEL","error");
  notice("<b>Servidor configurado, mas indisponível:</b> "+esc(error.message)+" O painel não usará dados locais como substituto.","error");
  feedback(error.message,true);renderSites();renderDevices();renderEvents();renderPolicy(null);return;
 }
 if(!API.hasAccessToken()){
  serverReady=false;sites=[];devices=[];events=[];currentPolicyRevision=0;status("API DISPONÍVEL · LOGIN PENDENTE","pending");
  notice("<b>API respondendo:</b> entre com a conta administrativa do servidor. Nenhum dado será alterado sem autenticação.","warning");
  renderSites();renderDevices();renderEvents();renderPolicy(null);return;
 }
 try{
  await API.me();
  const [siteData,deviceData,eventData,policyData]=await Promise.all([API.listSites(),API.listDevices(),API.listEvents(50),API.getPolicy()]);
  sites=listOf(siteData);devices=listOf(deviceData);events=listOf(eventData);serverReady=true;
  status("SERVIDOR COSTALOG CONECTADO","success");
  notice("<b>Conectado ao servidor:</b> os dados são carregados pela API central. O banco de dados não é acessado diretamente pelo navegador.","success");
  feedback("Dados atualizados a partir do servidor da empresa.");
  renderSites();renderDevices();renderEvents();renderPolicy(policyData);editable(true);hideGate();
 }catch(error){
  serverReady=false;sites=[];devices=[];events=[];currentPolicyRevision=0;status("FALHA DE AUTORIZAÇÃO / API","error");
  notice("<b>Falha ao validar a sessão ou carregar os dados:</b> "+esc(error.message)+" As alterações foram bloqueadas.","error");
  feedback(error.message,true);renderSites();renderDevices();renderEvents();renderPolicy(null);editable(false);
  if(/Sessão|autenticada|expirada/i.test(error.message)){API.clearAccessToken();showGate("Sua sessão expirou. Entre novamente.")}
 }
}
async function refresh(){feedback("");return serverMode?refreshServer():refreshLocal()}

$("#siteForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const name=$("#siteName").value.trim(),host=$("#siteHost").value.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"");
 if(!validHost(host)){feedback("Informe hostname válido, sem caminho, porta ou protocolo.",true);return}
 if(sites.some(s=>(s.hostname||s.host)===host)){feedback("Este domínio já está cadastrado.",true);return}
 const button=$("#siteForm button[type=submit]");button.disabled=true;
 try{
  if(localMode){sites.push({id:"draft-"+Date.now(),name,host,hostname:host,createdAt:new Date().toISOString(),enabled:true});localSave();renderSites();feedback("Adicionado somente ao rascunho local.")}
  else{if(!serverReady)throw new Error("API sem sessão administrativa. Nenhuma alteração foi gravada.");const saved=await API.createSite({name,hostname:host,enabled:true});await refreshServer();feedback("Site cadastrado e política "+(saved.policyRevision?"publicada na revisão "+saved.policyRevision:"atualizada")+". Os agentes recebem a mudança na próxima sincronização.")}
  e.target.reset();
 }catch(error){feedback(error.message,true)}
 finally{button.disabled=!localMode&&!serverReady}
});
$("#devicesContent").addEventListener("click",async e=>{
 const button=e.target.closest("[data-device-id]");if(!button||!serverReady)return;
 const id=button.dataset.deviceId,nextStatus=button.dataset.nextStatus;
 if(!confirm(nextStatus==="revoked"?"Revogar este computador? O agente perderá acesso à API.":"Reativar este computador?"))return;
 button.disabled=true;
 try{await API.setDeviceStatus(id,nextStatus);await refreshServer();feedback("Estado do dispositivo atualizado: "+nextStatus+".")}
 catch(error){feedback(error.message,true);button.disabled=false}
});
$("#siteList").addEventListener("click",async e=>{
 const toggle=e.target.closest("[data-toggle-site]");
 const remove=e.target.closest("[data-remove]");
 if(!toggle&&!remove)return;
 const id=(toggle||remove).dataset.toggleSite||(toggle||remove).dataset.remove;
 try{
  if(toggle){
   const enabled=toggle.dataset.nextEnabled==="true";
   if(!confirm(enabled?"Ativar este domínio e liberar sua utilização nos agentes?":"Desativar este domínio e removê-lo da política dos agentes?"))return;
   if(!serverReady)throw new Error("API sem sessão administrativa. Nenhuma alteração foi gravada.");
   toggle.disabled=true;
   const result=await API.setSiteEnabled(id,enabled);
   await refreshServer();
   feedback("Domínio "+(enabled?"ativado":"desativado")+" e política publicada na revisão "+result.policyRevision+".");
   return;
  }
  if(!confirm("Remover este domínio da lista?"))return;
  if(localMode){sites=sites.filter((s,i)=>String(s.id??i)!==id);localSave();renderSites();feedback("Removido do rascunho local.")}
  else{if(!serverReady)throw new Error("API sem sessão administrativa. Nenhuma alteração foi gravada.");await API.deleteSite(id);await refreshServer();feedback("Site removido e nova política publicada. Os agentes recebem a mudança na próxima sincronização.")}
 }catch(error){feedback(error.message,true)}
});
$("#clearSites").addEventListener("click",()=>{if(localMode&&confirm("Apagar todos os domínios deste rascunho local?")){sites=[];localSave();renderSites();feedback("Rascunho local limpo.")}});
$("#exportPolicy").addEventListener("click",()=>{
 if(!localMode)return;
 const data={product:"AGENTE COSTALOG",schemaVersion:1,revision:Number(localStorage.getItem(DRAFT_VERSION)||0),mode:"deny-by-default",status:"draft-local-only",domains:sites.map(s=>({hostname:s.hostname||s.host,displayName:s.name,enabled:s.enabled!==false})),note:"Rascunho sem assinatura, sem sincronização e sem enforcement. Não usar em produção."};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="agente-costalog-policy-draft.json";a.click();URL.revokeObjectURL(url);
});
$("#syncSites").addEventListener("click",refresh);
$("#publishPolicy").addEventListener("click",async()=>{
 if(!serverReady)return;
 const button=$("#publishPolicy");button.disabled=true;
 try{const result=await API.publishPolicy();await refreshServer();feedback("Política publicada. Revisão "+result.revision+". "+Number(result.devicesPendingSync||0)+" computador(es) aguardando sincronização.")}
 catch(error){feedback(error.message,true)}
 finally{button.disabled=!serverReady}
});
$("#createEnrollment").addEventListener("click",async()=>{
 if(!serverReady)return;
 const button=$("#createEnrollment");button.disabled=true;
 try{
  const result=await API.createEnrollmentToken(60),box=$("#enrollmentResult");
  box.hidden=false;box.replaceChildren();
  const title=document.createElement("b");title.textContent="Código de instalação — uso único";
  const description=document.createElement("p");description.textContent="Expira em "+result.expiresInMinutes+" minutos. Entregue somente ao técnico responsável.";
  const code=document.createElement("code");code.id="enrollmentCode";code.textContent=result.enrollmentToken;
  const copy=document.createElement("button");copy.type="button";copy.className="secondary";copy.textContent="Copiar código";
  copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(result.enrollmentToken);feedback("Código copiado.")}catch{feedback("Selecione e copie o código manualmente.",true)}});
  box.append(title,description,code,copy);feedback("Código criado e exibido uma única vez.");
 }catch(error){feedback(error.message,true)}
 finally{button.disabled=!serverReady}
});
document.querySelectorAll(".tab").forEach(button=>button.addEventListener("click",()=>{
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===button));
 document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id==="panel-"+button.dataset.tab));
}));
$("#agentLoginForm").addEventListener("submit",async e=>{
 e.preventDefault();const button=e.currentTarget.querySelector('button[type="submit"]'),message=$("#agentLoginFeedback");
 button.disabled=true;message.textContent="Autenticando no servidor Costalog…";
 try{
  await API.login($("#agentEmail").value.trim(),$("#agentPassword").value);
  await API.me();$("#agentPassword").value="";
  await refreshServer();
 }catch(error){API.clearAccessToken();message.textContent=error.message}
 finally{button.disabled=false}
});
$("#agentLogout").addEventListener("click",()=>{
 API.clearAccessToken();serverReady=false;sites=[];devices=[];events=[];editable(false);
 showGate("Sessão encerrada. Entre novamente.");status("SESSÃO ENCERRADA","warning");
 renderSites();renderDevices();renderEvents();renderPolicy(null);
});
if(serverMode){showGate("Entre com a conta administrativa cadastrada no servidor Costalog.");refreshServer()}
else{
 if(sessionStorage.getItem("costalog_role")!=="admin"){
  document.body.innerHTML='<main style="font:16px Arial;padding:50px;text-align:center"><h2>Acesso administrativo necessário</h2><p>Entre como administrador na Central de Certificados para abrir o AGENTE COSTALOG.</p><a href="index.html">Voltar ao portal</a></main>';return;
 }
 refreshLocal();
}
})();