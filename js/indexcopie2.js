// index.js - Gestion Authentification Firebase & Base de données

document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // --- UTILITIES ---
    const afficherErreur = (formulaire, message) => {
        let msgBox = formulaire.querySelector('.auth-error-msg');
        if (!msgBox) {
            msgBox = document.createElement('div');
            msgBox.className = 'auth-error-msg';
            msgBox.style.cssText = 'color: #c0392b; background: #fadbd8; padding: 10px; border-radius: 5px; margin-bottom: 15px; font-size: 14px; text-align: center;';
            formulaire.insertBefore(msgBox, formulaire.querySelector('.form-group'));
        }
        msgBox.textContent = message;
        setTimeout(() => { if (msgBox) msgBox.remove(); }, 4000);
    };

    if (!window.auth || !window.authModules) return;

    const { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } = window.authModules;
    const { doc, setDoc, getDoc } = window.dbModules;

    // --- 1. SÉCURITÉ (PASSIF) ---
    // On ne redirige plus automatiquement ici pour éviter les boucles
    onAuthStateChanged(window.auth, async (user) => {
        if (user) {
            // Si connecté et sur Dashboard/Settings, on charge les infos
            if (currentPage === 'dashboard.html' || currentPage === 'settings.html') {
                try {
                    const userDoc = await getDoc(doc(window.db, 'users', user.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        if (currentPage === 'dashboard.html') {
                            const titleElement = document.querySelector('.dashboard-header h1');
                            if (titleElement && data.companyName) {
                                titleElement.textContent = `Bonjour, ${data.companyName} 👋`;
                            }
                        }
                        if (currentPage === 'settings.html') {
                            const elName = document.getElementById('set-name');
                            const elRccm = document.getElementById('set-rccm');
                            const elAddress = document.getElementById('set-address');
                            const elEmail = document.getElementById('set-email');
                            const elPhone = document.getElementById('set-phone');
                            if (elName) elName.value = data.companyName || '';
                            if (elRccm) elRccm.value = data.rccm || '';
                            if (elAddress) elAddress.value = data.address || '';
                            if (elEmail) elEmail.value = data.email || user.email || '';
                            if (elPhone) elPhone.value = data.phone || '';
                        }
                    }
                } catch (error) {
                    console.error("Erreur chargement profil:", error);
                }
            }
        } else {
            // Si non connecté et sur une page protégée, on renvoie à l'accueil
            if (currentPage !== 'index.html' && currentPage !== '') {
                window.location.replace('index.html');
            }
        }
    });

    // --- 2. CONNEXION ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            
            try {
                await signInWithEmailAndPassword(window.auth, email, password);
                window.location.href = 'dashboard.html'; // Redirection manuelle après succès
            } catch (error) {
                afficherErreur(loginForm, "Email ou mot de passe incorrect.");
            }
        });
    }

    // --- 3. INSCRIPTION ---
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const companyName = document.getElementById('reg-company').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;

            try {
                const userCred = await createUserWithEmailAndPassword(window.auth, email, password);
                await setDoc(doc(window.db, 'users', userCred.user.uid), {
                    companyName: companyName,
                    email: email,
                    createdAt: new Date().toISOString()
                });
                window.location.href = 'dashboard.html'; // Redirection manuelle
            } catch (error) {
                afficherErreur(registerForm, "Erreur lors de la création.");
            }
        });
    }

    // --- 4. DÉCONNEXION (FORCÉE ET INDÉPENDANTE) ---
    // On écoute les clics sur les boutons de déconnexion de manière globale, sans bloquer le reste
    document.addEventListener('click', async (e) => {
        const logoutBtn = e.target.closest('.logout-btn');
        if (logoutBtn) {
            e.preventDefault();
            try {
                // On vérifie si l'objet auth et la fonction signOut existent dynamiquement au moment du clic
                if (window.auth && window.authModules && window.authModules.signOut) {
                    await window.authModules.signOut(window.auth);
                }
                // Nettoyage éventuel du localStorage local si besoin
                localStorage.removeItem('entreprise_logo');
                window.location.replace('index.html'); // Redirection immédiate
            } catch (error) {
                console.error("Erreur de déconnexion", error);
                // Redirection de secours même si Firebase renvoie une petite erreur de réseau
                window.location.replace('index.html');
            }
        }
    });

    // --- 5. SAUVEGARDE DES PARAMÈTRES ---
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = window.auth.currentUser;
            if (!user) return;

            try {
                await setDoc(doc(window.db, 'users', user.uid), {
                    companyName: document.getElementById('set-name').value,
                    rccm: document.getElementById('set-rccm').value,
                    address: document.getElementById('set-address').value,
                    email: document.getElementById('set-email').value,
                    phone: document.getElementById('set-phone').value
                }, { merge: true });
                alert("Enregistré !");
            } catch (error) {
                alert("Erreur lors de la sauvegarde.");
            }
        });
    }
});