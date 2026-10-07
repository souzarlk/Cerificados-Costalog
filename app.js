const ACCESS_PASSWORD = String.fromCharCode(67,111,115,116,97,108,111,103,64,50,48,50,54);
const STORAGE_KEY = "costalog_certificates_v1";
const SESSION_KEY = "costalog_authenticated";

const $ = (selector) => document.querySelector(selector);
const loginScreen = $("#loginScreen");
const app = $("#app");
const loginForm = $("#loginForm");
const passwordInput = $("#accessPassword");
const loginError = $("#loginError");
const certificateGrid = $("#certificateGrid");
const emptyState = $("#emptyState");
const certificateCount = $("#certificateCount");
const searchInput = $("#searchInput");
const statusFilter = $("#statusFilter");
const modal = $("#adminModal");
const certificateForm = $("#certificateForm");
const saveError = $("#saveError");

let certificates = loadCertificates();

function loadCertificates() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function saveCertificates() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(certificates));
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone:"UTC" })
    .format(new Date(value + "T00:00:00Z"));
}

function daysUntil(date) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(date + "T00:00:00");
  target.setHours(0,0,0,0);
  return Math.ceil((target - today) / 86400000);
}

function getStatus(cert) {
  const days = daysUntil(cert.expiryDate);
  if (days < 0) return { key:"expired", label:"Expirado" };
  if (days <= 30) return { key:"expiring", label:"Vence em breve" };
  return { key:"valid", label:"Válido" };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[char]));
}

function render() {
  const term = searchInput.value.trim().toLowerCase();
  const filter = statusFilter.value;

  const filtered = certificates.filter((cert) => {
    const status = getStatus(cert).key;
    return (!term || cert.name.toLowerCase().includes(term))
      && (filter === "all" || status === filter);
  });

  certificateCount.textContent = certificates.length;

  certificateGrid.innerHTML = filtered.map((cert) => {
    const status = getStatus(cert);
    return `
      <article class="cert-card">
        <div class="cert-top">
          <div class="pdf-icon">PDF</div>
          <span class="status ${status.key}">${status.label}</span>
        </div>
        <h3>${escapeHtml(cert.name)}</h3>
        <div class="cert-meta">
          <div><strong>Emissão:</strong> ${formatDate(cert.issueDate)}</div>
          <div><strong>Expiração:</strong> ${formatDate(cert.expiryDate)}</div>
        </div>
        <div class="cert-password">
          Senha do certificado: <code>${escapeHtml(cert.password)}</code>
        </div>
        <div class="cert-actions">
          <a class="download-btn" href="${cert.fileData}" download="${escapeHtml(cert.fileName)}">Baixar certificado</a>
          <button class="delete-btn" data-delete="${cert.id}" title="Excluir">Excluir</button>
        </div>
      </article>`;
  }).join("");

  emptyState.style.display = filtered.length ? "none" : "block";

  if (!filtered.length && certificates.length) {
    emptyState.querySelector("h3").textContent = "Nenhum certificado encontrado";
    emptyState.querySelector("p").textContent = "Tente outro termo de pesquisa ou filtro.";
  } else {
    emptyState.querySelector("h3").textContent = "Nenhum certificado cadastrado";
    emptyState.querySelector("p").innerHTML =
      'Use o botão <strong>“Adicionar certificado”</strong> para cadastrar o primeiro documento.';
  }
}

function openApp() {
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
  render();
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  app.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  passwordInput.value = "";
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (passwordInput.value === ACCESS_PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, "1");
    loginError.textContent = "";
    openApp();
  } else {
    loginError.textContent = "Senha incorreta. Verifique e tente novamente.";
    passwordInput.focus();
  }
});

$("#togglePassword").addEventListener("click", () => {
  passwordInput.type =
    passwordInput.type === "password" ? "text" : "password";
});

$("#logoutBtn").addEventListener("click", logout);

$("#openAdmin").addEventListener("click", () => {
  saveError.textContent = "";
  certificateForm.reset();
  modal.classList.remove("hidden");
});

document.querySelectorAll("[data-close-modal]").forEach((element) => {
  element.addEventListener("click", () => modal.classList.add("hidden"));
});

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);

certificateGrid.addEventListener("click", (event) => {
  const id = event.target.dataset.delete;
  if (!id) return;

  if (confirm("Excluir este certificado deste navegador?")) {
    certificates = certificates.filter((cert) => cert.id !== id);
    saveCertificates();
    render();
  }
});

certificateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveError.textContent = "";

  const file = $("#certFile").files[0];

  if (!file || file.type !== "application/pdf") {
    saveError.textContent = "Selecione um arquivo PDF válido.";
    return;
  }

  if (file.size > 4 * 1024 * 1024) {
    saveError.textContent = "Nesta primeira versão, use PDFs de até 4 MB.";
    return;
  }

  const issueDate = $("#issueDate").value;
  const expiryDate = $("#expiryDate").value;

  if (expiryDate < issueDate) {
    saveError.textContent =
      "A data de expiração não pode ser anterior à data de emissão.";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    certificates.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name: $("#certName").value.trim(),
      password: $("#certPassword").value,
      issueDate,
      expiryDate,
      fileName: file.name,
      fileData: reader.result
    });

    try {
      saveCertificates();
      modal.classList.add("hidden");
      render();
    } catch {
      saveError.textContent =
        "Não foi possível salvar. O armazenamento do navegador pode estar cheio.";
    }
  };

  reader.onerror = () => {
    saveError.textContent = "Erro ao ler o PDF.";
  };

  reader.readAsDataURL(file);
});

if (sessionStorage.getItem(SESSION_KEY) === "1") {
  openApp();
}
