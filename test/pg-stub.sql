-- finto ambiente Supabase
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$$;
create role authenticated nologin;
create role app login;
grant authenticated to app;
grant usage on schema public, auth to app, authenticated;
