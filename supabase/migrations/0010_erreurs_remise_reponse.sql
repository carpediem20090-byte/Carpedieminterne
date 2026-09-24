-- Carpe Diem — Gestion interne
-- Erreurs de remise : ajout d'une réponse libre + possibilité de supprimer

alter table public.colis_erreurs_remise
  add column if not exists reponse text;

create policy colis_erreurs_remise_delete on public.colis_erreurs_remise for delete
  to authenticated using (true);
