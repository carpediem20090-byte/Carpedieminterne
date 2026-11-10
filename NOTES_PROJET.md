# Carpe Diem — Gestion interne : état du projet

> Fiche à lire en premier dans toute nouvelle conversation avec Claude.
> Elle est mise à jour à chaque séance de travail.
> Dernière mise à jour : 10 novembre 2026.

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
- Table `etiquettes_articles` (migration 0027) : code-barres unique (EAN-13 / UPC-A), n°, rayon, marque, modèle, prix, et pour les cigares origine, temps, force sur 5 niveaux depuis la migration 0029 (1 léger · 2 léger à moyen · 3 moyen · 4 moyen à corsé · 5 corsé, comme le classement Habanos), source de la force, composition [cape, sous-cape, tripe] ; pour les autres rayons 3 lignes d'info libres.
- Droits : toute l'équipe lit / crée / modifie ; **seuls les patrons suppriment**.
- 612 cigares importés (migration 0028), préparés avec Claude à partir des listes de stock, du Cigaroscope 2026 et du classement officiel Habanos.
- Deux modèles d'étiquette 50 × 40 mm : **cigare** (rayon « Cigares ») et **article** (tous les autres rayons). PDF A4 (28 par page) ou rouleau 50 × 40.
- Polices Poppins et logo dans `public/etiquettes/`.
- **Rayon « Enfants »** (7 nov.) : modèle coloré, 8 couleurs vives (une par article, jamais deux identiques à la suite sur le PDF), logo + prix en bulle, carte blanche, code-barres sur fond blanc. Déjà saisis : 13 Squishy Voom, 6 jeux Legami.
- Composition partielle possible (ex. cape seule) : affichée « Cape : … », l'article reste dans « Incomplets ».
- Le PDF attend le chargement des polices avant de mesurer les textes (sinon les noms débordaient) ; en cas d'échec il affiche l'erreur précise et se rabat sur une police standard.
- Cigare ajouté le 8 nov. : N° 312 Cumpay Volcán Maduro (absent des listes d'origine). D'autres cigares de la cave manquent peut-être : comparer avec un export caisse.

### Pont avec l'appli cigares (« la cave »)

- Fichier `src/lib/etiquettes/cave.ts`. Lecture seule de la fonction `label_info(codes)` de l'appli cigares (projet Supabase `ralnsnfdtkmqtvfubzml`, clé publique), lien par **code-barres**.
- Bouton « Compléter depuis l'appli cigares » (en masse) et « Remplir les cases vides » dans la fiche d'un article.
- Ne touche jamais au n°, au prix, à la marque ni au modèle. Cases vides cochées d'office ; différences décochées, sauf la force des cubains (classement Habanos dans l'appli cigares).
- Le temps de l'étiquette (estimation) n'est jamais contesté, seulement rempli s'il est vide.

### Règles à respecter pour les étiquettes

- **Ne rien mettre quand l'info n'est pas sûre** (règle du patron).
- Temps de fumage = toujours une **estimation** d'après le format, affichée « ≈ 45 min ».
- Sources de force (`force_source`) : `guide` (Cigaroscope, même cigare même format), `habanos` (classement officiel par marque/ligne), `web` (avis majoritaire de vendeurs, moins sûr), `gamme` (étendu depuis un autre format de la même gamme, moins sûr), `perso` (saisi dans l'appli), `cave` (repris de l'appli cigares).
- N° 121 (Oliva World Cup) et N° 133 (La Flor Dominicana Reserva Toro) : code-barres lu sur photo floue → `a_verifier = true`, à scanner en caisse.

## Points de vigilance connus

- Avertissements de sécurité Supabase **antérieurs** aux étiquettes : fonctions `SECURITY DEFINER` appelables par API (`handle_new_user`, `is_patron`, `marquer_commande_recue`, `notifier_push_trigger`), search_path non fixé sur `notifier_push_trigger`, protection mots de passe compromis désactivée. À traiter un jour (non urgent, rien d'exposé de grave).
- Dépôt GitHub public.

## À faire / idées

- Importer la valorisation du stock (export caisse **Bimedia**, Excel/CSV : code-barres, désignation, prix de vente TTC, famille) pour créer les étiquettes de tous les rayons.
- Éventuellement : modèle d'étiquette spécifique par rayon (ex. e-liquides avec taux de nicotine).
- Relier les étiquettes aux emplacements produits ou aux réceptions fournisseurs.
- Factures : reconnaissance automatique du contenu (prévu, pas fait).

## Hors appli (fichiers faits par Claude)

- Bandeaux de tiroirs (19 × 3 cm, logo + texte, A4) : ECG ×3, Cartes Panini ×2, Wpuff, Veev • bluPod / OMP Vuse, Humidificateurs / Tabac à pipe, X-Bar, Elf Bar.
- Export `Cigares_Carpe_Diem.csv` (8 nov.) : 613 cigares + stock des feuilles caisse du 31 oct. + fournisseur.

## Façon de travailler

- Avant toute modification importante : expliquer ce qui change, pourquoi, quelles données sont touchées, et le risque pour l'existant.
- Les nouveautés passent d'abord par une **branche** (lien de test Vercel), puis sont fusionnées dans `main` après validation.
- **Une seule conversation à la fois** sur l'appli interne. Toute conversation commence par récupérer la dernière version du code (`git pull`) et relire cette fiche, et la met à jour en fin de séance.

## Enrichissement cigares (02/11/2026)
- Origines ajoutées pour 54 cigares (sans origine : 102 → 48), via Cigaroscope + fiches fabricants/vendeurs.
- D8 : Costa Rica + composition (guide) ; El Gordo = Léger, Short Salomon = Moyen (guide).
- La Estrella : Honduras + compo ; Gigante = Moyen (guide).
- Rép. dom. : Valentino Siesto, Silencio, Patoro, Angelenos, AVO, Davidoff, A. Flores, E.P. Carrillo, Pledge, Macanudo Vintage/Estate Reserve.
- Nicaragua : Schizo, CAO Cameroon/Gold, Gurkha Treinta. Honduras : Alec Bradley Filthy Hooligan, Zamorano. Cuba : Edmundo Reserva, Epicure Especial.
- Restent vides (pas sûr à 100 %) : Gadjo, Criolito, Final 8, Don Tomás/Fagot Don Tomas, Macanudo Red/Inspirado, Gurkha Koi/21 Solara, Kingdom, Historia, Osok, Nueva, Maca, Villa Vieja, Aroma, VegaFina Cheval, No Name, Edito, Chateau Diadem, Brevas, AJ 20th, CAO Firewalker.
- Les mises à jour ont été faites en base uniquement là où le champ était vide (rien d'écrasé).
