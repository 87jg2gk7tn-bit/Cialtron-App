-- ═══════════════════════════════════════════════════════════════════
--  CialtronApp — aggiunta "gol dal polso"
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
    raise exception E'Fermo: qui non c''è CialtronApp. Lancia prima supabase.sql in questo progetto.';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════
--  GOL DAL POLSO
--  Mentre si gioca il telefono è in borsa: i gol si segnano da una
--  scorciatoia sull'orologio e arrivano qui. Nell'app non c'è nessuna
--  schermata "orologio": arrivano e basta, dentro la partita in corso.
--
--  Il gruppo ha un codice fisso, che si mette nella scorciatoia una volta
--  sola. Con quel codice si può fare una cosa sola: aggiungere o togliere
--  un gol di oggi. Niente rosa, niente classifica, niente altro.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.live_codes (
  group_id   uuid primary key references public.groups(id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.live_goals (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  team       text not null check (team in ('white','black')),
  player_id  text,          -- null se il gol è "senza nome"
  who        text,          -- il nome come l'ha mandato l'orologio
  created_at timestamptz not null default now()
);
create index if not exists live_goals_group_idx on public.live_goals(group_id, created_at);

-- Confronto dei nomi indulgente: spazi doppi e maiuscole non contano.
create or replace function public.live_norm(t text)
returns text language sql immutable as $$
  select btrim(lower(regexp_replace(coalesce(t,''), '\s+', ' ', 'g')));
$$;

-- I gol che contano sono quelli delle ultime ore: la partita è adesso.
create or replace function public.live_recenti(g uuid)
returns setof public.live_goals language sql stable set search_path = public as $$
  select * from live_goals where group_id = g and created_at > now() - interval '12 hours' order by id;
$$;

-- Il codice del gruppo: lo stesso per sempre, finché non lo si cambia.
create or replace function public.live_code(p_group uuid)
returns text language plpgsql security definer set search_path = public as $$
declare alfabeto text := 'ACDEFGHJKLMNPQRTUVWXY34679'; c text; giri int := 0;
begin
  if not is_member(p_group) then raise exception 'non sei in questo gruppo'; end if;
  select code into c from live_codes where group_id = p_group;
  if c is not null then return c; end if;
  loop
    giri := giri + 1;
    select string_agg(substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1), '')
      into c from generate_series(1, 6);
    exit when not exists (select 1 from live_codes x where x.code = c);
    if giri > 30 then raise exception 'non riesco a generare un codice'; end if;
  end loop;
  insert into live_codes (group_id, code) values (p_group, c)
    on conflict (group_id) do update set code = excluded.code;
  return c;
end;
$$;

-- Se il codice gira troppo, se ne fa uno nuovo e il vecchio smette di valere.
create or replace function public.live_rotate(p_group uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_group) then raise exception 'non sei in questo gruppo'; end if;
  delete from live_codes where group_id = p_group;
  return live_code(p_group);
end;
$$;

-- Se c'era la versione precedente (partite dal vivo con codice usa-e-getta)
-- va tolta: stessi nomi, argomenti diversi, e PostgREST non saprebbe quale
-- chiamare. Le partite già registrate non c'entrano e restano dove sono.
drop function if exists public.live_goal(text, text, text);
drop function if exists public.live_undo(text);
drop function if exists public.live_open(uuid, jsonb, jsonb);
drop function if exists public.live_close(text);

-- Il gol che arriva dall'orologio. Chiamabile con la sola chiave pubblica.
-- Si manda solo il nome: la squadra la sa già il database, perché sono
-- quelle appena formate nella selezione. Davanti al nome si può mettere
-- ⬜ o ⬛ per dirla comunque, e la stessa casella serve per il gol senza
-- nome ("⬜") e per annullare ("annulla").
create or replace function public.live_goal(p_code text, p_who text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid; st jsonb; testo text; sq text; nome text; pid text; trovato text; w int; b int;
begin
  select group_id into g from live_codes where code = upper(btrim(coalesce(p_code,'')));
  if g is null then raise exception 'codice non valido'; end if;

  testo := btrim(coalesce(p_who, ''));
  -- Un errore cieco fa perdere mezz'ora: se non è arrivato niente, dillo.
  if testo = '' then
    raise exception 'non è arrivato nessun nome: nella scorciatoia il valore di p_who dev''essere il riquadro della variabile, non testo scritto a mano';
  end if;
  if live_norm(testo) ~ '(annulla|annullare|undo|cancella|togli)' then
    return live_undo(p_code);
  end if;

  if testo ~ '^(⬜|□|■|bianchi|bianco)' then
    sq := 'white'; testo := btrim(regexp_replace(testo, '^(⬜|□|■|bianchi|bianco)\s*', '', 'i'));
  elsif testo ~ '^(⬛|▪|▫|neri|nero)' then
    sq := 'black'; testo := btrim(regexp_replace(testo, '^(⬛|▪|▫|neri|nero)\s*', '', 'i'));
  end if;

  if (select count(*) from live_recenti(g)) >= 200 then
    raise exception 'troppi gol per una partita sola';
  end if;

  nome := nullif(live_norm(testo), '');
  if nome ~ '^(gol|goal)?\s*(senza nome|sconosciuto|boh|\?|-)$' then nome := null; end if;

  if nome is not null then
    -- prima per nome intero, poi per inizio nome: "Gio" trova "Giovanni"
    select e->>'id', e->>'name' into pid, trovato
      from groups x, jsonb_array_elements(coalesce(x.data->'players','[]'::jsonb)) e
     where x.id = g and live_norm(e->>'name') = nome
     limit 1;
    if pid is null then
      select e->>'id', e->>'name' into pid, trovato
        from groups x, jsonb_array_elements(coalesce(x.data->'players','[]'::jsonb)) e
       where x.id = g and live_norm(e->>'name') like nome || '%'
       limit 1;
    end if;
    if pid is null then raise exception 'non trovo nessuno che si chiami %', testo; end if;
  end if;

  -- squadra non detta: la prende dalle squadre appena formate
  if sq is null and pid is not null then
    select state into st from selections where group_id = g;
    if coalesce(st->'finalWhite','[]'::jsonb) ? pid then sq := 'white';
    elsif coalesce(st->'finalBlack','[]'::jsonb) ? pid then sq := 'black'; end if;
  end if;
  if sq is null then
    raise exception 'non so per che squadra segna "%": fate le squadre in app, oppure metti ⬜ o ⬛ davanti al nome', coalesce(trovato, testo);
  end if;

  insert into live_goals (group_id, team, player_id, who) values (g, sq, pid, trovato);

  select count(*) filter (where team = 'white'), count(*) filter (where team = 'black')
    into w, b from live_recenti(g);

  return jsonb_build_object(
    'ok', true, 'white', w, 'black', b, 'squadra', sq,
    'chi', coalesce(trovato, 'senza nome'),
    'testo', '⬜ ' || w || ' - ' || b || ' ⬛   ' || coalesce(trovato, 'gol senza nome'));
end;
$$;

-- "Ho sbagliato tocco": toglie l'ultimo gol arrivato.
create or replace function public.live_undo(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid; tolto text; w int; b int;
begin
  select group_id into g from live_codes where code = upper(btrim(coalesce(p_code,'')));
  if g is null then raise exception 'codice non valido'; end if;

  delete from live_goals
   where id = (select max(id) from live_recenti(g))
   returning coalesce(who, 'senza nome') into tolto;

  select count(*) filter (where team = 'white'), count(*) filter (where team = 'black')
    into w, b from live_recenti(g);

  return jsonb_build_object(
    'ok', true, 'white', w, 'black', b, 'chi', coalesce(tolto, '—'),
    'testo', case when tolto is null then 'non c''era niente da togliere'
                  else '⬜ ' || w || ' - ' || b || ' ⬛   tolto: ' || tolto end);
end;
$$;

-- ─── Permessi ──────────────────────────────────────────────────────

alter table public.live_codes enable row level security;
alter table public.live_goals enable row level security;

drop policy if exists live_codes_select on public.live_codes;
create policy live_codes_select on public.live_codes for select using (is_member(group_id));

drop policy if exists live_goals_select on public.live_goals;
create policy live_goals_select on public.live_goals for select using (is_member(group_id));

-- Dall'app si toglie un gol storto o si azzera a fine partita. Scriverli
-- resta compito delle funzioni qui sopra.
drop policy if exists live_goals_delete on public.live_goals;
create policy live_goals_delete on public.live_goals for delete using (is_member(group_id));

revoke execute on function public.live_code(uuid) from anon;
revoke execute on function public.live_rotate(uuid) from anon;
grant  execute on function public.live_code(uuid) to authenticated;
grant  execute on function public.live_rotate(uuid) to authenticated;
grant  execute on function public.live_goal(text, text) to anon, authenticated;
grant  execute on function public.live_undo(text) to anon, authenticated;

-- ─── Tempo reale ───────────────────────────────────────────────────
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.live_goals'; exception when duplicate_object then null; end;
end $$;
