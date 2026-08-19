/* ==========================================================
   FACTURO / QUEEN-T - dashboard.js (Version Firebase Cloud Finale)
   ========================================================== */

let currentPeriod = 'cet-mois-ci';
let customRange = { start: null, end: null };
let currentStatusFilter = 'all';
let currentSearch = '';
let revenueChart = null;

let cloudInvoices = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupPeriodFilters();
  setupCustomDateInputs();
  setupStatusFilter();
  setupSearch();
  await loadCloudInvoicesAndRender(); 
}

/* ---------------- Accès Firebase ---------------- */

function getFirebase() {
  if (!window.db || !window.dbModules) {
    console.error("Firebase n'est pas initialisé.");
    return null;
  }
  return { db: window.db, ...window.dbModules };
}

async function loadCloudInvoicesAndRender() {
  const fb = getFirebase();
  cloudInvoices = [];

  if (!fb) return;

  try {
    const { db, collection, getDocs } = fb;
    const querySnapshot = await getDocs(collection(db, 'factures'));
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      cloudInvoices.push({ firestoreId: docSnap.id, ...data });
    });
    renderAll();
  } catch (err) {
    console.error("Erreur chargement dashboard Firebase :", err);
  }
}

/* ---------------- Filtres et Recherche ---------------- */

function setupPeriodFilters() {
  const buttons = document.querySelectorAll('#time-filters .filter-btn');
  const customBtn = document.getElementById('personnalise-btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      customBtn.classList.remove('active');
      btn.classList.add('active');
      document.getElementById('custom-date-inputs').style.display = 'none';
      currentPeriod = btn.id;
      renderAll();
    });
  });

  customBtn.addEventListener('click', () => {
    buttons.forEach(b => b.classList.remove('active'));
    customBtn.classList.add('active');
    const box = document.getElementById('custom-date-inputs');
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'flex' : 'none';
    currentPeriod = 'personnalise';
    renderAll();
  });
}

function setupCustomDateInputs() {
  const start = document.getElementById('start-date');
  const end = document.getElementById('end-date');
  [start, end].forEach(input => {
    input.addEventListener('change', () => {
      customRange.start = start.value || null;
      customRange.end = end.value || null;
      currentPeriod = 'personnalise';
      renderAll();
    });
  });
}

function setupStatusFilter() {
  const statusFilterEl = document.querySelector('.status-filter');
  if(statusFilterEl) {
    statusFilterEl.addEventListener('change', (e) => {
      currentStatusFilter = e.target.value;
      renderAll();
    });
  }
}

function setupSearch() {
  const searchEl = document.getElementById('recherche');
  if(searchEl) {
    searchEl.addEventListener('input', (e) => {
      currentSearch = e.target.value.trim().toLowerCase();
      renderAll();
    });
  }
}

function isInPeriod(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const startOfMonth = (offset = 0) => new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const endOfMonth = (offset = 0) => new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59);

  switch (currentPeriod) {
    case 'cet-mois-ci':
      return d >= startOfMonth(0) && d <= endOfMonth(0);
    case 'mois-dernier':
      return d >= startOfMonth(-1) && d <= endOfMonth(-1);
    case '3-derniers-mois':
      return d >= startOfMonth(-2) && d <= endOfMonth(0);
    case '6-derniers-mois':
      return d >= startOfMonth(-5) && d <= endOfMonth(0);
    case 'cette-année':
      return d.getFullYear() === now.getFullYear();
    case 'tout':
      return true;
    case 'personnalise': {
      if (!customRange.start || !customRange.end) return true;
      const start = new Date(customRange.start);
      const end = new Date(customRange.end);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }
    default:
      return true;
  }
}

function getFilteredInvoices() {
  return cloudInvoices
    .filter(inv => {
      if (!isInPeriod(inv.date)) return false;
      if (currentStatusFilter === 'paid' && inv.status !== 'Payé') return false;
      if (currentStatusFilter === 'unpaid' && inv.status !== 'Impayé') return false;
      if (currentSearch) {
        const haystack = `${inv.number} ${inv.client?.name || ''}`.toLowerCase();
        if (!haystack.includes(currentSearch)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.number || '').localeCompare(a.number || '', undefined, { numeric: true }));
}

/* ---------------- Affichage (Rendu) ---------------- */

function renderAll() {
  const filtered = getFilteredInvoices();
  renderKPIs(filtered);
  renderTable(filtered);
  renderChart(filtered);
}

function renderKPIs(list) {
  const ca = list.reduce((sum, inv) => (inv.status === 'Payé' ? sum + (inv.total || 0) : sum), 0);

  const caEl = document.getElementById('ca');
  const facturesGenEl = document.getElementById('factures-générées');
  const payeesEl = document.getElementById('payées');
  const impayeesEl = document.getElementById('impayées');

  if(caEl) caEl.innerHTML = `${ca.toLocaleString('fr-FR')} <small>FCFA</small>`;
  if(facturesGenEl) facturesGenEl.textContent = list.length;
  if(payeesEl) payeesEl.innerHTML = `${list.filter(i => i.status === 'Payé').length} <small>réglées</small>`;
  if(impayeesEl) impayeesEl.innerHTML = `${list.filter(i => i.status === 'Impayé').length} <small>à relancer</small>`;
}

function renderTable(list) {
  const tbody = document.querySelector('#invoice-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);">Aucune facture pour cette période.</td></tr>`;
    return;
  }

  list.forEach(inv => {
    const tr = document.createElement('tr');
    const isPaid = inv.status === 'Payé';
    const badgeStyle = isPaid
      ? 'background:#e6f4ea;color:#1e7e34;'
      : 'background:#fdecea;color:#c0392b;';

    tr.innerHTML = `
      <td>${escapeHTML(inv.number)}</td>
      <td>${escapeHTML(inv.client?.name || '-')}</td>
      <td>${formatDateFR(inv.date)}</td>
      <td>${formatMoney(inv.total, inv.currency)}</td>
      <td>
        <span class="status-badge" style="cursor:pointer;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;${badgeStyle}">
          ${inv.status || 'Payé'}
        </span>
      </td>
      <td class="actions-cell" style="white-space:nowrap;">
        <button class="icon-btn edit-btn" title="Modifier">✏️</button>
        <button class="icon-btn download-btn" title="Télécharger">⬇️</button>
        <button class="icon-btn delete-btn" title="Supprimer">❌</button>
      </td>`;

    tr.querySelector('.status-badge').addEventListener('click', () => toggleStatus(inv));
    
    tr.querySelector('.edit-btn').addEventListener('click', () => {
      window.location.href = `builder.html?edit=${encodeURIComponent(inv.number)}`;
    });
    
    tr.querySelector('.download-btn').addEventListener('click', () => {
      window.location.href = `builder.html?edit=${encodeURIComponent(inv.number)}&autodownload=1`;
    });
    
    tr.querySelector('.delete-btn').addEventListener('click', () => deleteInvoice(inv));

    tbody.appendChild(tr);
  });
}

/* ---------------- Actions Firebase (Statut & Suppression) ---------------- */

async function toggleStatus(inv) {
  // Changement immédiat dans l'interface (mise à jour optimiste) pour que ce soit fluide pour ta cliente
  inv.status = inv.status === 'Payé' ? 'Impayé' : 'Payé';
  renderAll(); 

  const fb = getFirebase();
  if (!fb || !inv.firestoreId) return;

  try {
    const { db, doc, updateDoc } = fb;
    await updateDoc(doc(db, 'factures', inv.firestoreId), { status: inv.status });
  } catch (err) {
    console.error("Erreur mise à jour statut Firebase :", err);
    // Si ça rate, on annule le changement visuel
    inv.status = inv.status === 'Payé' ? 'Impayé' : 'Payé';
    renderAll();
    alert("Impossible de mettre à jour le statut sur le serveur.");
  }
}

async function deleteInvoice(inv) {
  const confirmed = await showConfirmModal(`Supprimer la facture ${inv.number} ? Cette action est irréversible.`);
  if (!confirmed) return;

  const fb = getFirebase();
  if (!fb || !inv.firestoreId) return;

  try {
    const { db, doc, deleteDoc } = fb;
    await deleteDoc(doc(db, 'factures', inv.firestoreId));
    // Recharge la liste complète depuis Firebase pour être sûr d'être synchrone
    await loadCloudInvoicesAndRender();
  } catch (err) {
    console.error("Erreur suppression Firebase :", err);
    alert("Erreur lors de la suppression.");
  }
}

function showConfirmModal(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;padding:24px;border-radius:10px;max-width:320px;width:100%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.2);';

    const text = document.createElement('p');
    text.style.cssText = 'margin:0 0 20px 0;font-size:15px;color:#333;line-height:1.4;';
    text.textContent = message;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Annuler';
    cancelBtn.style.cssText = 'padding:10px 18px;border-radius:6px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;font-size:14px;';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.textContent = 'Supprimer';
    okBtn.style.cssText = 'padding:10px 18px;border-radius:6px;border:none;background:#c0392b;color:#fff;cursor:pointer;font-size:14px;';

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    box.appendChild(text);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const close = (result) => {
      document.body.removeChild(overlay);
      resolve(result);
    };

    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
}

/* ---------------- Graphiques et Formats ---------------- */

function getChartGranularity() {
  if (currentPeriod === 'personnalise') {
    if (customRange.start && customRange.end) {
      const spanDays = (new Date(customRange.end) - new Date(customRange.start)) / 86400000;
      return spanDays <= 45 ? 'day' : 'month';
    }
    return 'day';
  }
  return (currentPeriod === 'cet-mois-ci' || currentPeriod === 'mois-dernier') ? 'day' : 'month';
}

function renderChart(list) {
  const granularity = getChartGranularity();
  const paidList = list.filter(inv => inv.status === 'Payé');

  const grouped = {};
  paidList.forEach(inv => {
    if (!inv.date) return;
    const key = granularity === 'day' ? inv.date : inv.date.slice(0, 7);
    grouped[key] = (grouped[key] || 0) + (inv.total || 0);
  });

  const labels = Object.keys(grouped).sort();
  const data = labels.map(l => grouped[l]);
  const noms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

  const displayLabels = labels.map(l => {
    if (granularity === 'day') {
      const [, m, d] = l.split('-');
      return `${parseInt(d, 10)} ${noms[parseInt(m, 10) - 1]}`;
    }
    const [y, m] = l.split('-');
    return `${noms[parseInt(m, 10) - 1]} ${y}`;
  });

  const canvasEl = document.getElementById('revenueChart');
  if(!canvasEl) return;
  
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;
  
  if (revenueChart) revenueChart.destroy();

  revenueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: displayLabels,
      datasets: [{
        label: granularity === 'day' ? "Chiffre d'affaires (par jour)" : "Chiffre d'affaires (par mois)",
        data,
        borderColor: '#2e7d32',
        backgroundColor: 'rgba(46,125,50,0.1)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => v.toLocaleString('fr-FR') }
        }
      }
    }
  });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatDateFR(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatMoney(amount, currency = 'FCFA') {
  const symbols = { FCFA: 'FCFA', EUR: '€', USD: '$', GHS: 'GH₵' };
  return `${(amount || 0).toLocaleString('fr-FR')} ${symbols[currency] || currency}`;
}