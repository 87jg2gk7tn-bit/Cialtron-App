-- finto ambiente Supabase
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$$;
create role authenticated nologin;
create role anon nologin;                 -- la chiave pubblica di Supabase
create role app login;                    -- un membro qualunque, per le prove
create role ospite login;                 -- chi arriva solo con la chiave pubblica
grant authenticated to app;
grant anon to ospite;
grant usage on schema public, auth to app, authenticated, anon, ospite;
