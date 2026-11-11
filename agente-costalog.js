(()=>{"use strict";
const DRAFT_KEY="costalog_agent_sites_draft_v1",DRAFT_VERSION="costalog_agent_policy_version_v1";
const $=s=>document.querySelector(s);
const API=window.CostalogAgentAPI;
let sites=[],devices=[],events=[],serverMode=Boolean(API&&API.isConfigured()),serverReady=false,localMode=!serverMode;

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function validHost(v){if(!v||v.length>253||/[\s/@?#:]/.test(v))return false;const h=v.toLowerCase().replace(/\.$/,"");return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)}
function localLoad(){try{const v=JSON.parse(localStorage.getItem(DRAFT_KEY)||"[]");return Array.isArray(v)?v:[]}catch{return[]}}
function localSave(){localStorage.setItem(DRAFT_KEY,JSON.stringify(sites));const n=Number(localStorage.getItem(DRAFT_VERSION)||0)+1;localStorage.setItem(DRAFT_VERSION,String(n));$("#policyVersion").textContent=String(n)}
function setFeedback(message,error){const el=$("#siteFeedback");el.textContent=message||"";el.classList.toggle("error",Boolean(error))}
function setStatus(label,kind){const el=$("#connectionLabel");el.textContent=label;el.dataset.kind=kind||"neutral"}
function setNotice(html,kind){const el=$("#integrationNotice");el.innerHTML=html;el.dataset.kind=kind||"warning"}
function setEditable(enabled){$("#siteForm").querySelectorAll("input,button").forEach(el=>el.disabled=!enabled);$("#syncSites").disabled=!enabled;$("#publishPolicy").disabled=!enabled;$("#publishPolicy").hidden=!serverMode;$("#exportPolicy").hidden=serverMode;$("#clearSites").hidden=serverMode}
function countList(payload){if(Array.isArray(payload))return payload;if(payload&&Array.isArray(payload.items))return payload.items;if(payload&&Array.isArray(payload.data))return payload.data;return[]}
function renderSites(){
 const list=$("#siteList");
 $("#siteCount").textContent=String(sites.length);
 $("#siteCountLabel").textContent=sites.length+" "+(sites.length===1?"site":"sites");
 $("#emptySites").style.display=sites.length?"none":"block";
 list.innerHTML=sites.map((s,i)=>{
   const host=s.hostname||s.host||"";
   const id=s.id===undefined?String(i):String(s.id);
   const state=localMode?"ATIVO · RASCUNHO":(s.enabled===false?"INATIVO":"ATIVO");
   return '<div class="site-item"><div><b>'+escapeHtml(s.name||host)+'</b><small>'+escapeHtml(host)+'</small></div><div class="site-item-actions"><span class="site-status">'+state+'</span><button class="remove" data-remove="'+escapeHtml(id)+'" type="button">Remover</button></div></div>';
 }).join("");
}
function renderDevices(){
 const box=$("#devicesContent");
 $("#deviceCount").textContent=serverReady?String(devices.length):"—";
 if(!serverReady){box.className="placeholder";box.innerHTML="<span>▣</span><b>Aguardando conexão autenticada</b><p>Os dispositivos serão carregados pela API do servidor da empresa.</p>";return}
 if(!devices.length){box.className="placeholder";box.innerHTML="<span>▣</span><b>Nenhum dispositivo registrado</b><p>Quando os agentes forem instalados e ativados, os computadores aparecerão aqui.</p>";return}
 box.className="data-list";
 box.innerHTML=devices.map(d=>'<article class="data-row"><div><b>'+escapeHtml(d.deviceName||d.hostname||d.name||"Computador")+'</b><small>'+escapeHtml(d.username||d.assignedUser||"Usuário não informado")+' · '+escapeHtml(d.lastSeenAt?new Date(d.lastSeenAt).toLocaleString("pt-BR"):"Sem sincronização")+'</small></div><span class="site-status">'+escapeHtml(d.status||"REGISTRADO")+'</span></article>').join("");
}
function renderEvents(){
 const box=$("#eventsContent");
 $("#eventCount").textContent=serverReady?String(events.length):"—";
 if(!serverReady){box.innerHTML="<article><b>Auditoria indisponível</b><p>Conecte e autentique a API para consultar os registros.</p></article>";return}
 if(!events.length){box.innerHTML="<article><b>Nenhum evento recebido</b><p>Os eventos de uso, bloqueio, sincronização e administração serão listados aqui.</p></article>";return}
 box.innerHTML=events.map(ev=>'<article><b>'+escapeHtml(ev.title||ev.eventType||ev.type||"Evento")+'</b><p>'+escapeHtml(ev.message||ev.description||ev.domain||"Registro de segurança")+'</p><small>'+escapeHtml(ev.deviceName||ev.deviceId||"Dispositivo não identificado")+' · '+escapeHtml(ev.createdAt?new Date(ev.createdAt).toLocaleString("pt-BR"):"Data não informada")+'</small></article>').join("");
}
function renderPolicy(policy){
 const badge=$("#policyState");
 if(!serverMode){badge.textContent="Rascunho local";badge.className="pill warning";$("#policyVersion").textContent=localStorage.getItem(DRAFT_VERSION)||"0";return}
 if(!serverReady){badge.textContent="Servidor não autenticado";badge.className="pill muted";$("#policyVersion").textContent="—";return}
 const revision=policy&& (policy.revision??policy.version);
 badge.textContent=policy&&policy.status==="published"?"Política publicada":"Política no servidor";
 badge.className="pill "+(policy&&policy.status==="published"?"success":"warning");
 $("#policyVersion").textContent=revision===undefined?"—":String(revision);
}
async function refreshLocal(){
 sites=localLoad();serverReady=false;
 setStatus("MODO LOCAL · NÃO SINCRONIZADO","warning");
 setNotice("<b>Modo local de rascunho:</b> este ambiente ainda não está apontado para o servidor da empresa. Os sites ficam somente neste navegador e não são distribuídos aos computadores. Não representa proteção ativa.","warning");
 setEditable(true);$("#exportPolicy").hidden=false;$("#clearSites").hidden=false;$("#publishPolicy").hidden=true;
 renderSites();renderDevices();renderEvents();renderPolicy(null);
}
async function refreshServer(){
 setStatus("CONECTANDO À API…","pending");setEditable(false);
 try{
  await API.health();
 }catch(error){
  serverReady=false;sites=[];devices=[];events=[];
  setStatus("API INDISPONÍVEL","error");
  setNotice("<b>Servidor configurado, mas indisponível:</b> "+escapeHtml(error.message)+" As alterações foram suspensas. O sistema não trocará para o rascunho local automaticamente.","error");
  setFeedback(error.message,true);renderSites();renderDevices();renderEvents();renderPolicy(null);setEditable(false);return;
 }
 if(!API.hasAccessToken()){
  serverReady=false;sites=[];devices=[];events=[];
  setStatus("API DISPONÍVEL · LOGIN PENDENTE","pending");
  setNotice("<b>Servidor respondendo:</b> a autenticação corporativa OIDC/PKCE ainda precisa ser integrada. Nenhum dado administrativo será lido ou alterado até a API validar uma sessão de administrador.","warning");
  setFeedback("API encontrada. Falta conectar o login corporativo antes de gerenciar dados.",true);
  renderSites();renderDevices();renderEvents();renderPolicy(null);setEditable(false);return;
 }
 try{
  const results=await Promise.all([API.listSites(),API.listDevices(),API.listEvents(50),API.getPolicy()]);
  sites=countList(results[0]);devices=countList(results[1]);events=countList(results[2]);
  const summary=results[3]||{};
  serverReady=true;setStatus("SERVIDOR CONECTADO","success");
  setNotice("<b>Conectado ao servidor Costalog:</b> o painel está consultando a API central. O banco de dados permanece no ambiente da empresa e não é acessado diretamente pelo navegador.","success");
  setFeedback("Dados carregados da API central.",false);
  renderSites();renderDevices();renderEvents();renderPolicy(summary);setEditable(true);
 }catch(error){
  serverReady=false;sites=[];devices=[];events=[];
  setStatus("ERRO NA INTEGRAÇÃO","error");
  setNotice("<b>Não foi possível carregar os dados da API:</b> "+escapeHtml(error.message)+" A edição permanece bloqueada; nenhum dado local será usado como substituto.","error");
  setFeedback(error.message,true);renderSites();renderDevices();renderEvents();renderPolicy(null);setEditable(false);
 }
}
async function refresh(){setFeedback("",false);if(localMode)return refreshLocal();return refreshServer()}
function isAdmin(){return sessionStorage.getItem("costalog_role")==="admin"}
$("#siteForm").addEventListener("submit",async e=>{
 e.preventDefault();const name=$("#siteName").value.trim(),host=$("#siteHost").value.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"");
 if(!validHost(host)){setFeedback("Informe um hostname válido, sem caminho, porta ou protocolo.",true);return}
 if(sites.some(s=>(s.hostname||s.host)===host)){setFeedback("Este domínio já está cadastrado.",true);return}
 const button=$("#siteForm button[type=submit]");button.disabled=true;
 try{
  if(localMode){sites.push({id:"draft-"+Date.now(),name,host,hostname:host,createdAt:new Date().toISOString(),enabled:true});localSave();renderSites();setFeedback("Site adicionado somente ao rascunho deste navegador.",false)}
  else{if(!serverReady)throw new Error("API não autenticada ou indisponível. Nenhuma alteração foi gravada.");await API.createSite({name,hostname:host,enabled:true});await refresh();setFeedback("Site cadastrado no servidor da empresa.",false)}
  e.target.reset();
 }catch(error){setFeedback(error.message,true)}
 finally{button.disabled=!localMode&&!serverReady}
});
$("#siteList").addEventListener("click",async e=>{
 const button=e.target.closest("[data-remove]");if(!button)return;
 const id=button.dataset.remove;if(!confirm("Remover este domínio da lista?"))return;
 try{
  if(localMode){sites=sites.filter((s,i)=>String(s.id??i)!==id);localSave();renderSites();setFeedback("Site removido do rascunho local.",false)}
  else{if(!serverReady)throw new Error("API indisponível. Nenhuma alteração foi gravada.");await API.deleteSite(id);await refresh();setFeedback("Site removido no servidor da empresa.",false)}
 }catch(error){setFeedback(error.message,true)}
});
$("#clearSites").addEventListener("click",()=>{if(!localMode)return;if(confirm("Apagar todos os domínios deste rascunho local?")){sites=[];localSave();renderSites();setFeedback("Rascunho local limpo.",false)}});
$("#exportPolicy").addEventListener("click",()=>{
 if(!localMode)return;
 const policy={product:"AGENTE COSTALOG",schemaVersion:1,revision:Number(localStorage.getItem(DRAFT_VERSION)||0),mode:"deny-by-default",status:"draft-local-only",domains:sites.map(s=>({hostname:s.hostname||s.host,displayName:s.name,enabled:s.enabled!==false})),note:"Arquivo de rascunho. Não é assinado, não sincroniza e não deve ser aplicado em produção."};
 const blob=new Blob([JSON.stringify(policy,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="agente-costalog-policy-draft.json";a.click();URL.revokeObjectURL(url);
});
$("#syncSites").addEventListener("click",refresh);
$("#publishPolicy").addEventListener("click",async()=>{
 if(!serverReady){setFeedback("Conecte e autentique a API antes de publicar.",true);return}
 const button=$("#publishPolicy");button.disabled=true;
 try{await API.publishPolicy();await refresh();setFeedback("Solicitação de publicação enviada à API. Confira a revisão retornada pelo servidor.",false)}
 catch(error){setFeedback(error.message,true)}
 finally{button.disabled=!serverReady}
});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id==="panel-"+b.dataset.tab))}));
if(!isAdmin()){document.body.innerHTML='<main style="font:16px Arial;padding:50px;text-align:center"><h2>Acesso administrativo necessário</h2><p>Entre como administrador na Central de Certificados para abrir o AGENTE COSTALOG.</p><a href="index.html">Voltar ao portal</a></main>';return}
refresh();
})();