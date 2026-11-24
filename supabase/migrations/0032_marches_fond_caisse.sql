-- Carpe Diem — Gestion interne
-- Fond de caisse des marchés : somme en espèces emportée au départ, et comptage de la caisse
-- (pour comparer avec les espèces attendues = fond + ventes en espèces). Colonnes ajoutées seulement.
alter table public.marches add column if not exists fond_caisse numeric(10,2) not null default 0;
alter table public.marches add column if not exists comptage numeric(10,2);
alter table public.marches add column if not exists comptage_le timestamptz;
