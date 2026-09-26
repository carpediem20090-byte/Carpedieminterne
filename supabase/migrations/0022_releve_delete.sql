-- Carpe Diem — Gestion interne
-- La table releve n'avait jamais eu de droit de suppression (seulement
-- lecture + ajout, puis mise à jour via la migration 0020). Le bouton
-- "Supprimer" de la Relève en avait besoin.

drop policy if exists releve_delete on public.releve;
create policy releve_delete on public.releve for delete
  to authenticated using (true);
