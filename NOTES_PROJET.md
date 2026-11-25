# Carpe Diem — Gestion interne : état du projet

> Fiche à lire en premier dans toute nouvelle conversation avec Claude.
> Elle est mise à jour à chaque séance de travail.
> Dernière mise à jour : 25 novembre 2026.

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
- Option « Articles (hors cigares) : Classique / 🎨 Coloré » dans la barre d'impression (11 nov.) : applique le modèle coloré à tous les articles non-cigares cochés. Choix mémorisé sur l'appareil ; par défaut Classique. Les cigares gardent toujours leur modèle.
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

## Panier cave (16 nov. 2026, en production)

- Page `/panier` (menu « Plus » → « 🛒 Panier cave »). Code : `src/pages/PanierCave.tsx`. Onglets **Panier** et **Historique**.
- Scan à l'appareil photo : détecteur intégré du téléphone (`BarcodeDetector`, Android) sinon `@zxing/browser` (iPhone) ; caméra HD, mise au point continue, bouton lampe si dispo. EAN-13 / UPC-A / EAN-8 ; chaque lecture ajoute 1 article. Recherche manuelle par n° / marque / modèle en secours.
- Articles et prix lus dans `etiquettes_articles` (lecture seule). Plusieurs paniers en parallèle (un par client), paniers **en cours** gardés sur le téléphone (localStorage `cd_paniers_cave`).
- « Passer en caisse » : un code-barres à la fois, dessiné sur canvas **au pixel près** (lecture douchette fiable), avec la quantité. Ou **QR code unique** : tous les codes séparés par un retour chariot (`\r`), chaque article répété selon sa quantité ; la douchette Bimedia les « tape » à la suite → **testé OK le 16 nov.** Nombre d’articles par QR réglable (Auto / 10 / 20 / 30 / Tout, mémorisé sur le téléphone). **Auto par défaut** (depuis le 16 nov. soir, après un échec sur iPhone avec « Tout ») : autant d’articles que possible tant que chaque case du QR fait au moins 5 px CSS à l’écran (≈ 29 articles sur un écran de 375 px, ≈ 39 sur 412 px, ≈ 42 sur 430 px). « Tout » plafonné à 150 articles.
- iPhone : QR toujours illisible le 16 nov. au soir même en Auto. Correctif tenté (« affichage v4 ») : taille des cases en multiple de la densité d’écran (`tailleCase`) pour que Safari n’agrandisse/lisse pas l’image. Petit texte « affichage v4 · densité X » sous le QR pour vérifier la version. À confirmer.
- Anciennes étiquettes du magasin (même numéro, autre type de code-barres) non lues au scan téléphone → le scan accepte maintenant aussi UPC-E, Code 128, Code 39, Code 93, ITF, Codabar ; recherche de l’article tolérante (UPC-E converti en UPC-A, zéros de tête ignorés). Le message « Code inconnu » affiche le format lu entre crochets pour diagnostiquer.
- Dans le scanner (17 nov.) : après chaque lecture, un panneau en bas montre le cigare scanné avec − / champ / + et des raccourcis 1 · 2 · 3 · 5 · 10 · 25 ; on règle la quantité puis on scanne le suivant sans quitter la caméra. Le bouton « Terminé » affiche le nombre d’articles et le total.
- (25 nov.) Saisie manuelle **dans le scanner** : champ « Le scan ne passe pas ? Tapez le n° ou le nom » en bas de la caméra (4 résultats, n° exacts d'abord, Entrée si un seul résultat) ; même chose dans le scanner des Marchés. Fonction commune `chercherProduits` (sans doublons).
- (25 nov.) Fin de passage en caisse : dès que « Terminé » est validé (codes ou QR), la vente part dans l'historique, **le panier est supprimé** et on revient sur un panier vide pour le client suivant, avec un bandeau « ✅ Vente enregistrée · Un problème ? Voir l'historique ». Si l'enregistrement échoue : écran d'erreur avec Réessayer / Vider sans enregistrer / Garder le panier.
- Quantité modifiable au clavier dans le panier (champ numérique, 0 = retirer après confirmation), en plus des boutons − / +.
- **Historique** (migration 0030, table `ventes_cave`) : chaque vente terminée est enregistrée (vendeur = compte connecté, client, détail des lignes figé, nb articles, total, mode codes/qr). Employé : voit ses ventes ; patrons : tout, totaux par vendeur, suppression. Filtres aujourd'hui / 7 jours / mois / tout.
- Idée possible : demander à Bimedia un ticket en attente par API (sans scan en caisse).

## Collection client (17 nov. 2026, branche `collection-client`)

- Dans le Panier cave : bouton « 👤 Client (collection) » → scanner la carte client (QR `CDCLIENT:XXXXXXXX` affiché dans l'appli cigares, page « Ma carte ») ou chercher par nom / téléphone / e-mail. Le panier prend le nom du client.
- Vente terminée → les cigares du panier allument leurs cartes dans la collection du client (appli cigares, table `shop_unlocks`), sans prix ni quantité. Message sur l'écran de fin.
- Passe par le relais `collection-relais` (fonction Supabase de l'appli cigares) : il vérifie le jeton de l'appli interne (compte avec fiche `profiles`), puis agit avec la clé serveur. Aucune clé secrète dans ce dépôt. Code : `src/lib/collectionClients.ts`, `src/components/ChoixClientCollection.tsx`.

## Marchés (24 nov. 2026, en production)

- Pour la patronne qui vend sur des marchés (souvent plusieurs jours). Page `/marche` (menu « Plus » → « 🧺 Marchés »). Code : `src/pages/Marche.tsx` (réutilise scanner, quantité, QR du Panier cave, exportés depuis `PanierCave.tsx`).
- Migration 0031 : table `marches` (nom, créé par, passé en caisse le / par) ; `ventes_cave` gagne `marche_id` et `paiement` (especes / cb / autre), mode `marche`. Toute l'équipe voit les ventes d'un marché ; le vendeur (ou un patron) peut annuler une vente tant que le marché n'est pas passé en caisse.
- Sur place : « Nouvelle vente » → scan (quantité réglable dans le scanner) ou recherche → « Encaisser » : total en grand, choix Espèces / CB / Autre, calcul de la monnaie à rendre → vente enregistrée.
- Sans réseau : la vente est gardée sur le téléphone (`cd_marche_attente`) et envoyée dès que ça capte (toutes les 30 s et au retour du réseau) ; les articles sont copiés sur le téléphone (`cd_produits_cache`). Limite : l'appli doit déjà être ouverte (pas de mode hors ligne complet ; créer le marché demande du réseau).
- Écran du marché : total, puis **jour par jour** (nb ventes, articles, total, espèces / CB), détail des ventes.
- **Fond de caisse** (migration 0032 : `marches.fond_caisse`, `comptage`, `comptage_le`) : demandé à la création du marché, modifiable. Carte « 💶 Caisse espèces » : fond + ventes en espèces = espèces attendues ; ventes CB à part ; bouton « Compter la caisse » → écart (juste / en trop / il manque). Paiement « Espèces » présélectionné à l'encaissement.
- **Bouton « 🎄 Santon »** (25 nov.) dans « Nouvelle vente » : on touche la couleur de la pastille → ajouté au prix de la fiche caisse de cette couleur (demande du patron : prix = liste caisse, pas de saisie manuelle ; le champ `LigneMarche.prix` reste prévu pour un prix libre mais n'est plus utilisé). Couleurs (patron) : S vert · SP bleu foncé · AA bleu (entre foncé et clair) · M bleu clair · DSP noir · A blanc · D jaune · O orange · SSP rouge · DD marron ; codes = fiches caisse 3100000000066 / 097 / 8895 / 134 / 127 / 073 / 103 / 158 / 080 / 110 (noms mis à jour dans `etiquettes_articles`, ex. « Santon S · vert »). Prix actuels de la liste : S 14,50 · SP 22,40 · AA 9,90 · M 15,50 · DSP 40,20 · A 7,90 · D 27,50 · O 10,90 · SSP 16,90 · DD 52,20.
- **Santon à prix libre** (25 nov.) : dans le même panneau, « ✏️ Santon à prix libre » → prix tapé → ligne code `SANTON-LIBRE` avec prix (pas de fiche caisse). Au passage en caisse, ces santons sont **exclus des QR** et listés à part (« à taper à la main en caisse, famille Santon », regroupés par prix). Piste à confirmer avec Bimedia : codes-barres EAN-13 à prix intégré (préfixe 2, comme les balances) pour que le QR envoie directement « Santon + prix » dans la famille Santon.
- **Remise** (25 nov.) à l'écran « Encaisser » : montant en € ou en % (raccourcis 5/10/15/20 %), plafonnée au total ; le total de la vente enregistré = net (gains du jour et caisse espèces justes) ; la remise est une ligne `REMISE` au prix négatif dans la vente. Au passage en caisse : exclue des QR, listée « Remises accordées — à faire en caisse » (jour, vente, montant) + ligne de contrôle QR + prix libres − remises = total encaissé.
- Retour au tabac : « Passer le marché en caisse » → récap par jour + articles regroupés → QR codes (même système que le Panier cave, découpage Auto) → « Terminé » marque le marché « passé en caisse » (plus de nouvelles ventes ni d'annulation).

## Points de vigilance connus

- Avertissements de sécurité Supabase **antérieurs** aux étiquettes : fonctions `SECURITY DEFINER` appelables par API (`handle_new_user`, `is_patron`, `marquer_commande_recue`, `notifier_push_trigger`), search_path non fixé sur `notifier_push_trigger`, protection mots de passe compromis désactivée. À traiter un jour (non urgent, rien d'exposé de grave).
- Dépôt GitHub public.

## À faire / idées

- Importer la valorisation du stock (export caisse **Bimedia**, Excel/CSV : code-barres, désignation, prix de vente TTC, famille) pour créer les étiquettes de tous les rayons.
- Éventuellement : modèle d'étiquette spécifique par rayon (ex. e-liquides avec taux de nicotine).
- Relier les étiquettes aux emplacements produits ou aux réceptions fournisseurs.
- Factures : reconnaissance automatique du contenu (prévu, pas fait).

## Ajout de nouveaux cigares (règle depuis le 12 nov.)

- Le patron envoie une photo de la fiche ou de la liste produits de la caisse (code-barres, désignation avec n°, prix).
- Claude ajoute le cigare **dans les deux applis** :
  1. appli interne : table `etiquettes_articles` (projet `esfykhlnpvtkbrvthzep`) ;
  2. appli cigares (catalogue clients, projet `ralnsnfdtkmqtvfubzml`) : chercher d'abord la fiche existante dans `cigars` (≈ 3 300 fiches, souvent archivées), sinon la créer ; relier le code-barres dans `cigar_barcodes` (barcode, cigar_id, num) ; mettre prix, `in_stock = true`, `is_archived = false`, `is_catalog_visible = true`. Ne jamais laisser « à vérifier » visible des clients (mettre vide).
- Toujours la règle « pas sûr = vide ». Ne toucher à rien d'autre dans l'appli cigares.
- Fait le 12 nov. : Esteli Club N°1 (463), N°5 (464), N°6 (466) ; n° 312 ajouté au code-barres du Cumpay Volcán Maduro.
- **Import des listes produits Bimedia (25 nov.)** — PDF « ListeDesProduits » (cigares 758 lignes, Legami 443 lignes) :
  - Cigares : 162 ajoutés dans `etiquettes_articles` (nom = désignation caisse, sans marque/origine → dans « Incomplets »), prix N° 121 (28 → 26 €) et N° 133 (18 → 16 €) corrigés et codes confirmés (`a_verifier = false`).
  - **Règle du patron : les listes caisse Bimedia sont LA référence** (codes-barres, n°, prix). Après l'import, les 28 cigares dont le code n'était pas dans la liste ont été supprimés (anciens codes ; leurs infos avaient été recopiées sur la ligne au code caisse), n° alignés sur la liste. Rayon Cigares = la liste du 25 nov. (758 lignes, puis 756 après les corrections ci-dessous).
  - N° en double réglés le 25 nov. par le patron : Black Label NBK Corona Larga → n° 370 ; A Eternita Noir (778) et Plasencia Azacualpa (521) supprimés (plus vendus). Rayon Cigares = 756 cigares, plus aucun n° en double.
  - Legami : 403 articles ajoutés (rayon « Cadeaux & divers », marque Legami) ; 40 existaient déjà, prix identiques.
  - Appli cigares (catalogue clients) **non mise à jour** pour ces 162 cigares.
  - 3e liste (25 nov., groupe CADEAU, familles STC 213 + SANTONS 19) : 222 articles ajoutés (rayon « Cadeaux & divers », nom = désignation caisse, santons nommés « Santon A / AA / D… ») ; 1 existait déjà (Boxer Noël). **9 codes à 14 chiffres non importables** (la table n'accepte que 12-13 chiffres) : 8 santons `20080730…` (doublons des santons en 3100000000…, prix différents) et `33609810122406` « Boxer rugby M » (sûrement une faute de frappe dans Bimedia : un 3 en trop).
- Fait le 19 nov. : Davidoff Year of Sheep (édition 2027, pyramide 171 × 52) — n° 467, code 3100000025663, 62 €. Origine Rép. dom., compo Équateur / Équateur / Rép. dom. (1 vendeur + cohérent avec Year of the Horse 2026), force laissée vide, temps ≈ 75 min. Appli cigares : fiche existante « Year of the Sheep » complétée (était vide) + code-barres relié.

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
