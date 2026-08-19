/* ==========================================================
   FACTURO / QUEEN-T - builder.js (Version Firebase Cloud Finale)
   ========================================================== */

document.addEventListener('DOMContentLoaded', init);

const SETTINGS_KEY = 'queenty_settings'; // Pour garder en mémoire les infos de l'entreprise sur l'appareil

let itemsBody, addItemBtn, grandTotalAmount, currencySelect;

function init() {
  itemsBody = document.getElementById('invoice-items-body');
  addItemBtn = document.getElementById('add-item-btn');
  grandTotalAmount = document.getElementById('grand-total-amount');
  currencySelect = document.getElementById('invoice-currency');

  loadIssuerSettings();
  setupLogoUpload();
  setupIssuerPreviewSync();
  setupClientPreviewSync();
  setupDate();
  setupCurrencyListener();
  setupItemsTable();
  setupSaveButton();
  setupDownloadButton();

  setInvoiceNumber();      
  applyEditModeIfAny();    

  recalculateAll();
}

/* Petits helpers */
function getValue(id) { return document.getElementById(id)?.value || ''; }
function setValue(id, value) { const el = document.getElementById(id); if (el && value) el.value = value; }
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------- Accès Firebase ---------------- */
function getFirebase() {
  if (!window.db || !window.dbModules) {
    console.error("Firebase n'est pas initialisé.");
    return null;
  }
  return { db: window.db, ...window.dbModules };
}

/* ================= 1. PROFIL ENTREPRISE ================= */

function loadIssuerSettings() {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
  if (!settings) return;

  setValue('issuer-name-input', settings.name);
  setValue('issuer-phone-input', settings.phone);
  setValue('issuer-email-input', settings.email);
  setValue('issuer-address-input', settings.address);
  setValue('issuer-rccm-input', settings.rccm);
  if (settings.logo) setLogo(settings.logo);
}

function setLogo(dataUrl) {
  const formLogo = document.getElementById('issuer-logo-preview');
  const previewLogo = document.getElementById('preview-issuer-logo');
  if (formLogo) { formLogo.src = dataUrl; formLogo.style.display = 'block'; }
  if (previewLogo) { previewLogo.src = dataUrl; previewLogo.style.display = 'block'; }
}

function setupLogoUpload() {
  const logoInput = document.getElementById('issuer-logo-input');
  if (!logoInput) return;

  logoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Image = event.target.result;
      setLogo(base64Image);
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      settings.logo = base64Image;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    };
    reader.readAsDataURL(file);
  });
}

function saveIssuerSettings() {
  const settings = {
    name: getValue('issuer-name-input'),
    phone: getValue('issuer-phone-input'),
    email: getValue('issuer-email-input'),
    address: getValue('issuer-address-input'),
    rccm: getValue('issuer-rccm-input'),
    logo: document.getElementById('issuer-logo-preview')?.src || ''
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/* ================= 2. APERÇU EN DIRECT ================= */

function setupIssuerPreviewSync() {
  ['issuer-name-input', 'issuer-phone-input', 'issuer-email-input', 'issuer-address-input', 'issuer-rccm-input']
    .forEach(id => document.getElementById(id)?.addEventListener('input', updateIssuerPreview));
  updateIssuerPreview();
}

function updateIssuerPreview() {
  const nameEl = document.getElementById('preview-issuer-name');
  if (nameEl) nameEl.textContent = getValue('issuer-name-input') || "Nom de l'entreprise";

  const details = [];
  if (getValue('issuer-address-input')) details.push(getValue('issuer-address-input'));
  if (getValue('issuer-phone-input')) details.push('Tél: ' + getValue('issuer-phone-input'));
  if (getValue('issuer-email-input')) details.push(getValue('issuer-email-input'));
  if (getValue('issuer-rccm-input')) details.push('RCCM: ' + getValue('issuer-rccm-input'));

  const detailsEl = document.getElementById('preview-issuer-details');
  if (detailsEl) detailsEl.textContent = details.length ? details.join(' | ') : 'Adresse, Téléphone, Email, RCCM';
}

function setupClientPreviewSync() {
  ['client-name-input', 'client-address-input', 'client-email-input', 'client-phone-input']
    .forEach(id => document.getElementById(id)?.addEventListener('input', updateClientPreview));
  updateClientPreview();
}

function updateClientPreview() {
  const nameEl = document.getElementById('preview-client-name');
  if (nameEl) nameEl.textContent = getValue('client-name-input') || 'Nom du client';

  const details = [];
  if (getValue('client-address-input')) details.push(getValue('client-address-input'));
  if (getValue('client-email-input')) details.push(getValue('client-email-input'));
  if (getValue('client-phone-input')) details.push('Tél: ' + getValue('client-phone-input'));

  const detailsEl = document.getElementById('preview-client-details');
  if (detailsEl) detailsEl.textContent = details.length ? details.join(' - ') : 'Adresse, Email, Téléphone du client';
}

function setupDate() {
  const dateInput = document.getElementById('invoice-date');
  if (!dateInput) return;

  if (!dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];
  syncDatePreview();

  dateInput.addEventListener('input', syncDatePreview);
}

function syncDatePreview() {
  const previewDate = document.getElementById('preview-invoice-date');
  if (previewDate) previewDate.textContent = formatDateFR(getValue('invoice-date'));
}

function formatDateFR(iso) {
  if (!iso) return '--/--/----';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function setupCurrencyListener() {
  if (currencySelect) currencySelect.addEventListener('change', recalculateAll);
}

/* ================= 3. NUMÉRO DE FACTURE ================= */



async function setInvoiceNumber() {
  const numberInput = document.getElementById('invoice-number');
  if (!numberInput) return;

  const fb = getFirebase();
  if (!fb) return;

  try {
    const { db, collection, getDocs } = fb;
    // Récupère toutes les factures existantes
    const querySnapshot = await getDocs(collection(db, 'factures'));
    
    // Compte le nombre de documents
    const count = querySnapshot.size;
    const nextNumber = count + 1;
    
    // Formate le numéro avec des zéros (ex: 0001)
    const formattedNumber = nextNumber.toString().padStart(4, '0');
    const year = new Date().getFullYear();
    
    numberInput.value = `FAC-${year}-${formattedNumber}`;
    syncInvoiceNumberPreview();
    
  } catch (err) {
    console.error("Erreur lors de la récupération du numéro de facture :", err);
    // Fallback en cas d'erreur
    const year = new Date().getFullYear();
    numberInput.value = `FAC-${year}-0001`;
    syncInvoiceNumberPreview();
  }
}

function syncInvoiceNumberPreview() {
  const previewNum = document.getElementById('preview-invoice-number');
  if (previewNum) previewNum.textContent = document.getElementById('invoice-number')?.value;
}

function syncInvoiceNumberPreview() {
  const previewNum = document.getElementById('preview-invoice-number');
  if (previewNum) previewNum.textContent = getValue('invoice-number');
}

/* ================= 4. LIGNES D'ARTICLES & CALCULS ================= */

function formatMoney(amount) {
  const currency = currencySelect ? currencySelect.value : 'FCFA';
  const symbols = { FCFA: 'FCFA', EUR: '€', USD: '$', GHS: 'GH₵' };
  return new Intl.NumberFormat('fr-FR').format(amount) + ' ' + (symbols[currency] || currency);
}

function setupItemsTable() {
  if (!itemsBody) return;

  itemsBody.addEventListener('input', (e) => {
    if (e.target.matches('.item-qty, .item-price, .item-discount, .item-desc')) recalculateAll();
  });

  itemsBody.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (!deleteBtn) return;
    const rows = itemsBody.querySelectorAll('tr');
    if (rows.length > 1) {
      deleteBtn.closest('tr').remove();
    } else {
      rows[0].querySelectorAll('input').forEach(input => (input.value = ''));
    }
    recalculateAll();
  });

  if (addItemBtn) {
    addItemBtn.addEventListener('click', () => {
      const firstRow = itemsBody.querySelector('tr');
      const newRow = firstRow.cloneNode(true);
      newRow.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      newRow.querySelectorAll('input').forEach(input => (input.value = ''));
      itemsBody.appendChild(newRow);
      recalculateAll();
    });
  }
}

function recalculateAll() {
  let grandTotal = 0;
  const rows = itemsBody.querySelectorAll('tr');
  const previewBody = document.getElementById('preview-items-body');
  let previewHtml = '';

  rows.forEach(row => {
    const desc = row.querySelector('.item-desc')?.value || '';
    const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
    const price = parseFloat(row.querySelector('.item-price')?.value) || 0;
    const discount = parseFloat(row.querySelector('.item-discount')?.value);

    const hasDiscount = !isNaN(discount) && discount > 0;
    const lineTotal = hasDiscount ? discount : qty * price;
    grandTotal += lineTotal;

    const totalCell = row.querySelector('.item-total');
    if (totalCell) totalCell.textContent = formatMoney(lineTotal);

    if (!desc) return;

    previewHtml += `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;">${escapeHTML(desc)}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${qty}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${formatMoney(price)}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;color:#d9534f;">${hasDiscount ? formatMoney(discount) : '-'}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">${formatMoney(lineTotal)}</td>
      </tr>`;
  });

  if (grandTotalAmount) grandTotalAmount.textContent = formatMoney(grandTotal);
  if (previewBody) {
    previewBody.innerHTML = previewHtml ||
      '<tr><td colspan="5" style="padding:10px;color:#aaa;">Aucun article pour l\'instant...</td></tr>';
  }
  const previewTotal = document.getElementById('preview-grand-total');
  if (previewTotal) previewTotal.textContent = formatMoney(grandTotal);

  return grandTotal;
}

/* ================= 5. SAUVEGARDE DIRECTE DANS FIREBASE ================= */

function setupSaveButton() {
  document.getElementById('sauvegarder-invoice-btn')?.addEventListener('click', saveInvoice);
}

async function saveInvoice() {
  const loadingOverlay = document.getElementById('save-loading-overlay');

  const showLoading = () => {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
  };

  const hideLoading = () => {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  };

  const total = recalculateAll();

  const items = [];
  itemsBody.querySelectorAll('tr').forEach(row => {
    const desc = row.querySelector('.item-desc')?.value || '';
    if (!desc) return;

    items.push({
      description: desc,
      qty: parseFloat(row.querySelector('.item-qty')?.value) || 0,
      price: parseFloat(row.querySelector('.item-price')?.value) || 0,
      discount: parseFloat(row.querySelector('.item-discount')?.value) || 0
    });
  });

  if (items.length === 0) {
    alert('Ajoute au moins un article avant de sauvegarder.');
    return;
  }

  const clientName = getValue('client-name-input');

  if (!clientName) {
    alert('Le nom du client est requis.');
    return;
  }

  // À partir d'ici, la sauvegarde va réellement commencer
  showLoading();

  const number = getValue('invoice-number');

  const invoiceData = {
    number,
    date: getValue('invoice-date') || new Date().toISOString().slice(0, 10),
    currency: currencySelect ? currencySelect.value : 'FCFA',

    issuer: {
      name: getValue('issuer-name-input'),
      phone: getValue('issuer-phone-input'),
      email: getValue('issuer-email-input'),
      address: getValue('issuer-address-input'),
      rccm: getValue('issuer-rccm-input'),
      logo: document.getElementById('issuer-logo-preview')?.src || ''
    },

    client: {
      name: clientName,
      address: getValue('client-address-input'),
      email: getValue('client-email-input'),
      phone: getValue('client-phone-input')
    },

    items,
    total,
    status: 'Payé',
    createdAt: new Date().toISOString()
  };

  saveIssuerSettings();

  const fb = getFirebase();

  if (fb) {
    try {
      const { db, collection, getDocs, addDoc, doc, updateDoc } = fb;

      const querySnapshot = await getDocs(collection(db, 'factures'));
      let existingDocId = null;

      querySnapshot.forEach(docSnap => {
        if (docSnap.data().number === number) {
          existingDocId = docSnap.id;
        }
      });

      if (existingDocId) {
        await updateDoc(
          doc(db, 'factures', existingDocId),
          invoiceData
        );
      } else {
        await addDoc(
          collection(db, 'factures'),
          invoiceData
        );
      }

    } catch (err) {
      console.error("Erreur d'enregistrement Firebase :", err);

      hideLoading();

      alert("Erreur lors de la sauvegarde sur Firebase.");
      return;
    }
  }

  window.location.href = 'dashboard.html';
}
/* ================= 6. TÉLÉCHARGEMENT PDF ================= */

function setupDownloadButton() {
  const downloadBtn = document.getElementById('télécharger-btn-pdf');
  if (!downloadBtn) return;
  downloadBtn.addEventListener('click', () => downloadInvoicePDF(downloadBtn));
}

function downloadInvoicePDF(downloadBtn) {
  const element = document.getElementById('invoice-final-paper');
  if (!element) { alert("Erreur : Impossible de trouver la zone d'aperçu de la facture."); return; }
  if (typeof html2pdf === 'undefined') { alert("Erreur : La bibliothèque de génération PDF n'est pas chargée."); return; }

  const invoiceName = getValue('invoice-number') || 'facture';
  const options = {
    margin: 10,
    filename: `${invoiceName}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  if (downloadBtn) { downloadBtn.textContent = '⏳ Génération...'; downloadBtn.disabled = true; }

  html2pdf().from(element).set(options).save()
    .then(() => resetDownloadBtn(downloadBtn))
    .catch(err => {
      console.error('Erreur PDF :', err);
      alert('Une erreur est survenue lors de la génération du PDF.');
      resetDownloadBtn(downloadBtn);
    });
}

function resetDownloadBtn(downloadBtn) {
  if (!downloadBtn) return;
  downloadBtn.textContent = '📄 Télécharger PDF';
  downloadBtn.disabled = false;
}

/* ================= 7. MODE ÉDITION ================= */

async function applyEditModeIfAny() {
  const params = new URLSearchParams(window.location.search);
  const editNumber = params.get('edit');
  if (!editNumber) return;

  const fb = getFirebase();
  if (!fb) return;

  try {
    const { db, collection, getDocs } = fb;
    const querySnapshot = await getDocs(collection(db, 'factures'));
    let inv = null;
    
    querySnapshot.forEach(docSnap => {
      if (docSnap.data().number === editNumber) {
        inv = docSnap.data();
      }
    });

    if (!inv) return;

    setValue('invoice-number', inv.number);
    setValue('invoice-date', inv.date);
    if (currencySelect) currencySelect.value = inv.currency || 'FCFA';

    setValue('issuer-name-input', inv.issuer?.name);
    setValue('issuer-phone-input', inv.issuer?.phone);
    setValue('issuer-email-input', inv.issuer?.email);
    setValue('issuer-address-input', inv.issuer?.address);
    setValue('issuer-rccm-input', inv.issuer?.rccm);
    if (inv.issuer?.logo) setLogo(inv.issuer.logo);

    setValue('client-name-input', inv.client?.name);
    setValue('client-address-input', inv.client?.address);
    setValue('client-email-input', inv.client?.email);
    setValue('client-phone-input', inv.client?.phone);

    const templateRow = itemsBody.querySelector('tr');
    itemsBody.innerHTML = '';
    const items = (inv.items && inv.items.length) ? inv.items : [{}];
    items.forEach(item => {
      const row = templateRow.cloneNode(true);
      row.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      row.querySelector('.item-desc').value = item.description || '';
      row.querySelector('.item-qty').value = item.qty || '';
      row.querySelector('.item-price').value = item.price || '';
      row.querySelector('.item-discount').value = item.discount || '';
      itemsBody.appendChild(row);
    });

    updateIssuerPreview();
    updateClientPreview();
    syncInvoiceNumberPreview();
    syncDatePreview();

    if (params.get('autodownload') === '1') {
      setTimeout(() => {
        downloadInvoicePDF(document.getElementById('télécharger-btn-pdf'));
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
      }, 400);
    }
  } catch (err) {
    console.error("Erreur chargement mode édition :", err);
  }
}