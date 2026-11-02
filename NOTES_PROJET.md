# Carpe Diem — Gestion interne : état du projet

> Fiche à lire en premier dans toute nouvelle conversation avec Claude.
> Elle est mise à jour à chaque séance de travail.
> Dernière mise à jour : 2 novembre 2026.

## Où sont les choses

| Quoi | Où |
|---|---|
| Site en ligne (production) | https://carpedieminterne.vercel.app — déployé automatiquement par Vercel depuis la branche `main` |
| Code | GitHub `carpediem20090-byte/Carpedieminterne` (⚠️ dépôt **public** : à passer en privé) |
| Base de données + comptes | Supabase, projet « carpediem20090-byte's Project » (`esfykhlnpvtkbrvthzep`, région eu-west-1) |
| Variables Vercel | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` |
| Notifications push | Edge Function `notifier-push` (+ webhook base de données) |

Ne pas confondre avec :
- **l'appli clients cigares** (« Carpe Diem Cigars », dépôt `cigar-diary`, autre projet Supabase « Carpe-diem ») ;
- les projets bridge (comptes séparés, ne jamais mélanger).

## Technique

- React 18 + TypeScript + Vite + Tailwind (couleurs : havane `#123A6B`, laiton `#B8892E`, corail `#C1503A`, crème `#F1E6CD`, encre `#23180D`).
- Mobile d'abord (barre d'onglets en bas : Accueil, Relève, Colis, Planning, Plus).
- Supabase : authentification par e-mail + mot de passe, un compte par personne.
- Rôles dans `profiles.role` : `patron` (accès complet) / `employe` (accès restreint). Fonction SQL `is_patron()`.
- Migrations dans `supabase/migrations/` (numérotées, à appliquer dans l'ordre).

## Rubriques

Relève · Colis clients (point relais : Mondial Relay, Chronopost, La Poste, DHL, GLS, UPS) · Commandes fournisseurs · Factures (patrons) · Stock & rangement · Carnet téléphonique · Demandes clients · Avoirs & échanges · Fournisseurs / marques · Planning (absences, heures) · Produits à booster · Actus · Équipe (patrons) · **Étiquettes prix** (nouveau).

## Étiquettes prix (ajouté le 2 nov. 2026)

- Page `/etiquettes` (menu « Plus » → « 🏷️ Étiquettes prix »). Code : `src/pages/Etiquettes.tsx` + moteur de dessin `src/lib/etiquettes/dessin.ts`.
- Table `etiquettes_articles` (migration 0027) : code-barres unique (EAN-13 / UPC-A), n°, rayon, marque, modèle, prix, et pour les cigares origine, temps, force (1 léger · 2 moyen · 3 moyen-corsé · 4 corsé), source de la force, composition [cape, sous-cape, tripe] ; pour les autres rayons 3 lignes d'info libres.
- Droits : toute l'équipe lit / crée / modifie ; **seuls les patrons suppriment**.
- 612 cigares importés (migration 0028), préparés avec Claude à partir des listes de stock, du Cigaroscope 2026 et du classement officiel Habanos.
- Deux modèles d'étiquette 50 × 40 mm : **cigare** (rayon « Cigares ») et **article** (tous les autres rayons). PDF A4 (28 par page) ou rouleau 50 × 40.
- Polices Poppins et logo dans `public/etiquettes/`.

### Règles à respecter pour les étiquettes

- **Ne rien mettre quand l'info n'est pas sûre** (règle du patron).
- Temps de fumage = toujours une **estimation** d'après le format, affichée « ≈ 45 min ».
- Sources de force (`force_source`) : `guide` (Cigaroscope, même cigare même format), `habanos` (classement officiel par marque/ligne), `web` (avis majoritaire de vendeurs, moins sûr), `gamme` (étendu depuis un autre format de la même gamme, moins sûr), `perso` (saisi dans l'appli).
- N° 121 (Oliva World Cup) et N° 133 (La Flor Dominicana Reserva Toro) : code-barres lu sur photo floue → `a_verifier = true`, à scanner en caisse.

## Points de vigilance connus

- Avertissements de sécurité Supabase **antérieurs** aux étiquettes : fonctions `SECURITY DEFINER` appelables par API (`handle_new_user`, `is_patron`, `marquer_commande_recue`, `notifier_push_trigger`), search_path non fixé sur `notifier_push_trigger`, protection mots de passe compromis désactivée. À traiter un jour (non urgent, rien d'exposé de grave).
- Dépôt GitHub public.

## À faire / idées

- Importer la valorisation du stock (export caisse **Bimedia**, Excel/CSV : code-barres, désignation, prix de vente TTC, famille) pour créer les étiquettes de tous les rayons.
- Éventuellement : modèle d'étiquette spécifique par rayon (ex. e-liquides avec taux de nicotine).
- Relier les étiquettes aux emplacements produits ou aux réceptions fournisseurs.
- Factures : reconnaissance automatique du contenu (prévu, pas fait).

## Façon de travailler

- Avant toute modification importante : expliquer ce qui change, pourquoi, quelles données sont touchées, et le risque pour l'existant.
- Les nouveautés passent d'abord par une **branche** (lien de test Vercel), puis sont fusionnées dans `main` après validation.
