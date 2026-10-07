const ADMIN_PASSWORD=String.fromCharCode(77,97,116,105,108,104,97,64,50,48,50,54);
const USER_PASSWORD=String.fromCharCode(67,111,115,116,97,108,111,103,64,50,48,50,54);
const STORAGE_KEY="costalog_certificates_v1";
const SESSION_KEY="costalog_role";

const $=s=>document.querySelector(s);
const loginScreen=$("#loginScreen"), app=$("#app"), loginForm=$("#loginForm"), passwordInput=$("#accessPassword"), togglePassword=$("#togglePassword"), loginError=$("#loginError");
const certificateGrid=$("#certificateGrid"), emptyState=$("#emptyState"), certificateCount=$("#certificateCount"), validCount=$("#validCount"), expiringCount=$("#expiringCount"), expiredCount=$("#expiredCount"), searchInput=$("#searchInput"), statusFilter=$("#statusFilter");
const modal=$("#adminModal"), certificateForm=$("#certificateForm"), saveError=$("#saveError"), modalTitle=$("#modalTitle"), modalSubtitle=$("#modalSubtitle"), certFile=$("#certFile"), fileRequiredLabel=$("#fileRequiredLabel"), fileHelp=$("#fileHelp"), issueDateDisplay=$("#issueDateDisplay"), expiryDateDisplay=$("#expiryDateDisplay");
const roleBadge=$("#roleBadge"), accessLevel=$("#accessLevel");
let currentRole=sessionStorage.getItem(SESSION_KEY)||null, editingId=null, certificates=loadCertificates();

function loadCertificates(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch{return[]}}
function saveCertificates(){localStorage.setItem(STORAGE_KEY,JSON.stringify(certificates))}
function isAdmin(){currentRole=sessionStorage.getItem(SESSION_KEY)||currentRole;return currentRole==="admin"}
function formatDate(v){if(!v)return"—";return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC"}).format(new Date(v+"T00:00:00Z"))}
function daysUntil(v){const t=new Date;t.setHours(0,0,0,0);const d=new Date(v+"T00:00:00");d.setHours(0,0,0,0);return Math.ceil((d-t)/86400000)}
function getStatus(c){const d=daysUntil(c.expiryDate);if(d<0)return{key:"expired",label:"Expirado"};if(d<=30)return{key:"expiring",label:"Vence em breve"};return{key:"valid",label:"Válido"}}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function isoDate(date){return String(date.getUTCFullYear()).padStart(4,"0")+"-"+String(date.getUTCMonth()+1).padStart(2,"0")+"-"+String(date.getUTCDate()).padStart(2,"0")}
function resetAutoDates(){issueDateDisplay.textContent="Automática pelo certificado";expiryDateDisplay.textContent="Automática pelo certificado";issueDateDisplay.classList.remove("detected");expiryDateDisplay.classList.remove("detected")}
function walkAsn1(node,fn){if(!node)return;fn(node);if(node.constructed&&Array.isArray(node.value))node.value.forEach(child=>walkAsn1(child,fn))}
function oid(node){try{return node&&node.type===0x06?forge.asn1.derToOid(node.value):""}catch{return""}}
function extractCertDerFromPfx(asn1){
  const CERT_BAG_OID="1.2.840.113549.1.12.10.1.3";
  const CERT_VALUE_OID="1.2.840.113549.1.9.22.1";
  const found=[];
  const seen=new Set();

  function firstOctet(node){
    let result=null;
    walkAsn1(node,n=>{
      if(result!==null)return;
      if(n&&n.type===0x04&&typeof n.value==="string")result=n.value;
    });
    return result;
  }

  walkAsn1(asn1,node=>{
    if(!node||!node.constructed||!Array.isArray(node.value)||!node.value.length)return;
    if(oid(node.value[0])!==CERT_BAG_OID)return;

    walkAsn1(node.value[1],child=>{
      if(!child||!child.constructed||!Array.isArray(child.value)||!child.value.length)return;
      if(oid(child.value[0])!==CERT_VALUE_OID)return;
      const der=firstOctet(child.value[1]);
      if(der&&!seen.has(der)){seen.add(der);found.push(der)}
    });
  });

  return found;
}

async function extractPfxInfo(file,password){
  if(!window.forge)throw new Error("O módulo de leitura de certificados não carregou. Recarregue a página e tente novamente.");
  const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
  let binary="";const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  const der=forge.util.createBuffer(binary,"raw").getBytes();
  const asn1=forge.asn1.fromDer(der);
  try{
    const p12=forge.pkcs12.pkcs12FromAsn1(asn1,false,password);
    const bags=p12.getBags({bagType:forge.pki.oids.certBag});
    const certBags=bags[forge.pki.oids.certBag]||[];
    for(const bag of certBags){
      try{
        const cert=bag.cert||forge.pki.certificateFromAsn1(bag.certBag||bag.asn1);
        if(cert)return {issueDate:isoDate(cert.validity.notBefore),expiryDate:isoDate(cert.validity.notAfter)};
      }catch{}
    }
  }catch{}
  const certDers=extractCertDerFromPfx(asn1);
  for(const certDer of certDers){
    try{
      const cert=forge.pki.certificateFromAsn1(forge.asn1.fromDer(certDer));
      return {issueDate:isoDate(cert.validity.notBefore),expiryDate:isoDate(cert.validity.notAfter)};
    }catch{}
  }
  throw new Error("Não foi possível localizar o certificado público dentro deste PFX/P12. Verifique se o arquivo é um PFX/P12 válido e se a senha está correta.");
}
function showDetectedDates(issueDate,expiryDate){
  issueDateDisplay.textContent=formatDate(issueDate);
  expiryDateDisplay.textContent=formatDate(expiryDate);
  issueDateDisplay.classList.add("detected");
  expiryDateDisplay.classList.add("detected");
}
const NOTIFY_THRESHOLDS=[60,30,21,14,7,5,4,3,2,1];
const NOTIFY_KEY="costalog_certificate_notifications_v1";
function loadNotifications(){try{return JSON.parse(localStorage.getItem(NOTIFY_KEY)||"[]")}catch{return[]}}
function saveNotifications(v){localStorage.setItem(NOTIFY_KEY,JSON.stringify(v))}
function notificationText(d){if(d===60)return"faltam 2 meses";if(d===30)return"falta 1 mês";if(d===21)return"faltam 3 semanas";if(d===14)return"faltam 2 semanas";if(d===7)return"falta 1 semana";return"faltam "+d+" dias"}
function checkNotifications(){const sent=loadNotifications();let changed=false;certificates.forEach(c=>{const d=daysUntil(c.expiryDate);NOTIFY_THRESHOLDS.forEach(t=>{const key=c.id+":"+t;if(d<=t&&d>=1&&!sent.some(n=>n.key===key)){sent.unshift({key,id:c.id,name:c.name,text:notificationText(d)});changed=true;if("Notification"in window&&Notification.permission==="granted")new Notification("Certificado próximo do vencimento",{body:c.name+" — "+notificationText(d)+" para vencer.",icon:"assets/logo-costalog.svg"});}})});if(changed)saveNotifications(sent.slice(0,200));renderNotifications()}
function renderNotifications(){const box=$("#notificationList"),badge=$("#notificationCount");if(!box||!badge)return;const items=loadNotifications().filter(n=>certificates.some(c=>c.id===n.id)).slice(0,20);badge.textContent=items.length>99?"99+":items.length;badge.classList.toggle("hidden",!items.length);box.innerHTML=items.length?items.map(n=>'<div class="notification-item"><strong>'+escapeHtml(n.name)+'</strong><span>'+escapeHtml(n.text)+' para vencer.</span></div>').join(""):'<div class="notification-empty">Nenhuma notificação de vencimento.</div>'}
function requestNotifications(){if("Notification"in window&&Notification.permission==="default")Notification.requestPermission().then(()=>checkNotifications()).catch(()=>{})}
function renderRole(){
  document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",!isAdmin()));
  roleBadge.textContent=isAdmin()?"ADMINISTRADOR":"USUÁRIO";
  roleBadge.classList.toggle("admin",isAdmin());
  accessLevel.textContent=isAdmin()?"Administrador":"Usuário";
}

function render(){
  const term=searchInput.value.trim().toLowerCase(), filter=statusFilter.value;
  const filtered=certificates.filter(c=>{const s=getStatus(c).key;return(!term||c.name.toLowerCase().includes(term))&&(filter==="all"||s===filter)}).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR",{sensitivity:"base"}));
  certificateCount.textContent=certificates.length;
  const counts={valid:0,expiring:0,expired:0};
  certificates.forEach(c=>{counts[getStatus(c).key]++});
  validCount.textContent=counts.valid;
  expiringCount.textContent=counts.expiring;
  expiredCount.textContent=counts.expired;
  document.querySelectorAll("[data-status-card]").forEach(card=>card.classList.toggle("selected",card.dataset.statusCard===filter));
  certificateGrid.innerHTML=filtered.map(c=>{
    const status=getStatus(c);
    const adminActions=isAdmin()
      ? '<button class="edit-btn" data-edit="'+escapeHtml(c.id)+'" title="Editar certificado">Editar</button><button class="delete-btn" data-delete="'+escapeHtml(c.id)+'" title="Excluir certificado">Excluir</button>'
      : "";
    return '<article class="cert-card"><div class="cert-top"><div class="pdf-icon">' + escapeHtml((c.fileName||"").split(".").pop().toUpperCase()||"CERT") + '</div><span class="status '+status.key+'">'+status.label+'</span></div><h3>'+escapeHtml(c.name)+'</h3><div class="cert-meta"><div><strong>Emissão:</strong> '+formatDate(c.issueDate)+'</div><div><strong>Expiração:</strong> '+formatDate(c.expiryDate)+'</div></div><div class="cert-password">Senha do certificado: <code>'+escapeHtml(c.password)+'</code></div><div class="cert-actions"><a class="download-btn" href="'+c.fileData+'" download="'+escapeHtml(c.fileName)+'">Baixar certificado</a>'+adminActions+'</div></article>';
  }).join("");
  emptyState.style.display=filtered.length?"none":"block";
  if(!filtered.length&&certificates.length){emptyState.querySelector("h3").textContent="Nenhum certificado encontrado";emptyState.querySelector("p").textContent="Tente outro termo de pesquisa ou filtro."}
  else{emptyState.querySelector("h3").textContent="Nenhum certificado cadastrado";emptyState.querySelector("p").textContent=isAdmin()?'Use “Adicionar certificado” para cadastrar o primeiro documento.':"Os documentos cadastrados aparecerão aqui."}
}

function openApp(){if(!currentRole)return;loginScreen.classList.add("hidden");app.classList.remove("hidden");renderRole();render();checkNotifications();requestNotifications()}
function logout(){sessionStorage.removeItem(SESSION_KEY);currentRole=null;editingId=null;app.classList.add("hidden");loginScreen.classList.remove("hidden");passwordInput.value="";passwordInput.type="password";togglePassword.classList.remove("visible");loginError.textContent=""}

loginForm.addEventListener("submit",e=>{
  e.preventDefault();
  const enteredPassword=passwordInput.value.trim();
  if(enteredPassword===ADMIN_PASSWORD)currentRole="admin";
  else if(enteredPassword===USER_PASSWORD)currentRole="user";
  else{loginError.textContent="Senha incorreta. Verifique e tente novamente.";passwordInput.focus();return}
  sessionStorage.setItem(SESSION_KEY,currentRole);loginError.textContent="";openApp();
});

togglePassword.addEventListener("click",()=>{
  const showing=passwordInput.type==="text";
  passwordInput.type=showing?"password":"text";
  togglePassword.classList.toggle("visible",!showing);
  togglePassword.setAttribute("aria-label",showing?"Mostrar senha":"Ocultar senha");
  togglePassword.setAttribute("title",showing?"Mostrar senha":"Ocultar senha");
});

$("#logoutBtn").addEventListener("click",logout);$("#notificationBtn").addEventListener("click",()=>$("#notificationPanel").classList.toggle("hidden"));$("#closeNotifications").addEventListener("click",()=>$("#notificationPanel").classList.add("hidden"));

function openCreateModal(){
  if(!isAdmin())return;
  editingId=null;saveError.textContent="";certificateForm.reset();resetAutoDates();modalTitle.textContent="Adicionar certificado";modalSubtitle.textContent="Cadastre um novo documento na central.";
  certFile.required=true;fileRequiredLabel.textContent="*";fileHelp.textContent="Envie o PFX/P12. As datas de emissão e vencimento serão extraídas automaticamente (máx. 4 MB).";modal.classList.remove("hidden");
}

function openEditModal(id){
  if(!isAdmin())return;
  const c=certificates.find(x=>x.id===id);if(!c)return;
  editingId=id;saveError.textContent="";$("#certName").value=c.name;$("#certPassword").value=c.password;certFile.value="";showDetectedDates(issueDate,expiryDate);
  certFile.required=false;fileRequiredLabel.textContent="";fileHelp.textContent="Deixe vazio para manter o arquivo atual. Ao trocar o PFX/P12, as datas de emissão e vencimento serão atualizadas automaticamente.";modalTitle.textContent="Editar certificado";modalSubtitle.textContent="As datas são controladas automaticamente pelo certificado.";modal.classList.remove("hidden");
}

$("#openAdmin").addEventListener("click",openCreateModal);
document.querySelectorAll("[data-close-modal]").forEach(e=>e.addEventListener("click",()=>modal.classList.add("hidden")));
searchInput.addEventListener("input",render);statusFilter.addEventListener("change",render);
document.querySelectorAll("[data-status-card]").forEach(card=>card.addEventListener("click",()=>{
  const target=card.dataset.statusCard;
  searchInput.value="";
  statusFilter.value=target;
  render();
  document.querySelector(".toolbar").scrollIntoView({behavior:"smooth",block:"start"});
}));

certificateGrid.addEventListener("click",e=>{
  const editId=e.target.dataset.edit,deleteId=e.target.dataset.delete;
  if(editId){if(isAdmin())openEditModal(editId);return}
  if(deleteId&&isAdmin()){
    const c=certificates.find(x=>x.id===deleteId);if(!c)return;
    if(confirm("Excluir o certificado “"+c.name+"”?")){certificates=certificates.filter(x=>x.id!==deleteId);saveCertificates();render()}
  }
});

certificateForm.addEventListener("submit",async e=>{
  e.preventDefault();if(!isAdmin())return;saveError.textContent="";
  const name=$("#certName").value.trim(),password=$("#certPassword").value,file=certFile.files[0];
  const fileName=(file?.name||"").toLowerCase();
  const allowedExtensions=[".pfx",".p12",".pdf"];
  const isAllowedFile=file&&allowedExtensions.some(ext=>fileName.endsWith(ext));
  if(!editingId&&!isAllowedFile){saveError.textContent="Arquivo inválido. Envie um PFX ou P12 para identificação automática das datas.";return}
  if(file&&!isAllowedFile){saveError.textContent="Arquivo inválido. Envie um PDF, PFX ou P12.";return}
  if(file&&file.size>4*1024*1024){saveError.textContent="O arquivo deve ter no máximo 4 MB.";return}
  let issueDate,expiryDate,fileData,fileNameOriginal;
  try{
    if(file){
      fileNameOriginal=file.name;
      if(/\.(pfx|p12)$/i.test(file.name)){
        if(!password){saveError.textContent="Informe a senha do certificado para que o sistema possa ler o PFX/P12.";return}
        saveError.textContent="Lendo o certificado e identificando as datas automaticamente…";
        const dates=await extractPfxInfo(file,password);
        issueDate=dates.issueDate;expiryDate=dates.expiryDate;showDetectedDates(issueDate,expiryDate);
      }else{
        if(editingId){const oldCert=certificates.find(x=>x.id===editingId);issueDate=oldCert.issueDate;expiryDate=oldCert.expiryDate;}
        else{saveError.textContent="Para o preenchimento automático das datas, cadastre o certificado em PFX ou P12.";return}
      }
      fileData=await new Promise((resolve,reject)=>{const reader=new FileReader;reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Erro ao ler o arquivo."));reader.readAsDataURL(file)});
    }else{
      const oldCert=certificates.find(x=>x.id===editingId);if(!oldCert)return;
      issueDate=oldCert.issueDate;expiryDate=oldCert.expiryDate;;fileData=oldCert.fileData;fileNameOriginal=oldCert.fileName;
    }
    if(expiryDate<issueDate){saveError.textContent="O certificado retornou datas inválidas (expiração anterior à emissão).";return}
    if(editingId){
      const idx=certificates.findIndex(x=>x.id===editingId);if(idx===-1)return;
      certificates[idx]={...certificates[idx],name,password,issueDate,expiryDate,fileData,fileName:fileNameOriginal};
    }else{
      certificates.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name,password,issueDate,expiryDate,fileName:fileNameOriginal,fileData});
    }
    try{saveCertificates();modal.classList.add("hidden");editingId=null;saveError.textContent="";render();checkNotifications()}catch{saveError.textContent="Não foi possível salvar. O armazenamento do navegador pode estar cheio."}
  }catch(err){
    const msg=String(err&&err.message||"");
    if(/Invalid password|Invalid MAC|MAC could not be verified|PKCS#12/i.test(msg))saveError.textContent="Não foi possível abrir o PFX/P12. Confira a senha do certificado.";
    else saveError.textContent=msg||"Não foi possível ler as datas do certificado.";
  }
});
function createMatrix(){
  const canvas=$("#matrixLayer"),ctx=canvas.getContext("2d"),chars="01ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&@";
  let width=0,height=0,fontSize=15,columns=0,drops=[],raf=0,last=0,step=48;
  function resize(){
    const dpr=Math.min(window.devicePixelRatio||1,2),rect=canvas.getBoundingClientRect();
    width=Math.max(1,Math.floor(rect.width));height=Math.max(1,Math.floor(rect.height));
    canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    fontSize=window.innerWidth<650?12:15;columns=Math.ceil(width/fontSize);drops=Array.from({length:columns},()=>Math.random()*-height/fontSize);
    ctx.font="700 "+fontSize+"px 'Courier New',monospace";ctx.textBaseline="top";
  }
  function draw(time){
    if(!last)last=time;
    if(time-last>=step){
      ctx.fillStyle="rgba(227,6,19,.18)";ctx.fillRect(0,0,width,height);
      ctx.fillStyle="rgba(255,255,255,.82)";
      for(let i=0;i<columns;i++){
        const x=i*fontSize,y=drops[i]*fontSize;
        ctx.shadowBlur=7;ctx.shadowColor="rgba(255,255,255,.55)";
        ctx.fillText(chars[(Math.random()*chars.length)|0],x,y);
        drops[i]+=0.72;if(y>height+fontSize*8&&Math.random()>.975)drops[i]=Math.random()*-12;
      }
      ctx.shadowBlur=0;last=time;
    }
    raf=requestAnimationFrame(draw);
  }
  function start(){cancelAnimationFrame(raf);resize();last=0;raf=requestAnimationFrame(draw)}
  window.addEventListener("resize",resize,{passive:true});
  document.addEventListener("visibilitychange",()=>{if(document.hidden)cancelAnimationFrame(raf);else raf=requestAnimationFrame(draw)});
  start();
}
createMatrix();
if(sessionStorage.getItem(SESSION_KEY)==="admin"||sessionStorage.getItem(SESSION_KEY)==="user"){currentRole=sessionStorage.getItem(SESSION_KEY);openApp()}
