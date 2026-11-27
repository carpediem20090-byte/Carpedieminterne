-- Carpe Diem — Gestion interne
-- Impressions reçues PAR MAIL (boîte Outlook des impressions).
-- Un relais (Edge Function « outlook-releve », lancée toutes les 2 minutes)
-- lit la boîte de réception en LECTURE SEULE, prend les pièces jointes des
-- nouveaux mails et crée une demande dans « Impressions clients ».
-- Les images sont nettoyées (recadrage, mode noir et blanc) par l'appli à la
-- première ouverture de la demande.

-- D'où vient la demande : page /imprimer ou mail.
alter table public.impressions_demandes
  add column if not exists source text not null default 'page'
  check (source in ('page', 'mail'));

-- Les clients anonymes ne peuvent créer que des demandes « page ».
drop policy if exists impressions_insert on public.impressions_demandes;
create policy impressions_insert on public.impressions_demandes for insert
  to anon, authenticated
  with check (statut = 'nouvelle' and imprimee_le is null and imprimee_par is null and source = 'page');

-- Formats acceptés : les pièces jointes arrivent telles quelles (PNG, iPhone…).
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'],
      file_size_limit = 26214400
  where id = 'impressions';

-- L'équipe remplace l'image d'origine par sa version nettoyée.
drop policy if exists impressions_fichiers_update on storage.objects;
create policy impressions_fichiers_update on storage.objects for update
  to authenticated using (bucket_id = 'impressions') with check (bucket_id = 'impressions');

-- Connexion Outlook (une seule boîte). Jeton secret : AUCUN accès depuis
-- l'appli (RLS sans règle) ; seules les Edge Functions (clé serveur) y touchent.
create table if not exists public.outlook_connexion (
  id int primary key default 1 check (id = 1),
  email text,
  refresh_token text not null,
  connecte_le timestamptz not null default now(),
  derniere_releve timestamptz,
  derniere_erreur text
);
alter table public.outlook_connexion enable row level security;

-- Jetons temporaires pendant la connexion à Microsoft (15 min).
create table if not exists public.outlook_connexion_etats (
  etat text primary key,
  profil_id uuid references public.profiles(id) on delete cascade,
  cree_le timestamptz not null default now()
);
alter table public.outlook_connexion_etats enable row level security;

-- Mails déjà traités (pour ne jamais importer deux fois le même).
create table if not exists public.impressions_mails (
  message_id text primary key,
  demande_id uuid,
  resultat text not null,           -- 'importe' | 'ignore : …'
  recu_le timestamptz,
  traite_le timestamptz not null default now()
);
alter table public.impressions_mails enable row level security;

-- Relève automatique toutes les 2 minutes.
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'outlook_releve_cle') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'outlook_releve_cle',
      'Clé que pg_cron envoie à l''Edge Function outlook-releve');
  end if;
end $$;

select cron.unschedule('impressions-releve-outlook')
where exists (select 1 from cron.job where jobname = 'impressions-releve-outlook');

select cron.schedule(
  'impressions-releve-outlook',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://esfykhlnpvtkbrvthzep.supabase.co/functions/v1/outlook-releve',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cle-releve', (select decrypted_secret from vault.decrypted_secrets where name = 'outlook_releve_cle')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.outlook_connexion);
  $cron$
);

-- Lecture de la clé par l'Edge Function (clé serveur uniquement).
create or replace function public.outlook_cle_releve()
returns text
language sql
security definer
set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'outlook_releve_cle' $$;
revoke execute on function public.outlook_cle_releve() from public, anon, authenticated;
grant execute on function public.outlook_cle_releve() to service_role;
