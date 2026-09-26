-- Carpe Diem — Gestion interne
-- Autorise la suppression définitive d'une commande fournisseur
-- (à commander, commandée, ou dans l'historique).

drop policy if exists commandes_delete on public.commandes_fournisseurs;
create policy commandes_delete on public.commandes_fournisseurs for delete
  to authenticated using (true);
