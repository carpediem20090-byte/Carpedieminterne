-- Carpe Diem — Gestion interne
-- Abonnements aux notifications push (une ligne par appareil/navigateur qui a
-- activé les notifications). Utilisé par l'Edge Function "notifier-push" pour
-- envoyer une notification quand un nouveau relevé, une actu ou une demande
-- d'absence est créée.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  cree_le timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select
  to authenticated using (auth.uid() = profil_id);

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions for insert
  to authenticated with check (auth.uid() = profil_id);

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions for update
  to authenticated using (auth.uid() = profil_id);

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete
  to authenticated using (auth.uid() = profil_id);
