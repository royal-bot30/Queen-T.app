// ==========================================================
// PARAMÈTRES DE L'ENTREPRISE ET SÉCURITÉ (FIREBASE + LOCALSTORAGE)
// ==========================================================

let currentUid = null;

// Sélection des éléments du DOM - Entreprise
const settingsForm = document.getElementById('settings-form');
const inputLogo = document.getElementById('input_logo');
const apercuContainer = document.getElementById('aperçu_logo_container');
const imageApercu = document.getElementById('image_apercu');
const btnSupprimer = document.getElementById('btn_supprimer_logo');
const submitBtn = settingsForm.querySelector('button[type="submit"]');

// Sélection des éléments du DOM - Mot de passe
const passwordForm = document.getElementById('formulaire_changement_mdp');
const btnEnregistrerMdp = document.getElementById('btn_enregistrer_mdp');

// Noms des clés de stockage local
const LOCAL_KEY = 'queenty_settings';
const LOGO_KEY = 'entreprise_logo';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Affichage instantané via LocalStorage (pour éviter le temps de chargement)
    loadFromLocal();
    
    // 2. Attente de la session Firebase Auth pour charger/sauvegarder dans le profil personnel
    const authPret = await attendreAuthFirebase();
    if (authPret) {
        window.authModules.onAuthStateChanged(window.auth, async (user) => {
            if (user) {
                currentUid = user.uid;
                await loadFromFirebase();
            } else {
                window.location.href = 'index.html';
            }
        });
    }

    // Gestion du formulaire de mot de passe
    if (passwordForm) {
        passwordForm.addEventListener('submit', handlePasswordChange);
    }
});

// Fonction utilitaire pour patienter pendant le chargement de Firebase Auth
function attendreAuthFirebase() {
    return new Promise((resolve) => {
        if (window.auth && window.authModules) return resolve(true);
        let tentatives = 0;
        const interval = setInterval(() => {
            tentatives++;
            if (window.auth && window.authModules) {
                clearInterval(interval);
                resolve(true);
            } else if (tentatives > 50) {
                clearInterval(interval);
                resolve(false);
            }
        }, 100);
    });
}

// Notification visuelle propre (sans alert() natif)
function afficherNotification(message, type = 'success') {
    let notif = document.getElementById('app-notification');
    if (!notif) {
        notif = document.createElement('div');
        notif.id = 'app-notification';
        notif.style.cssText = "position:fixed; bottom:20px; right:20px; padding:12px 20px; border-radius:8px; color:#fff; font-weight:bold; z-index:9999; transition:opacity 0.3s ease;";
        document.body.appendChild(notif);
    }
    notif.style.backgroundColor = type === 'error' ? '#d9534f' : '#28a745';
    notif.textContent = message;
    notif.style.opacity = '1';
    setTimeout(() => { notif.style.opacity = '0'; }, 3500);
}

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
    if (!window.db || !window.dbModules || !window.dbModules.getDoc || !currentUid) return;
    const { db, doc, getDoc } = window.dbModules;

    try {
        // Ciblage strict du profil personnel de l'utilisateur
        const docRef = doc(db, 'users', currentUid, 'settings', 'entreprise_profil');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            
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

            localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
        }
    } catch (error) {
        console.error("Erreur lors du chargement depuis Firebase :", error);
    }
}

// --- GESTION DU LOGO ---

inputLogo.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Image = e.target.result;
            imageApercu.src = base64Image;
            apercuContainer.classList.remove('hidden');
            localStorage.setItem(LOGO_KEY, base64Image);
        };
        reader.readAsDataURL(file);
    }
});

btnSupprimer.addEventListener('click', function() {
    localStorage.removeItem(LOGO_KEY);
    imageApercu.src = "";
    apercuContainer.classList.add('hidden');
    inputLogo.value = "";
});

// --- SAUVEGARDE DES PARAMÈTRES ENTREPRISE ---

settingsForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!currentUid) {
        afficherNotification("Utilisateur non authentifié.", "error");
        return;
    }

    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "⏳ Enregistrement...";
    submitBtn.disabled = true;

    const companyData = {
        name: document.getElementById('set-name').value,
        rccm: document.getElementById('set-rccm').value,
        address: document.getElementById('set-address').value,
        email: document.getElementById('set-email').value,
        phone: document.getElementById('set-phone').value,
        logo: "" 
    };

    const currentLogo = localStorage.getItem(LOGO_KEY);
    const existingSettings = JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};

    if (currentLogo) {
        companyData.logo = currentLogo;
    } else if (existingSettings.logo) {
        companyData.logo = existingSettings.logo;
    }

    localStorage.setItem(LOCAL_KEY, JSON.stringify(companyData));

    let success = false;
    if (window.db && window.dbModules && window.dbModules.setDoc) {
        const { db, doc, setDoc } = window.dbModules;
        try {
            // Sauvegarde dans l'espace personnel users/{uid}/settings/entreprise_profil
            await setDoc(doc(db, 'users', currentUid, 'settings', 'entreprise_profil'), companyData);
            success = true;
        } catch (error) {
            console.error("Erreur de sauvegarde Firebase :", error);
        }
    }

    if (success) {
        submitBtn.innerHTML = "✅ Sauvegardé avec succès !";
        submitBtn.style.backgroundColor = "#2e7d32";
        afficherNotification("Paramètres enregistrés avec succès.");
    } else {
        submitBtn.innerHTML = "❌ Erreur de sauvegarde";
        submitBtn.style.backgroundColor = "#d9534f";
        afficherNotification("Erreur lors de la sauvegarde Firebase.", "error");
    }

    setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        submitBtn.style.backgroundColor = ""; 
    }, 3000);
});

// --- GESTION DU CHANGEMENT DE MOT DE PASSE SÉCURISÉ ---

async function handlePasswordChange(e) {
    e.preventDefault();

    const ancienMdp = document.getElementById('ancien_mot_de_passe').value;
    const nouveauMdp = document.getElementById('nouveau_mot_de_passe').value;
    const confirmerMdp = document.getElementById('confirmer_mot_de_passe').value;

    if (nouveauMdp !== confirmerMdp) {
        afficherNotification("Les nouveaux mots de passe ne correspondent pas.", "error");
        return;
    }

    if (nouveauMdp.length < 6) {
        afficherNotification("Le nouveau mot de passe doit contenir au moins 6 caractères.", "error");
        return;
    }

    const user = window.auth.currentUser;
    if (!user || !user.email) {
        afficherNotification("Aucun utilisateur connecté.", "error");
        return;
    }

    const originalText = btnEnregistrerMdp.innerHTML;
    btnEnregistrerMdp.innerHTML = "⏳ Modification...";
    btnEnregistrerMdp.disabled = true;

    try {
        const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = window.authModules;
        
        // 1. Ré-authentification obligatoire de l'utilisateur avec son ancien mot de passe
        const credential = EmailAuthProvider.credential(user.email, ancienMdp);
        await reauthenticateWithCredential(user, credential);

        // 2. Mise à jour effective du mot de passe
        await updatePassword(user, nouveauMdp);

        afficherNotification("Mot de passe modifié avec succès !");
        passwordForm.reset();
    } catch (error) {
        console.error("Erreur modification mot de passe :", error);
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            afficherNotification("L'ancien mot de passe est incorrect.", "error");
        } else {
            afficherNotification("Erreur : " + error.message, "error");
        }
    } finally {
        btnEnregistrerMdp.innerHTML = originalText;
        btnEnregistrerMdp.disabled = false;
    }
}