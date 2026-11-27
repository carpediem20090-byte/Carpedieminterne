-- Carpe Diem — Gestion interne
-- Service d'impression : les clients envoient leurs documents depuis la page
-- publique /imprimer (QR code au comptoir ou lien gardé sur leur téléphone),
-- sans compte. Les fichiers arrivent déjà recadrés / nettoyés ; l'équipe les
-- retrouve dans « Impressions » et imprime un seul PDF.
--
-- Sécurité :
--   * un client (anonyme) peut seulement DÉPOSER une demande et ses fichiers,
--     jamais lire ce que les autres ont envoyé ;
--   * l'équipe connectée lit, met à jour et supprime ;
--   * bucket privé « impressions », 15 Mo max par fichier, JPEG ou PDF seulement ;
--   * les demandes sont effacées (avec leurs fichiers) par l'appli après 7 jours.

create table if not exists public.impressions_demandes (
  id uuid primary key,                       -- généré par le téléphone du client
  nom text not null check (char_length(btrim(nom)) between 1 and 60),
  telephone text check (telephone is null or char_length(telephone) <= 20),
  message text check (message is null or char_length(message) <= 300),
  copies int not null default 1 check (copies between 1 and 20),
  fichiers jsonb not null check (jsonb_typeof(fichiers) = 'array'
    and jsonb_array_length(fichiers) between 1 and 60),
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'imprimee')),
  cree_le timestamptz not null default now(),
  imprimee_le timestamptz,
  imprimee_par uuid references public.profiles(id) on delete set null
);

create index if not exists impressions_demandes_cree_le on public.impressions_demandes (cree_le desc);

alter table public.impressions_demandes enable row level security;

-- Dépôt : clients anonymes et équipe (l'équipe peut aussi envoyer pour un client).
drop policy if exists impressions_insert on public.impressions_demandes;
create policy impressions_insert on public.impressions_demandes for insert
  to anon, authenticated
  with check (statut = 'nouvelle' and imprimee_le is null and imprimee_par is null);

drop policy if exists impressions_select on public.impressions_demandes;
create policy impressions_select on public.impressions_demandes for select
  to authenticated using (true);

drop policy if exists impressions_update on public.impressions_demandes;
create policy impressions_update on public.impressions_demandes for update
  to authenticated using (true) with check (true);

drop policy if exists impressions_delete on public.impressions_demandes;
create policy impressions_delete on public.impressions_demandes for delete
  to authenticated using (true);

-- Stockage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('impressions', 'impressions', false, 15728640, array['image/jpeg', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists impressions_fichiers_insert on storage.objects;
create policy impressions_fichiers_insert on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'impressions'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

drop policy if exists impressions_fichiers_select on storage.objects;
create policy impressions_fichiers_select on storage.objects for select
  to authenticated using (bucket_id = 'impressions');

drop policy if exists impressions_fichiers_delete on storage.objects;
create policy impressions_fichiers_delete on storage.objects for delete
  to authenticated using (bucket_id = 'impressions');

-- Notification push à l'équipe à chaque nouvelle demande (même fonction que
-- relevé / actus / absences ; l'Edge Function « smart-worker » gère la table).
drop trigger if exists notifier_push_impressions on public.impressions_demandes;
create trigger notifier_push_impressions
  after insert on public.impressions_demandes
  for each row execute function public.notifier_push_trigger();
