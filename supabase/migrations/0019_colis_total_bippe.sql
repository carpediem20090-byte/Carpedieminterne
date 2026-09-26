-- Carpe Diem — Gestion interne
-- Ajoute un champ "Total" pour les arrivées de colis : le nombre total de
-- colis scannés ("bipés") affiché sur la machine du transporteur à la fin
-- de la tournée. Simple champ informatif, sans calcul automatique.

alter table public.colis_receptions
  add column if not exists nb_total_bippe integer;
