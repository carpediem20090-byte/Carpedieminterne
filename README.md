# Carpe Diem — Gestion interne

Application interne du tabac Carpe Diem : relève quotidienne, colis clients (point relais), commandes fournisseurs et factures, pour l'instant. D'autres modules (planning, stock, produits à booster…) viendront s'ajouter par la suite.

## Ce qui est fait pour l'instant

- Connexion par compte individuel (un compte par personne)
- **Relève** : fil d'infos du jour, tout le monde peut écrire et lire
- **Colis clients** : enregistrement des réceptions (transporteur, vrac/sac/retours) + signalement des erreurs de remise
- **Commandes fournisseurs** : création d'une commande par fournisseur, réception avec photo du colis + photo de la facture et nom de la personne qui a réceptionné
- **Factures** : upload d'un PDF ou d'une photo, fournisseur/montant/date renseignés à la main pour l'instant (voir note plus bas), liste filtrable par fournisseur, téléchargement pour la compta
- Tableau de bord d'accueil qui regroupe les dernières infos, les erreurs à traiter et les commandes en attente

### Note sur les factures

Pour l'instant, le fournisseur/montant/date d'une facture se saisissent à la
main lors de l'upload (2-3 champs rapides). La reconnaissance automatique du
contenu du PDF/photo (comme évoqué au départ) demandera une petite fonction
côté serveur qui appelle un modèle pour lire le document — c'est une suite
logique qu'on peut construire ensuite une fois que le reste est validé en
usage réel.

## Mise en route (à faire une seule fois)

### 1. Créer le projet Supabase (base de données + comptes)

1. Aller sur [supabase.com](https://supabase.com) et créer un compte gratuit
2. Créer un nouveau projet (choisir une région proche, ex. Europe)
3. Une fois le projet créé, aller dans **SQL Editor**, coller le contenu du fichier
   `supabase/migrations/0001_init.sql` et l'exécuter, puis faire la même chose avec
   `supabase/migrations/0002_commandes_factures.sql` — ça crée toutes les tables
   (l'ordre compte : 0001 avant 0002)
4. Aller dans **Project Settings → API** et noter :
   - `Project URL`
   - `anon public` key

### 2. Créer les 8 comptes

Dans Supabase, aller dans **Authentication → Users → Add user** et créer un
compte par personne (email + mot de passe). Dans le champ "User Metadata",
ajouter `{"full_name": "Prénom Nom"}` pour que le nom s'affiche bien dans
l'appli.

### 3. Déployer le site (Vercel)

1. Mettre ce dossier sur GitHub (ou demander à Claude de le faire)
2. Aller sur [vercel.com](https://vercel.com), créer un compte gratuit,
   "Import Project" et choisir le dépôt GitHub
3. Dans les réglages du projet Vercel, ajouter deux variables d'environnement :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (les valeurs notées à l'étape 1)
4. Déployer — Vercel donne un lien du type `carpe-diem-gestion.vercel.app`,
   accessible depuis n'importe quel téléphone

### 4. Utilisation quotidienne

Chacun ajoute le lien à son écran d'accueil (comme une appli) et se connecte
avec son compte. Pas besoin de repasser par ces étapes ensuite : tout se
gère depuis l'appli.

## Développement local (optionnel)

```bash
npm install
cp .env.example .env.local   # puis remplir avec les valeurs Supabase
npm run dev
```
