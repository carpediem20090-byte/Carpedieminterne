-- Carpe Diem — Gestion interne
-- Demandes clients : ajout d'une réponse libre

alter table public.demandes_clients
  add column if not exists reponse text;

-- La suppression était réservée par une policy manquante — on l'ajoute
drop policy if exists demandes_clients_delete on public.demandes_clients;

create policy demandes_clients_delete on public.demandes_clients for delete
  to authenticated using (true);
