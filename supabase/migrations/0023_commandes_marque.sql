-- Carpe Diem — Gestion interne
-- Ajoute une marque (optionnelle) à chaque produit à commander, pour
-- pouvoir regrouper les produits qui n'ont pas encore de fournisseur assigné
-- par marque (ex : tous les "Camel" ensemble) avant de les trier.

alter table public.commandes_fournisseurs add column if not exists marque text;
