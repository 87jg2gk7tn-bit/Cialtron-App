-- ═══════════════════════════════════════════════════════════════════
--  CialtronApp — aggiunta "segna dal polso"
--  Da incollare in Supabase → SQL Editor → Run, nello stesso progetto
--  dove hai già lanciato supabase.sql. Si può rilanciare: non cancella
--  niente e non rompe quello che c'è.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.trips') is not null or to_regclass('public.trip_members') is not null then
    raise exception E'Fermo: questo database contiene la tabella "trips", quindi è quello di GeppGo, non di CialtronApp.';
  end if;
  if to_regclass('public.groups') is null then
    raise exception E'Fermo: qui non c'' è CialtronApp. Lancia prima supabase.sql in questo progetto.';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════
--  SEGNARE DAL POLSO — partita dal vivo
--  Una scorciatoia sull'Apple Watch manda i gol qui dentro mentre si
--  gioca, e l'app li mostra in diretta su tutti i telefoni del gruppo.
--  L'orologio non porta in giro la password di nessuno: ha solo un
--  codice partita usa-e-getta che scade da solo, e con quel codice può
--  fare una cosa sola — aggiungere o togliere un gol di questa partita.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.live_matches (
  token      text primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  white      jsonb not null default '[]'::jsonb,
  black      jsonb not null default '[]'::jsonb,
  opened_by  uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '8 hours'),
  closed_at  timestamptz
);
create index if not exists live_matches_group_idx on public.live_matches(group_id);

create table if not exists public.live_goals (
  id         bigint generated always as identity primary key,
  token      text not null references public.live_matches(token) on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  team       text not null check (team in ('white','black')),
  player_id  text,          -- null se il gol è "senza nome"
  who        text,          -- il nome così com'è arrivato dall'orologio
  created_at timestamptz not null default now()
);
create index if not exists live_goals_token_idx on public.live_goals(token, id);

-- Confronto dei nomi indulgente: spazi doppi e maiuscole non contano.
create or replace function public.live_norm(t text)
returns text language sql immutable as $$
  select btrim(lower(regexp_replace(coalesce(t,''), '\s+', ' ', 'g')));
$$;

-- Apre la partita dal vivo e restituisce il codice da mettere nella
-- scorciatoia. Una sola per gruppo: aprirne una chiude la precedente.
create or replace function public.live_open(p_group uuid, p_white jsonb default '[]'::jsonb, p_black jsonb default '[]'::jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare alfabeto text := 'ACDEFGHJKLMNPQRTUVWXY34679'; t text; giri int := 0;
begin
  if not is_member(p_group) then raise exception 'non sei in questo gruppo'; end if;
  update live_matches set closed_at = now()
   where group_id = p_group and closed_at is null;
  loop
    giri := giri + 1;
    select string_agg(substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1), '')
      into t from generate_series(1, 5);
    exit when not exists (select 1 from live_matches m where m.token = t);
    if giri > 30 then raise exception 'non riesco a generare un codice'; end if;
  end loop;
  insert into live_matches (token, group_id, white, black, opened_by)
  values (t, p_group, coalesce(p_white, '[]'::jsonb), coalesce(p_black, '[]'::jsonb), auth.uid());
  return t;
end;
$$;

create or replace function public.live_close(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select group_id into g from live_matches where token = upper(btrim(p_token));
  if g is null then return; end if;
  if not is_member(g) then raise exception 'non sei in questo gruppo'; end if;
  update live_matches set closed_at = now() where token = upper(btrim(p_token));
end;
$$;

-- Il gol che arriva dall'orologio. Chiamabile con la sola chiave pubblica:
-- il codice partita è l'unica credenziale, e non apre nient'altro.
-- Al polso si manda solo un nome: la squadra la sa già il database, perché
-- quando la partita dal vivo è stata aperta si sapeva chi giocava con chi.
-- Davanti al nome si può mettere ⬜ o ⬛ per dirla comunque, e la stessa
-- casella serve per il gol senza nome ("⬜") e per annullare ("annulla").
drop function if exists public.live_goal(text, text, text);
create or replace function public.live_goal(p_token text, p_who text default null, p_team text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.live_matches%rowtype; testo text; sq text; nome text; pid text; trovato text; w int; b int;
begin
  select * into s from live_matches
   where token = upper(btrim(coalesce(p_token,'')))
     and closed_at is null and expires_at > now();
  if s.token is null then raise exception 'codice partita non valido o scaduto'; end if;

  testo := btrim(coalesce(p_who, ''));

  -- "annulla ultimo": stessa casella, nessun secondo comando da costruire
  if live_norm(testo) ~ '(annulla|annullare|undo|cancella|togli)' then
    return live_undo(s.token);
  end if;

  -- la squadra scritta davanti al nome vince su tutto
  if testo ~ '^(⬜|□|■|bianchi|bianco)' then
    sq := 'white'; testo := btrim(regexp_replace(testo, '^(⬜|□|■|bianchi|bianco)\s*', '', 'i'));
  elsif testo ~ '^(⬛|▪|▫|neri|nero)' then
    sq := 'black'; testo := btrim(regexp_replace(testo, '^(⬛|▪|▫|neri|nero)\s*', '', 'i'));
  elsif coalesce(btrim(p_team),'') <> '' then
    sq := case when live_norm(p_team) in ('white','bianchi','bianco','w') then 'white'
               when live_norm(p_team) in ('black','neri','nero','n') then 'black' end;
    if sq is null then raise exception 'squadra non valida: usa bianchi o neri'; end if;
  end if;

  if (select count(*) from live_goals where token = s.token) >= 200 then
    raise exception 'troppi gol per una partita sola';
  end if;

  nome := nullif(live_norm(testo), '');
  if nome ~ '^(gol|goal)?\s*(senza nome|sconosciuto|boh|\?|-)$' then nome := null; end if;

  if nome is not null then
    -- prima per nome intero, poi per inizio nome: "Gio" trova "Giovanni"
    select e->>'id', e->>'name' into pid, trovato
      from groups g, jsonb_array_elements(coalesce(g.data->'players','[]'::jsonb)) e
     where g.id = s.group_id and live_norm(e->>'name') = nome
     limit 1;
    if pid is null then
      select e->>'id', e->>'name' into pid, trovato
        from groups g, jsonb_array_elements(coalesce(g.data->'players','[]'::jsonb)) e
       where g.id = s.group_id and live_norm(e->>'name') like nome || '%'
       limit 1;
    end if;
    if pid is null then raise exception 'non trovo nessuno che si chiami %', testo; end if;
  end if;

  -- squadra non detta: la prende da chi gioca con chi in questa partita
  if sq is null and pid is not null then
    if s.white ? pid then sq := 'white';
    elsif s.black ? pid then sq := 'black'; end if;
  end if;
  if sq is null then
    raise exception 'non so per che squadra segna: metti ⬜ o ⬛ davanti al nome';
  end if;

  insert into live_goals (token, group_id, team, player_id, who)
  values (s.token, s.group_id, sq, pid, trovato);

  select count(*) filter (where team = 'white'), count(*) filter (where team = 'black')
    into w, b from live_goals where token = s.token;

  return jsonb_build_object(
    'ok', true, 'white', w, 'black', b, 'squadra', sq,
    'chi', coalesce(trovato, 'senza nome'),
    'testo', '⬜ ' || w || ' - ' || b || ' ⬛   ' || coalesce(trovato, 'gol senza nome'));
end;
$$;

-- "Ho sbagliato tocco": toglie l'ultimo gol segnato in questa partita.
create or replace function public.live_undo(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.live_matches%rowtype; tolto text; w int; b int;
begin
  select * into s from live_matches
   where token = upper(btrim(coalesce(p_token,'')))
     and closed_at is null and expires_at > now();
  if s.token is null then raise exception 'codice partita non valido o scaduto'; end if;

  delete from live_goals
   where id = (select max(id) from live_goals where token = s.token)
   returning coalesce(who, 'senza nome') into tolto;

  select count(*) filter (where team = 'white'), count(*) filter (where team = 'black')
    into w, b from live_goals where token = s.token;

  return jsonb_build_object(
    'ok', true, 'white', w, 'black', b,
    'chi', coalesce(tolto, '—'),
    'testo', case when tolto is null then 'non c''era niente da togliere'
                  else '⬜ ' || w || ' - ' || b || ' ⬛   tolto: ' || tolto end);
end;
$$;

-- ─── Permessi ──────────────────────────────────────────────────────

alter table public.live_matches enable row level security;
alter table public.live_goals   enable row level security;

drop policy if exists live_matches_select on public.live_matches;
create policy live_matches_select on public.live_matches for select using (is_member(group_id));

drop policy if exists live_goals_select on public.live_goals;
create policy live_goals_select on public.live_goals for select using (is_member(group_id));

-- Dall'app un membro può togliere un gol arrivato storto, senza passare
-- dall'orologio. Scriverli resta compito delle funzioni qui sopra.
drop policy if exists live_goals_delete on public.live_goals;
create policy live_goals_delete on public.live_goals for delete using (is_member(group_id));

revoke execute on function public.live_open(uuid, jsonb, jsonb) from anon;
revoke execute on function public.live_close(text) from anon;
grant  execute on function public.live_open(uuid, jsonb, jsonb) to authenticated;
grant  execute on function public.live_close(text) to authenticated;
grant  execute on function public.live_goal(text, text, text) to anon, authenticated;
grant  execute on function public.live_undo(text) to anon, authenticated;

-- ─── Tempo reale ───────────────────────────────────────────────────
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.live_goals';   exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.live_matches'; exception when duplicate_object then null; end;
end $$;
