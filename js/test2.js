/**
 * Module de Gestion des Stocks - Queen-T
 * Stockage : Firebase Firestore (collections 'produits' et 'semaines').
 * Nécessite que le script de configuration Firebase (window.db + window.dbModules)
 * soit chargé AVANT ce fichier dans le HTML.
 */

const StockApp = {
    produits: [],
    semaineActuelle: null,
    semaineActuelleId: null,
    historiqueSemaines: [],
    filtreSemaines: { min: null, max: null },
    produitEnEditionId: null, 
    _debounceTimer: null,
    _erreurTimer: null,

    async init() {
        this.bindEvents();
        await this.chargerDonnees();
        this.rafraichirInterface();
    },

    /* ---------------- Accès Firebase ---------------- */

    getFirebase() {
        if (!window.db || !window.dbModules) {
            this.afficherErreur("Firebase n'est pas initialisé. Vérifie que le script de configuration est bien chargé avant stocks.js.");
            return null;
        }
        return { db: window.db, ...window.dbModules };
    },

    async chargerDonnees() {
        const fb = this.getFirebase();
        if (!fb) return;
        const { db, collection, getDocs } = fb;

        try {
            const snapProduits = await getDocs(collection(db, 'produits'));
            this.produits = snapProduits.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(p => p.actif !== false);

            const snapSemaines = await getDocs(collection(db, 'semaines'));
            const toutes = snapSemaines.docs.map(d => ({ id: d.id, ...d.data() }));

            const active = toutes.find(s => s.active);
            this.semaineActuelle = active || null;
            this.semaineActuelleId = active ? active.id : null;
            this.historiqueSemaines = toutes.filter(s => !s.active).sort((a, b) => b.numero - a.numero);

        } catch (err) {
            this.afficherErreur('Impossible de charger les données depuis Firebase. Vérifie ta connexion.');
            console.error('Erreur chargement Firestore :', err);
        }
    },

    afficherErreur(message) {
        console.error(message);
        let banniere = document.getElementById('stockapp-erreur-banniere');
        if (!banniere) {
            banniere = document.createElement('div');
            banniere.id = 'stockapp-erreur-banniere';
            banniere.style.cssText =
                'position:fixed;top:0;left:0;right:0;background:#c0392b;color:#fff;padding:10px 16px;text-align:center;font-size:14px;z-index:10000;';
            document.body.prepend(banniere);
        }
        banniere.textContent = message;
        clearTimeout(this._erreurTimer);
        this._erreurTimer = setTimeout(() => banniere.remove(), 5000);
    },

    /* ---------------- Événements UI ---------------- */

    bindEvents() {
        const btnAjouter = document.getElementById('btn_ajouter_produit');
        const btnAnnuler = document.getElementById('btn_annuler_produit');
        if (btnAjouter) btnAjouter.onclick = () => {
            this.produitEnEditionId = null; 
            const btnSubmit = document.querySelector('#formulaire_produit button[type="submit"]');
            if(btnSubmit) btnSubmit.textContent = "Enregistrer le produit";
            document.getElementById('formulaire_produit').reset();
            this.basculerModale('modale_produit', true);
        };
        if (btnAnnuler) btnAnnuler.onclick = () => this.basculerModale('modale_produit', false);

        const formProduit = document.getElementById('formulaire_produit');
        if (formProduit) {
            formProduit.onsubmit = (e) => {
                e.preventDefault();
                const nom = document.getElementById('nom_produit').value.trim();
                const prix = parseFloat(document.getElementById('prix_vente').value);
                if (nom && !isNaN(prix)) {
                    if (this.produitEnEditionId) {
                        this.mettreAJourProduitBDD(this.produitEnEditionId, nom, prix);
                    } else {
                        this.ajouterProduit(nom, prix);
                    }
                    formProduit.reset();
                    this.basculerModale('modale_produit', false);
                }
            };
        }

        const inputRecherche = document.getElementById('recherche_produit');
        if (inputRecherche) {
            inputRecherche.oninput = (e) => this.filtrerProduits(e.target.value);
        }

        const btnNouvelleSemaine = document.getElementById('btn_nouvelle_semaine');
        if (btnNouvelleSemaine) {
            btnNouvelleSemaine.onclick = () => this.demarrerNouvelleSemaine();
        }

        const btnHistorique = document.getElementById('btn_historique');
        const btnFermerHistorique = document.getElementById('btn_fermer_historique');
        if (btnHistorique) btnHistorique.onclick = () => {
            this.afficherHistorique();
            this.basculerModale('modale_historique', true);
        };
        if (btnFermerHistorique) btnFermerHistorique.onclick = () => this.basculerModale('modale_historique', false);

        const btnFiltrer = document.getElementById('btn-filtrer');
        const filtreBox = document.getElementById('filtre-semaines');
        if (btnFiltrer && filtreBox) {
            btnFiltrer.onclick = () => {
                const visible = filtreBox.style.display !== 'none' && filtreBox.style.display !== '';
                filtreBox.style.display = visible ? 'none' : 'flex';
            };
        }

        const btnAppliquerFiltre = document.getElementById('btn-appliquer-filtre');
        if (btnAppliquerFiltre) {
            btnAppliquerFiltre.onclick = () => {
                const debut = document.getElementById('semaine-debut').value;
                const fin = document.getElementById('semaine-fin').value;
                this.filtreSemaines = {
                    min: debut !== '' ? parseInt(debut, 10) : null,
                    max: fin !== '' ? parseInt(fin, 10) : null
                };
                this.actualiserGraphique();
                this.afficherHistorique();
            };
        }

        const btnResetFiltre = document.getElementById('btn-reset-filtre');
        if (btnResetFiltre) {
            btnResetFiltre.onclick = () => {
                this.filtreSemaines = { min: null, max: null };
                const inputDebut = document.getElementById('semaine-debut');
                const inputFin = document.getElementById('semaine-fin');
                if (inputDebut) inputDebut.value = '';
                if (inputFin) inputFin.value = '';
                this.actualiserGraphique();
                this.afficherHistorique();
            };
        }
    },

    basculerModale(idModal, ouvrir) {
        const modal = document.getElementById(idModal);
        if (modal) modal.classList.toggle('hidden', !ouvrir);
    },

    /* ---------------- Produits (Firestore) ---------------- */

    async ajouterProduit(nom, prix) {
        const fb = this.getFirebase();
        if (!fb) return;
        const { db, collection, addDoc } = fb;

        try {
            const docRef = await addDoc(collection(db, 'produits'), { nom, prix, actif: true });
            const nouveauProduit = { id: docRef.id, nom, prix, actif: true };
            this.produits.push(nouveauProduit);

            if (this.semaineActuelle) {
                this.semaineActuelle.lignes.push({
                    produitId: nouveauProduit.id,
                    nom, prix,
                    stockInitial: 0,
                    approvisionnement: 0,
                    restant: 0,
                    vendu: 0
                });
                await this.sauvegarderSemaineActuelle();
            }

            this.rafraichirInterface();
        } catch (err) {
            this.afficherErreur("Erreur lors de l'ajout du produit. Vérifie ta connexion.");
            console.error('Erreur ajout produit :', err);
        }
    },

    modifierProduitUI(id, nom, prix) {
        this.produitEnEditionId = id;
        document.getElementById('nom_produit').value = nom;
        document.getElementById('prix_vente').value = prix;
        
        const btnSubmit = document.querySelector('#formulaire_produit button[type="submit"]');
        if(btnSubmit) btnSubmit.textContent = "Mettre à jour le produit";
        
        this.basculerModale('modale_produit', true);
    },

    async mettreAJourProduitBDD(id, nom, prix) {
        const fb = this.getFirebase();
        if (!fb) return;
        const { db, doc, updateDoc } = fb;

        try {
            await updateDoc(doc(db, 'produits', id), { nom, prix });
            
            const index = this.produits.findIndex(p => p.id === id);
            if (index !== -1) {
                this.produits[index].nom = nom;
                this.produits[index].prix = prix;
            }

            if (this.semaineActuelle) {
                const ligneSemaine = this.semaineActuelle.lignes.find(l => l.produitId === id);
                if (ligneSemaine) {
                    ligneSemaine.nom = nom;
                    ligneSemaine.prix = prix;
                    ligneSemaine.vendu = Math.max(0, (ligneSemaine.stockInitial + ligneSemaine.approvisionnement) - ligneSemaine.restant);
                    await this.sauvegarderSemaineActuelle();
                }
            }

            this.produitEnEditionId = null;
            this.rafraichirInterface();
        } catch (err) {
            this.afficherErreur("Erreur lors de la modification du produit.");
            console.error('Erreur modification produit :', err);
        }
    },

    async supprimerProduit(id, nomProduit) {
        if (!confirm(`Voulez-vous vraiment supprimer "${nomProduit}" ? Cela le retirera de la semaine en cours.`)) {
            return;
        }

        const fb = this.getFirebase();
        if (!fb) return;
        const { db, doc, updateDoc } = fb;

        try {
            await updateDoc(doc(db, 'produits', id), { actif: false });
            this.produits = this.produits.filter(p => p.id !== id);

            if (this.semaineActuelle) {
                this.semaineActuelle.lignes = this.semaineActuelle.lignes.filter(l => l.produitId !== id);
                await this.sauvegarderSemaineActuelle();
            }

            this.rafraichirInterface();
        } catch (err) {
            this.afficherErreur("Erreur lors de la suppression du produit.");
            console.error('Erreur archivage produit :', err);
        }
    },

    filtrerProduits(terme) {
        const lignes = document.querySelectorAll('#corps_tableau_produits tr:not(#message_aucun_produit)');
        const termeMinuscule = terme.toLowerCase();
        lignes.forEach(tr => {
            const nom = tr.cells[0]?.textContent.toLowerCase() || '';
            tr.style.display = nom.includes(termeMinuscule) ? '' : 'none';
        });
    },

    /* ---------------- Semaine active (Firestore) ---------------- */

    async sauvegarderSemaineActuelle() {
        if (!this.semaineActuelleId) return;
        const fb = this.getFirebase();
        if (!fb) return;
        const { db, doc, updateDoc } = fb;

        try {
            await updateDoc(doc(db, 'semaines', this.semaineActuelleId), {
                lignes: this.semaineActuelle.lignes
            });
        } catch (err) {
            this.afficherErreur('Erreur de synchronisation avec Firebase.');
            console.error('Erreur sauvegarde semaine :', err);
        }
    },

    mettreAJourSuivi(produitId, champ, valeur) {
        if (!this.semaineActuelle) return;

        const ligne = this.semaineActuelle.lignes.find(l => l.produitId === produitId);
        if (!ligne) return;

        ligne[champ] = parseFloat(valeur) || 0;
        ligne.vendu = Math.max(0, (ligne.stockInitial + ligne.approvisionnement) - ligne.restant);

        this.calculerEtAfficherResumes();

        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this.sauvegarderSemaineActuelle();
        }, 600);
    },

    /* ---------------- Gestion de l'Historique (Modifier / Supprimer) ---------------- */

    async supprimerSemaineHistorique(semaineId, numero) {
        const confirme = await new Promise(resolve => {
            this.afficherModaleConfirmation(`Voulez-vous vraiment supprimer définitivement la Semaine #${numero} de l'historique ?`, resolve);
        });
        if (!confirme) return;

        const fb = this.getFirebase();
        if (!fb) return;
        const { db, doc, deleteDoc } = fb;

        try {
            await deleteDoc(doc(db, 'semaines', semaineId));
            this.historiqueSemaines = this.historiqueSemaines.filter(s => s.id !== semaineId);
            this.rafraichirInterface();
            this.afficherHistorique();
        } catch (err) {
            this.afficherErreur("Erreur lors de la suppression de la semaine.");
            console.error('Erreur suppression semaine historique :', err);
        }
    },

    modifierSemaineHistorique(semaineId) {
        const semaine = this.historiqueSemaines.find(s => s.id === semaineId);
        if (!semaine) return;

        // Création d'une modale dynamique pour modifier les chiffres de la semaine archivée
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;padding:24px;border-radius:10px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);';

        let lignesHTML = (semaine.lignes || []).map((l, index) => `
            <div style="margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px;" data-index="${index}">
                <strong>${this.echapperHTML(l.nom)}</strong> (${l.prix} FCFA)<br>
                <div style="display:flex;gap:10px;margin-top:5px;font-size:13px;">
                    <label>Initial: <input type="number" class="edit-init" value="${l.stockInitial || 0}" style="width:60px;"></label>
                    <label>Appro: <input type="number" class="edit-appro" value="${l.approvisionnement || 0}" style="width:60px;"></label>
                    <label>Restant: <input type="number" class="edit-restant" value="${l.restant || 0}" style="width:60px;"></label>
                </div>
            </div>
        `).join('');

        box.innerHTML = `
            <h3 style="margin-top:0;">Modifier Semaine #${semaine.numero}</h3>
            <div id="edit-lignes-container">${lignesHTML || '<p>Aucun produit</p>'}</div>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                <button type="button" id="annuler-edit-sem" style="padding:8px 14px;border-radius:6px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;">Annuler</button>
                <button type="button" id="sauver-edit-sem" style="padding:8px 14px;border-radius:6px;border:none;background:#ff007f;color:#fff;cursor:pointer;">Enregistrer</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        box.querySelector('#annuler-edit-sem').onclick = () => overlay.remove();

        box.querySelector('#sauver-edit-sem').onclick = async () => {
            const blocs = box.querySelectorAll('#edit-lignes-container > div');
            blocs.forEach((bloc, index) => {
                const init = parseFloat(bloc.querySelector('.edit-init').value) || 0;
                const appro = parseFloat(bloc.querySelector('.edit-appro').value) || 0;
                const restant = parseFloat(bloc.querySelector('.edit-restant').value) || 0;
                
                semaine.lignes[index].stockInitial = init;
                semaine.lignes[index].approvisionnement = appro;
                semaine.lignes[index].restant = restant;
                semaine.lignes[index].vendu = Math.max(0, (init + appro) - restant);
            });

            // Sauvegarde dans Firebase
            const fb = this.getFirebase();
            if (fb) {
                try {
                    const { db, doc, updateDoc } = fb;
                    await updateDoc(doc(db, 'semaines', semaineId), { lignes: semaine.lignes });
                } catch (err) {
                    this.afficherErreur("Erreur lors de la mise à jour de la semaine.");
                    console.error(err);
                }
            }

            overlay.remove();
            this.rafraichirInterface();
            this.afficherHistorique();
        };
    },

    /* ---------------- Nouvelle semaine ---------------- */

    demarrerNouvelleSemaine() {
        const message = this.semaineActuelle
            ? `Tu vas commencer une nouvelle semaine. La semaine #${this.semaineActuelle.numero} en cours sera archivée dans l'historique. Continuer ?`
            : 'Commencer une nouvelle semaine de suivi ?';

        this.afficherModaleConfirmation(message, (confirme) => {
            if (confirme) this._creerNouvelleSemaine();
        });
    },

    async _creerNouvelleSemaine() {
        const fb = this.getFirebase();
        if (!fb) return;
        const { db, collection, addDoc, doc, updateDoc } = fb;

        try {
            if (this.semaineActuelleId) {
                await updateDoc(doc(db, 'semaines', this.semaineActuelleId), { active: false });
                if (this.semaineActuelle) {
                    this.semaineActuelle.active = false;
                    this.historiqueSemaines.unshift(this.semaineActuelle);
                }
            }

            const numeroSemaineActuel = (this.historiqueSemaines.length > 0) ? this.historiqueSemaines.length + 1 : 1;
            
            const dateDebut = new Date().toISOString().split('T')[0];
            const finObj = new Date();
            finObj.setDate(finObj.getDate() + 7);
            const dateFin = finObj.toISOString().split('T')[0];

            const lignesSemaine = this.produits.map(p => ({
                produitId: p.id,
                nom: p.nom,
                prix: p.prix,
                stockInitial: 0,
                approvisionnement: 0,
                restant: 0,
                vendu: 0
            }));

            const nouvelleSemaine = {
                numero: numeroSemaineActuel,
                debut: dateDebut,
                fin: dateFin,
                lignes: lignesSemaine,
                active: true
            };

            const docRef = await addDoc(collection(db, 'semaines'), nouvelleSemaine);
            this.semaineActuelle = { id: docRef.id, ...nouvelleSemaine };
            this.semaineActuelleId = docRef.id;

            this.rafraichirInterface();
        } catch (err) {
            this.afficherErreur('Erreur lors de la création de la nouvelle semaine. Vérifie ta connexion.');
            console.error('Erreur création semaine :', err);
        }
    },

    afficherModaleConfirmation(message, callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';

        const box = document.createElement('div');
        box.style.cssText =
            'background:#fff;padding:24px;border-radius:10px;max-width:340px;width:100%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.2);';

        const text = document.createElement('p');
        text.style.cssText = 'margin:0 0 20px 0;font-size:15px;color:#333;line-height:1.4;';
        text.textContent = message;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:10px;justify-content:center;';

        const btnAnnuler = document.createElement('button');
        btnAnnuler.type = 'button';
        btnAnnuler.textContent = 'Annuler';
        btnAnnuler.style.cssText =
            'padding:10px 18px;border-radius:6px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;font-size:14px;';

        const btnConfirmer = document.createElement('button');
        btnConfirmer.type = 'button';
        btnConfirmer.textContent = 'Confirmer';
        btnConfirmer.style.cssText =
            'padding:10px 18px;border-radius:6px;border:none;background:#ff007f;color:#fff;cursor:pointer;font-size:14px;';

        actions.appendChild(btnAnnuler);
        actions.appendChild(btnConfirmer);
        box.appendChild(text);
        box.appendChild(actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const fermer = (resultat) => {
            document.body.removeChild(overlay);
            callback(resultat);
        };

        btnAnnuler.addEventListener('click', () => fermer(false));
        btnConfirmer.addEventListener('click', () => fermer(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) fermer(false); });
    },

    /* ---------------- Rendu de l'interface ---------------- */

    rafraichirInterface() {
        this.rendreTableauProduits();
        this.rendreBlocSemaine();
        this.rendreTableauSuivi();
        this.calculerEtAfficherResumes();
    },

    rendreTableauProduits() {
        const tbody = document.getElementById('corps_tableau_produits');
        if (!tbody) return;

        if (this.produits.length === 0) {
            tbody.innerHTML = `<tr id="message_aucun_produit"><td colspan="3">Aucun produit enregistré.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.produits.map(p => {
            const prixSecurise = (typeof p.prix === 'number' && !isNaN(p.prix)) ? p.prix : 0;
            return `
                <tr>
                    <td>${this.echapperHTML(p.nom)}</td>
                    <td>${prixSecurise.toLocaleString('fr-FR')} FCFA</td>
                    <td style="white-space:nowrap;">
                        <button type="button" class="btn-action" style="background:none; border:none; cursor:pointer; margin-right: 5px;" onclick="StockApp.modifierProduitUI('${p.id}', '${this.echapperHTML(p.nom)}', ${p.prix})" title="Modifier">✏️</button>
                        <button type="button" class="btn-action" style="background:none; border:none; cursor:pointer;" onclick="StockApp.supprimerProduit('${p.id}', '${this.echapperHTML(p.nom)}')" title="Supprimer">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    rendreBlocSemaine() {
        const numSemaineEl = document.getElementById('numero_semaine');
        const debutEl = document.getElementById('date_debut_semaine');
        const finEl = document.getElementById('date_fin_semaine');

        if (this.semaineActuelle) {
            if (numSemaineEl) numSemaineEl.textContent = `Semaine #${this.semaineActuelle.numero}`;
            if (debutEl) debutEl.textContent = this.semaineActuelle.debut;
            if (finEl) finEl.textContent = this.semaineActuelle.fin;
        } else {
            if (numSemaineEl) numSemaineEl.textContent = 'Aucune Semaine (Clique sur Nouvelle semaine)';
            if (debutEl) debutEl.textContent = '-';
            if (finEl) finEl.textContent = '-';
        }
    },

    rendreTableauSuivi() {
        const tbody = document.getElementById('corps_tableau_suivi');
        if (!tbody) return;

        if (!this.semaineActuelle || this.semaineActuelle.lignes.length === 0) {
            tbody.innerHTML = `<tr id="message_aucune_semaine"><td colspan="6">Cliquez sur "Nouvelle semaine" pour commencer ou ajoutez des produits.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.semaineActuelle.lignes.map(ligne => `
            <tr data-id="${ligne.produitId}">
                <td>${this.echapperHTML(ligne.nom)}</td>
                <td>
                    <input type="number" min="0" value="${ligne.stockInitial}" class="clean-input" style="width:70px;" 
                        oninput="StockApp.mettreAJourSuivi('${ligne.produitId}', 'stockInitial', this.value)">
                </td>
                <td>
                    <input type="number" min="0" value="${ligne.approvisionnement}" class="clean-input" style="width:70px;" 
                        oninput="StockApp.mettreAJourSuivi('${ligne.produitId}', 'approvisionnement', this.value)">
                </td>
                <td>
                    <input type="number" min="0" value="${ligne.restant}" class="clean-input" style="width:70px;" 
                        oninput="StockApp.mettreAJourSuivi('${ligne.produitId}', 'restant', this.value)">
                </td>
                <td><strong class="col-vendu">${ligne.vendu}</strong></td>
                <td><strong class="col-valeur">${(ligne.vendu * ligne.prix).toLocaleString('fr-FR')} FCFA</strong></td>
            </tr>
        `).join('');
    },

    calculerEtAfficherResumes() {
        const totalProduitsStockEl = document.getElementById('produits-en-stock');
        const produitsRestantsEl = document.getElementById('produits-restants');
        const produitsVendusEl = document.getElementById('produits_vendus');
        const valeurVentesEl = document.getElementById('valeur_du_stock_vendu');

        let totalRestant = 0;
        let totalVendu = 0;
        let chiffreAffairesVentes = 0;

        if (this.semaineActuelle && this.semaineActuelle.lignes) {
            this.semaineActuelle.lignes.forEach(l => {
                totalRestant += l.restant;
                totalVendu += l.vendu;
                chiffreAffairesVentes += (l.vendu * l.prix);

                const row = document.querySelector(`tr[data-id="${l.produitId}"]`);
                if (row) {
                    row.querySelector('.col-vendu').textContent = l.vendu;
                    row.querySelector('.col-valeur').textContent = (l.vendu * l.prix).toLocaleString('fr-FR') + ' FCFA';
                }
            });
        }

        if (totalProduitsStockEl) totalProduitsStockEl.textContent = this.produits.length;
        if (produitsRestantsEl) produitsRestantsEl.textContent = totalRestant;
        if (produitsVendusEl) produitsVendusEl.textContent = totalVendu;
        if (valeurVentesEl) valeurVentesEl.textContent = chiffreAffairesVentes.toLocaleString('fr-FR') + ' FCFA';

        this.actualiserGraphique();
    },

    getToutesLesSemaines() {
        const semaines = [...this.historiqueSemaines];
        if (this.semaineActuelle) semaines.push(this.semaineActuelle);
        return semaines.sort((a, b) => a.numero - b.numero);
    },

    getSemainesFiltrees() {
        const toutes = this.getToutesLesSemaines();
        const { min, max } = this.filtreSemaines;
        if (min == null && max == null) return toutes;
        return toutes.filter(s => {
            if (min != null && s.numero < min) return false;
            if (max != null && s.numero > max) return false;
            return true;
        });
    },

    calculerTotauxSemaine(semaine) {
        let totalVendu = 0;
        let totalRestant = 0;
        let valeurVentes = 0;
        (semaine.lignes || []).forEach(l => {
            totalVendu += l.vendu || 0;
            totalRestant += l.restant || 0;
            valeurVentes += (l.vendu || 0) * (l.prix || 0);
        });
        return { totalVendu, totalRestant, valeurVentes };
    },

    actualiserGraphique() {
        const canvas = document.getElementById('stockChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const semaines = this.getSemainesFiltrees();
        const labels = semaines.map(s => `Semaine #${s.numero}`);
        const data = semaines.map(s => this.calculerTotauxSemaine(s).totalVendu);

        if (window.myStockChart instanceof Chart) {
            window.myStockChart.destroy();
        }

        const ctx = canvas.getContext('2d');
        window.myStockChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Produits vendus par semaine (unités)',
                    data,
                    borderColor: '#ff007f',
                    backgroundColor: 'rgba(255, 0, 127, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    },

    afficherHistorique() {
        const container = document.getElementById('liste_historique_semaines');
        if (!container) return;

        const semaines = [...this.getSemainesFiltrees()].sort((a, b) => b.numero - a.numero);

        if (semaines.length === 0) {
            container.innerHTML = `<p style="padding: 10px 0;">Aucune semaine à afficher pour ce filtre.</p>`;
            return;
        }

        container.innerHTML = semaines.map(sem => {
            const { totalVendu, valeurVentes } = this.calculerTotauxSemaine(sem);

            const lignesHtml = (sem.lignes || []).map(l => `
                <tr>
                    <td>${this.echapperHTML(l.nom)}</td>
                    <td style="text-align:center;">${l.restant || 0}</td>
                    <td style="text-align:center;">${l.vendu || 0}</td>
                    <td style="text-align:right;">${((l.vendu || 0) * (l.prix || 0)).toLocaleString('fr-FR')} FCFA</td>
                </tr>
            `).join('');

            return `
                <div class="historique-semaine-item" style="border-bottom:1px solid #ddd;padding:10px 0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                        <div class="historique-semaine-header" style="flex-grow:1;cursor:pointer;">
                            <strong>Semaine #${sem.numero}</strong> (${sem.debut} au ${sem.fin})<br>
                            <span style="font-size:13px;color:#666;">${totalVendu} vendus · ${valeurVentes.toLocaleString('fr-FR')} FCFA</span>
                        </div>
                        <div style="display:flex;gap:5px;">
                            <button type="button" style="background:none;border:none;cursor:pointer;font-size:16px;" onclick="StockApp.modifierSemaineHistorique('${sem.id}')" title="Modifier cette semaine">✏️</button>
                            <button type="button" style="background:none;border:none;cursor:pointer;font-size:16px;" onclick="StockApp.supprimerSemaineHistorique('${sem.id}', ${sem.numero})" title="Supprimer cette semaine">🗑️</button>
                            <span class="historique-toggle-icon" style="cursor:pointer;padding:0 5px;">▼</span>
                        </div>
                    </div>
                    <div class="historique-semaine-detail" style="display:none;margin-top:10px;overflow-x:auto;">
                        <table class="data-table" style="width:100%;font-size:13px;">
                            <thead>
                                <tr><th>Produit</th><th>Restant</th><th>Vendu</th><th>Valeur</th></tr>
                            </thead>
                            <tbody>${lignesHtml || '<tr><td colspan="4">Aucun produit enregistré cette semaine-là.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.historique-semaine-item').forEach(item => {
            const header = item.querySelector('.historique-semaine-header');
            const toggleIcon = item.querySelector('.historique-toggle-icon');
            const detail = item.querySelector('.historique-semaine-detail');

            const toggleOpen = () => {
                const estOuvert = detail.style.display === 'block';
                detail.style.display = estOuvert ? 'none' : 'block';
                if (toggleIcon) toggleIcon.textContent = estOuvert ? '▼' : '▲';
            };

            header.addEventListener('click', toggleOpen);
            if (toggleIcon) toggleIcon.addEventListener('click', toggleOpen);
        });
    },

    echapperHTML(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    StockApp.init();
});