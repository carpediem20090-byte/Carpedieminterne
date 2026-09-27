-- Carpe Diem — Gestion interne
-- Ajoute une photo (optionnelle) aux avoirs/échanges/casse, pour illustrer
-- le produit cassé ou ramené par le client.

alter table public.avoirs_echanges add column if not exists photo_url text;
