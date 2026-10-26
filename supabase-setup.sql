-- =====================================================================
--  Pep-Chor Lieder: Einrichtung in Supabase
--  1. Unten bei "DEINE-EMAIL@BEISPIEL.CH" deine E-Mail-Adresse eintragen
--     (die gleiche, mit der du dich später als Admin anmeldest).
--  2. Alles kopieren, im Supabase SQL Editor einfügen und auf "Run" klicken.
-- =====================================================================

-- ---------- Liste der Admins ----------
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
-- (keine Policies: niemand kann diese Liste über die App lesen oder ändern)

insert into public.admins (email)
values (lower('DEINE-EMAIL@BEISPIEL.CH'))
on conflict do nothing;

-- Prüft, ob die angemeldete Person in der Admin-Liste steht
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Lieder ----------
create table if not exists public.songs (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  file_path   text not null,
  mime_type   text,
  duration    real,
  peaks       jsonb,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.songs enable row level security;

drop policy if exists "Alle duerfen Lieder sehen"   on public.songs;
drop policy if exists "Admins duerfen Lieder anlegen" on public.songs;
drop policy if exists "Admins duerfen Lieder aendern" on public.songs;
drop policy if exists "Admins duerfen Lieder loeschen" on public.songs;

create policy "Alle duerfen Lieder sehen"
  on public.songs for select to anon, authenticated using (true);
create policy "Admins duerfen Lieder anlegen"
  on public.songs for insert to authenticated with check (public.is_admin());
create policy "Admins duerfen Lieder aendern"
  on public.songs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins duerfen Lieder loeschen"
  on public.songs for delete to authenticated using (public.is_admin());

-- ---------- Speicher für die Musikdateien ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('songs', 'songs', true, 52428800,
        array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins duerfen Dateien sehen"     on storage.objects;
drop policy if exists "Admins duerfen Dateien hochladen" on storage.objects;
drop policy if exists "Admins duerfen Dateien aendern"   on storage.objects;
drop policy if exists "Admins duerfen Dateien loeschen"  on storage.objects;

create policy "Admins duerfen Dateien sehen"
  on storage.objects for select to authenticated
  using (bucket_id = 'songs' and public.is_admin());
create policy "Admins duerfen Dateien hochladen"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'songs' and public.is_admin());
create policy "Admins duerfen Dateien aendern"
  on storage.objects for update to authenticated
  using (bucket_id = 'songs' and public.is_admin());
create policy "Admins duerfen Dateien loeschen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'songs' and public.is_admin());

-- Weitere Admins später hinzufügen:
--   insert into public.admins (email) values (lower('person@beispiel.ch'));
-- Admin entfernen:
--   delete from public.admins where email = lower('person@beispiel.ch');
