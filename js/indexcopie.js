// script.js - Gestion locale (LocalStorage) pour tester l'application Facturo

document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // 1. Simulation de la Connexion (depuis index.html)
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            localStorage.setItem('facturo_logged', 'true');
            window.location.href = 'dashboard.html';
        });
    }

    // 2. Simulation de l'Inscription (depuis index.html)
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const companyName = document.getElementById('reg-company').value;
            localStorage.setItem('facturo_company_name', companyName);
            localStorage.setItem('facturo_logged', 'true');
            window.location.href = 'dashboard.html';
        });
    }

    // 3. Sécurité / Protection des pages : Redirige vers index.html si non connecté
    const isLoggedIn = localStorage.getItem('facturo_logged') === 'true';
    if (currentPage !== 'index.html' && !isLoggedIn) {
        window.location.href = 'index.html';
    }

    // 4. Gestion de la Déconnexion (sur toutes les pages)
    const logoutLinks = document.querySelectorAll('.logout-btn');
    logoutLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('facturo_logged');
            window.location.href = 'index.html';
        });
    });

    // 5. Affichage dynamique du nom de l'entreprise sur le Dashboard
    if (currentPage === 'dashboard.html') {
        const savedName = localStorage.getItem('facturo_company_name');
        if (savedName) {
            const titleElement = document.querySelector('.dashboard-header h1');
            if (titleElement) {
                titleElement.textContent = `Bonjour, ${savedName} 👋`;
            }
        }
    }

    // 6. Sauvegarde et chargement des Paramètres (settings.html)
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        // Charger les anciennes valeurs si elles existent
        document.getElementById('set-name').value = localStorage.getItem('facturo_company_name') || '';
        document.getElementById('set-rccm').value = localStorage.getItem('facturo_company_rccm') || '';
        document.getElementById('set-address').value = localStorage.getItem('facturo_company_address') || '';
        document.getElementById('set-email').value = localStorage.getItem('facturo_company_email') || '';
        document.getElementById('set-phone').value = localStorage.getItem('facturo_company_phone') || '';

        // Sauvegarder au clic
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            localStorage.setItem('facturo_company_name', document.getElementById('set-name').value);
            localStorage.setItem('facturo_company_rccm', document.getElementById('set-rccm').value);
            localStorage.setItem('facturo_company_address', document.getElementById('set-address').value);
            localStorage.setItem('facturo_company_email', document.getElementById('set-email').value);
            localStorage.setItem('facturo_company_phone', document.getElementById('set-phone').value);
            
            
        });
    }
});
const filterButtons = document.querySelectorAll('.filter-btn');
filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});