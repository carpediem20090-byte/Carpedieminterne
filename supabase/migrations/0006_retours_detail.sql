-- Carpe Diem — Gestion interne
-- Détail des retours colis (vrac / sac), comme pour les arrivées

alter table public.colis_receptions
  add column if not exists nb_retours_vrac integer not null default 0;

alter table public.colis_receptions
  add column if not exists nb_retours_sac integer not null default 0;
