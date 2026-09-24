-- Carpe Diem — Gestion interne
-- Demandes de congés/repos : préciser journée entière / matin / après-midi

alter table public.demandes_absence
  add column if not exists periode text not null default 'journee'
  check (periode in ('journee', 'matin', 'apres_midi'));
