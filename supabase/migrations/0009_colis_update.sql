-- Carpe Diem — Gestion interne
-- Permet de modifier une réception colis déjà enregistrée

create policy colis_receptions_update on public.colis_receptions for update
  to authenticated using (true) with check (true);
