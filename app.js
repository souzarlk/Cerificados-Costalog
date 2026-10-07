const ADMIN_PASSWORD=String.fromCharCode(77,97,116,105,108,104,97,64,50,48,50,54);
const USER_PASSWORD=String.fromCharCode(67,111,115,116,97,108,111,103,64,50,48,50,54);
const STORAGE_KEY="costalog_certificates_v1";
const SESSION_KEY="costalog_role";

const $=s=>document.querySelector(s);
const loginScreen=$("#loginScreen"), app=$("#app"), loginForm=$("#loginForm"), passwordInput=$("#accessPassword"), togglePassword=$("#togglePassword"), loginError=$("#loginError");
const certificateGrid=$("#certificateGrid"), emptyState=$("#emptyState"), certificateCount=$("#certificateCount"), searchInput=$("#searchInput"), statusFilter=$("#statusFilter");
const modal=$("#adminModal"), certificateForm=$("#certificateForm"), saveError=$("#saveError"), modalTitle=$("#modalTitle"), modalSubtitle=$("#modalSubtitle"), certFile=$("#certFile"), fileRequiredLabel=$("#fileRequiredLabel"), fileHelp=$("#fileHelp");
const roleBadge=$("#roleBadge"), accessLevel=$("#accessLevel");
let currentRole=sessionStorage.getItem(SESSION_KEY)||null, editingId=null, certificates=loadCertificates();

function loadCertificates(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch{return[]}}
function saveCertificates(){localStorage.setItem(STORAGE_KEY,JSON.stringify(certificates))}
function isAdmin(){return currentRole==="admin"}
function formatDate(v){if(!v)return"—";return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC"}).format(new Date(v+"T00:00:00Z"))}
function daysUntil(v){const t=new Date;t.setHours(0,0,0,0);const d=new Date(v+"T00:00:00");d.setHours(0,0,0,0);return Math.ceil((d-t)/86400000)}
function getStatus(c){const d=daysUntil(c.expiryDate);if(d<0)return{key:"expired",label:"Expirado"};if(d<=30)return{key:"expiring",label:"Vence em breve"};return{key:"valid",label:"Válido"}}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

function renderRole(){
  document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",!isAdmin()));
  roleBadge.textContent=isAdmin()?"ADMINISTRADOR":"USUÁRIO";
  roleBadge.classList.toggle("admin",isAdmin());
  accessLevel.textContent=isAdmin()?"Administrador":"Usuário";
}

function render(){
  const term=searchInput.value.trim().toLowerCase(), filter=statusFilter.value;
  const filtered=certificates.filter(c=>{const s=getStatus(c).key;return(!term||c.name.toLowerCase().includes(term))&&(filter==="all"||s===filter)});
  certificateCount.textContent=certificates.length;
  certificateGrid.innerHTML=filtered.map(c=>{
    const status=getStatus(c);
    const adminActions=isAdmin()
      ? '<button class="edit-btn" data-edit="'+escapeHtml(c.id)+'" title="Editar certificado">Editar</button><button class="delete-btn" data-delete="'+escapeHtml(c.id)+'" title="Excluir certificado">Excluir</button>'
      : "";
    return '<article class="cert-card"><div class="cert-top"><div class="pdf-icon">PDF</div><span class="status '+status.key+'">'+status.label+'</span></div><h3>'+escapeHtml(c.name)+'</h3><div class="cert-meta"><div><strong>Emissão:</strong> '+formatDate(c.issueDate)+'</div><div><strong>Expiração:</strong> '+formatDate(c.expiryDate)+'</div></div><div class="cert-password">Senha do certificado: <code>'+escapeHtml(c.password)+'</code></div><div class="cert-actions"><a class="download-btn" href="'+c.fileData+'" download="'+escapeHtml(c.fileName)+'">Baixar certificado</a>'+adminActions+'</div></article>';
  }).join("");
  emptyState.style.display=filtered.length?"none":"block";
  if(!filtered.length&&certificates.length){emptyState.querySelector("h3").textContent="Nenhum certificado encontrado";emptyState.querySelector("p").textContent="Tente outro termo de pesquisa ou filtro."}
  else{emptyState.querySelector("h3").textContent="Nenhum certificado cadastrado";emptyState.querySelector("p").textContent=isAdmin()?'Use “Adicionar certificado” para cadastrar o primeiro documento.':"Os documentos cadastrados aparecerão aqui."}
}

function openApp(){if(!currentRole)return;loginScreen.classList.add("hidden");app.classList.remove("hidden");renderRole();render()}
function logout(){sessionStorage.removeItem(SESSION_KEY);currentRole=null;editingId=null;app.classList.add("hidden");loginScreen.classList.remove("hidden");passwordInput.value="";passwordInput.type="password";togglePassword.classList.remove("visible");loginError.textContent=""}

loginForm.addEventListener("submit",e=>{
  e.preventDefault();
  if(passwordInput.value===ADMIN_PASSWORD)currentRole="admin";
  else if(passwordInput.value===USER_PASSWORD)currentRole="user";
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

$("#logoutBtn").addEventListener("click",logout);

function openCreateModal(){
  if(!isAdmin())return;
  editingId=null;saveError.textContent="";certificateForm.reset();modalTitle.textContent="Adicionar certificado";modalSubtitle.textContent="Cadastre um novo documento na central.";
  certFile.required=true;fileRequiredLabel.textContent="*";fileHelp.textContent="Somente arquivos PDF de até 4 MB.";modal.classList.remove("hidden");
}

function openEditModal(id){
  if(!isAdmin())return;
  const c=certificates.find(x=>x.id===id);if(!c)return;
  editingId=id;saveError.textContent="";$("#certName").value=c.name;$("#certPassword").value=c.password;$("#issueDate").value=c.issueDate;$("#expiryDate").value=c.expiryDate;certFile.value="";
  certFile.required=false;fileRequiredLabel.textContent="";fileHelp.textContent="Deixe vazio para manter o PDF atual.";modalTitle.textContent="Editar certificado";modalSubtitle.textContent="Atualize as informações ou substitua o PDF.";modal.classList.remove("hidden");
}

$("#openAdmin").addEventListener("click",openCreateModal);
document.querySelectorAll("[data-close-modal]").forEach(e=>e.addEventListener("click",()=>modal.classList.add("hidden")));
searchInput.addEventListener("input",render);statusFilter.addEventListener("change",render);

certificateGrid.addEventListener("click",e=>{
  const editId=e.target.dataset.edit,deleteId=e.target.dataset.delete;
  if(editId){if(isAdmin())openEditModal(editId);return}
  if(deleteId&&isAdmin()){
    const c=certificates.find(x=>x.id===deleteId);if(!c)return;
    if(confirm("Excluir o certificado “"+c.name+"”?")){certificates=certificates.filter(x=>x.id!==deleteId);saveCertificates();render()}
  }
});

certificateForm.addEventListener("submit",e=>{
  e.preventDefault();if(!isAdmin())return;saveError.textContent="";
  const name=$("#certName").value.trim(),password=$("#certPassword").value,issueDate=$("#issueDate").value,expiryDate=$("#expiryDate").value,file=certFile.files[0];
  if(expiryDate<issueDate){saveError.textContent="A data de expiração não pode ser anterior à data de emissão.";return}
  if(!editingId&&(!file||file.type!=="application/pdf")){saveError.textContent="Selecione um arquivo PDF válido.";return}
  if(file&&file.size>4*1024*1024){saveError.textContent="Use PDFs de até 4 MB.";return}
  const finishSave=(fileData,fileName)=>{
    if(editingId){
      const i=certificates.findIndex(x=>x.id===editingId);if(i===-1)return;
      certificates[i]={...certificates[i],name,password,issueDate,expiryDate,fileData:fileData||certificates[i].fileData,fileName:fileName||certificates[i].fileName};
    }else{
      certificates.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name,password,issueDate,expiryDate,fileName,fileData});
    }
    try{saveCertificates();modal.classList.add("hidden");editingId=null;render()}catch{saveError.textContent="Não foi possível salvar. O armazenamento do navegador pode estar cheio."}
  };
  if(!file){finishSave("","");return}
  const reader=new FileReader;reader.onload=()=>finishSave(reader.result,file.name);reader.onerror=()=>{saveError.textContent="Erro ao ler o PDF."};reader.readAsDataURL(file);
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
