-- Carpe Diem — Gestion interne
-- Heures mensuelles : possibilité de marquer les heures sup d'un mois comme payées
-- (sinon elles sont considérées comme reportées / lissées sur le mois suivant)

alter table public.heures_mensuelles
  add column if not exists supp_payees boolean not null default false;
