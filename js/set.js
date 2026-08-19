// ==========================================================
// PARAMÈTRES DE L'ENTREPRISE (FIREBASE + LOCALSTORAGE)
// ==========================================================

// Sélection des éléments du DOM
const settingsForm = document.getElementById('settings-form');
const inputLogo = document.getElementById('input_logo');
const apercuContainer = document.getElementById('aperçu_logo_container');
const imageApercu = document.getElementById('image_apercu');
const btnSupprimer = document.getElementById('btn_supprimer_logo');
const submitBtn = settingsForm.querySelector('button[type="submit"]');

// Noms des clés de stockage local
const LOCAL_KEY = 'queenty_settings';
const LOGO_KEY = 'entreprise_logo';

// Au chargement de la page
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Affichage instantané via LocalStorage
    loadFromLocal();
    
    // 2. Synchronisation avec Firebase en arrière-plan
    await loadFromFirebase();
});

// --- FONCTIONS DE CHARGEMENT ---

function loadFromLocal() {
    const savedSettings = JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};
    const savedLogo = localStorage.getItem(LOGO_KEY) || savedSettings.logo;

    if (savedSettings.name) document.getElementById('set-name').value = savedSettings.name;
    if (savedSettings.rccm) document.getElementById('set-rccm').value = savedSettings.rccm;
    if (savedSettings.address) document.getElementById('set-address').value = savedSettings.address;
    if (savedSettings.email) document.getElementById('set-email').value = savedSettings.email;
    if (savedSettings.phone) document.getElementById('set-phone').value = savedSettings.phone;

    if (savedLogo) {
        imageApercu.src = savedLogo;
        apercuContainer.classList.remove('hidden');
    }
}

async function loadFromFirebase() {
    if (!window.db || !window.dbModules || !window.dbModules.getDoc) return;
    const { db, doc, getDoc } = window.dbModules;

    try {
        const docRef = doc(db, 'settings', 'entreprise_profil');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Mettre à jour les champs HTML
            document.getElementById('set-name').value = data.name || '';
            document.getElementById('set-rccm').value = data.rccm || '';
            document.getElementById('set-address').value = data.address || '';
            document.getElementById('set-email').value = data.email || '';
            document.getElementById('set-phone').value = data.phone || '';

            if (data.logo) {
                imageApercu.src = data.logo;
                apercuContainer.classList.remove('hidden');
                localStorage.setItem(LOGO_KEY, data.logo);
            }

            // Rafraîchir le localStorage pour que le Builder ait toujours la version Firebase
            localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
        }
    } catch (error) {
        console.error("Erreur lors du chargement depuis Firebase :", error);
    }
}

// --- GESTION DU LOGO (Aperçu et Suppression) ---

inputLogo.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Image = e.target.result;
            imageApercu.src = base64Image;
            apercuContainer.classList.remove('hidden');
            // Sauvegarde temporaire pour l'aperçu
            localStorage.setItem(LOGO_KEY, base64Image);
        };
        reader.readAsDataURL(file);
    }
});

btnSupprimer.addEventListener('click', function() {
    localStorage.removeItem(LOGO_KEY);
    imageApercu.src = "";
    apercuContainer.classList.add('hidden');
    inputLogo.value = ""; // Réinitialise le champ fichier
});

// --- SAUVEGARDE (LocalStorage + Firebase) ---

settingsForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    // Feedback UX : On indique à l'utilisateur que ça charge
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "⏳ Enregistrement...";
    submitBtn.disabled = true;

    // Récupération des données du formulaire
    const companyData = {
        name: document.getElementById('set-name').value,
        rccm: document.getElementById('set-rccm').value,
        address: document.getElementById('set-address').value,
        email: document.getElementById('set-email').value,
        phone: document.getElementById('set-phone').value,
        logo: "" 
    };

    // Gestion du logo : on prend le logo actuel s'il a été changé, sinon l'ancien
    const currentLogo = localStorage.getItem(LOGO_KEY);
    const existingSettings = JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};

    if (currentLogo) {
        companyData.logo = currentLogo;
    } else if (existingSettings.logo) {
        companyData.logo = existingSettings.logo;
    }

    // 1. Sauvegarde instantanée dans le LocalStorage (Pour le builder)
    localStorage.setItem(LOCAL_KEY, JSON.stringify(companyData));

    // 2. Sauvegarde dans Firebase
    let success = false;
    if (window.db && window.dbModules && window.dbModules.setDoc) {
        const { db, doc, setDoc } = window.dbModules;
        try {
            // "setDoc" permet de créer ou écraser le document "entreprise_profil" dans la collection "settings"
            await setDoc(doc(db, 'settings', 'entreprise_profil'), companyData);
            success = true;
        } catch (error) {
            console.error("Erreur de sauvegarde Firebase :", error);
        }
    }

    // Feedback UX : Résultat de l'opération
    if (success) {
        submitBtn.innerHTML = "✅ Sauvegardé avec succès !";
        submitBtn.style.backgroundColor = "#2e7d32"; // Vert pour le succès
        submitBtn.style.borderColor = "#2e7d32";
    } else {
        submitBtn.innerHTML = "✅ Sauvegardé avec succès !";
        submitBtn.style.backgroundColor = "#2e7d32"; // Orange si Firebase échoue
        submitBtn.style.borderColor = "#2e7d32";
    }

    // On remet le bouton à son état normal après 3 secondes
    setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        submitBtn.style.backgroundColor = ""; 
        submitBtn.style.borderColor = "";
    }, 3000);
});