-- ═══════════════════════════════════════════════════════════════════
--  CialtronApp — schema del database
--  Da incollare una volta sola in Supabase → SQL Editor → Run.
--  È riscrivibile: eseguirlo di nuovo non rompe niente e non cancella dati.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Freno di sicurezza ────────────────────────────────────────────
-- Se questo script viene lanciato per sbaglio nel progetto di un'altra app,
-- si ferma prima di toccare qualsiasi cosa. Serve perché definisce funzioni
-- con nomi comuni (is_member, is_admin) che un "create or replace" nel
-- database sbagliato sovrascriverebbe, rompendo quell'altra app.

do $$
begin
  if to_regclass('public.trips') is not null or to_regclass('public.trip_members') is not null then
    raise exception E'Fermo: questo database contiene la tabella "trips", quindi è quello di GeppGo, non di CialtronApp.\nCrea un progetto Supabase nuovo, selezionalo in alto a sinistra, e rilancia lo script lì.';
  end if;
end $$;

-- ─── Tabelle ───────────────────────────────────────────────────────

-- Il gruppo di calcetto. `data` contiene rosa e partite in un unico
-- documento, come il viaggio di GeppGo: ci scrivono solo gli admin.
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Calcetto',
  invite_code text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  data        jsonb not null default '{"players":[],"matches":[]}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Chi è chi: collega un account a un giocatore della rosa.
-- role: 'admin' modifica tutto, 'player' vede e fa la selezione squadre.
create table if not exists public.group_members (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  player_id   text,
  member_name text,
  role        text not null default 'player' check (role in ('admin','player')),
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- La selezione squadre sta a parte: ci scrivono anche i non-admin
-- (il picker e il capitano), e così non tocca mai rosa e partite.
create table if not exists public.selections (
  group_id   uuid primary key references public.groups(id) on delete cascade,
  state      jsonb not null default '{"phase":"idle","assign":{},"captainSide":null}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Le foto stanno fuori dal documento del gruppo: sono base64 pesanti e
-- non devono viaggiare a ogni aggiornamento della classifica.
create table if not exists public.photos (
  group_id   uuid not null references public.groups(id) on delete cascade,
  player_id  text not null,
  photo      text,
  rev        bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (group_id, player_id)
);

-- La bacheca del gruppo: quando si gioca, chi sono capitano e picker se
-- scelti a mano, e le convocazioni partita per partita. Ci scrivono TUTTI i
-- membri, non solo gli admin: è roba che si sistema fra giocatori.
create table if not exists public.board (
  group_id   uuid primary key references public.groups(id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,   -- giorno, ora, capitano e picker scelti
  callups    jsonb not null default '{}'::jsonb,   -- { "2026-09-20": { "<giocatore>": {v,by,ts} } }
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index if not exists group_members_user_idx on public.group_members(user_id);
create unique index if not exists groups_invite_idx on public.groups(invite_code);

-- ─── Funzioni di appoggio ──────────────────────────────────────────
-- Sono SECURITY DEFINER apposta: se le regole di group_members
-- interrogassero group_members si avvitherebbero su sé stesse.

create or replace function public.is_member(g uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members m where m.group_id = g and m.user_id = auth.uid())
      or exists (select 1 from groups x where x.id = g and x.owner = auth.uid());
$$;

create or replace function public.is_admin(g uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members m
                  where m.group_id = g and m.user_id = auth.uid() and m.role = 'admin')
      or exists (select 1 from groups x where x.id = g and x.owner = auth.uid());
$$;

-- Il giocatore che questo account ha dichiarato di essere.
create or replace function public.my_player(g uuid)
returns text language sql security definer stable set search_path = public as $$
  select m.player_id from group_members m where m.group_id = g and m.user_id = auth.uid();
$$;

-- Entrare con il codice invito. Passa da qui e non da una policy perché
-- chi entra non è ancora membro: non potrebbe vedere il gruppo per
-- controllare il codice.
create or replace function public.join_group(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select id into g from groups where invite_code = lower(trim(p_code));
  if g is null then raise exception 'codice non valido'; end if;
  insert into group_members (group_id, user_id, role)
  values (g, auth.uid(), 'player')
  on conflict (group_id, user_id) do nothing;
  return g;
end;
$$;

-- "Non ci sono nella lista, aggiungimi": un membro può creare la propria voce
-- nella rosa anche senza essere admin. Passa da qui perché scrivere in
-- groups.data è riservato agli admin, e questa è l'unica eccezione: si aggiunge
-- un giocatore solo, con il proprio nome, e ci si collega subito.
create or replace function public.claim_new_player(p_group uuid, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare pid text; nm text; cur jsonb;
begin
  if not is_member(p_group) then raise exception 'non sei in questo gruppo'; end if;
  nm := trim(p_name);
  if nm = '' or nm is null then raise exception 'serve un nome'; end if;

  select data->'players' into cur from groups where id = p_group;
  if exists (select 1 from jsonb_array_elements(coalesce(cur,'[]'::jsonb)) e
              where lower(trim(e->>'name')) = lower(nm)) then
    raise exception 'esiste già un giocatore con questo nome';
  end if;

  pid := substr(md5(random()::text || clock_timestamp()::text), 1, 9);
  update groups
     set data = jsonb_set(data, '{players}',
           coalesce(data->'players','[]'::jsonb) ||
           jsonb_build_object('id', pid, 'name', nm, 'base', null, 'photoRev', null)),
         updated_at = now(), updated_by = auth.uid()
   where id = p_group;

  update group_members set player_id = pid, member_name = nm
   where group_id = p_group and user_id = auth.uid();
  return pid;
end;
$$;

-- Rispondere alla convocazione. Passa da una funzione e non da un semplice
-- aggiornamento perché due persone che rispondono nello stesso momento si
-- sovrascriverebbero a vicenda: qui la riga viene bloccata e la risposta
-- infilata dentro, senza riscrivere quelle degli altri.
-- Ne approfitta per potare le date vecchie, che altrimenti crescono per sempre.
create or replace function public.set_callup(p_group uuid, p_date text, p_player text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur jsonb; giorno jsonb;
begin
  if not is_member(p_group) then raise exception 'non sei in questo gruppo'; end if;
  if p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'data non valida'; end if;

  insert into board (group_id) values (p_group) on conflict (group_id) do nothing;
  select callups into cur from board where group_id = p_group for update;

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into cur
    from jsonb_each(coalesce(cur, '{}'::jsonb)) as t(k, v)
   where k >= to_char(current_date - interval '60 days', 'YYYY-MM-DD');

  giorno := coalesce(cur -> p_date, '{}'::jsonb);
  if p_value is null or p_value = '' then
    giorno := giorno - p_player;
  else
    if p_value not in ('si','no') then raise exception 'risposta non valida'; end if;
    giorno := giorno || jsonb_build_object(p_player,
                jsonb_build_object('v', p_value, 'by', auth.uid(),
                                   'ts', (extract(epoch from now()))::bigint));
  end if;

  cur := cur || jsonb_build_object(p_date, giorno);
  update board set callups = cur, updated_at = now(), updated_by = auth.uid()
   where group_id = p_group;
  return cur;
end;
$$;

-- Nessuno si promuove admin da solo: il ruolo lo cambia solo un admin.
-- E il proprietario non è degradabile, altrimenti un gruppo può restare
-- senza nessuno che lo amministri.
create or replace function public.guard_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if not is_admin(new.group_id) then
      raise exception 'solo un admin può cambiare i ruoli';
    end if;
    if exists (select 1 from groups x where x.id = new.group_id and x.owner = new.user_id)
       and new.role <> 'admin' then
      raise exception 'il proprietario del gruppo resta admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_role_trg on public.group_members;
create trigger guard_role_trg before update on public.group_members
  for each row execute function public.guard_role();

-- Chi crea il gruppo ne diventa subito admin, senza un secondo giro.
create or replace function public.after_group_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id, role)
  values (new.id, new.owner, 'admin')
  on conflict (group_id, user_id) do update set role = 'admin';
  insert into selections (group_id) values (new.id) on conflict (group_id) do nothing;
  insert into board (group_id) values (new.id) on conflict (group_id) do nothing;
  return new;
end;
$$;

drop trigger if exists after_group_insert_trg on public.groups;
create trigger after_group_insert_trg after insert on public.groups
  for each row execute function public.after_group_insert();

-- ─── Permessi (RLS) ────────────────────────────────────────────────

alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.selections     enable row level security;
alter table public.photos         enable row level security;
alter table public.board          enable row level security;

-- `owner` si legge dalla riga candidata invece di richiamare is_member():
-- con INSERT ... RETURNING la policy di lettura viene applicata alla riga
-- appena creata, che una sottoquery dello stesso comando non vede ancora.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select
  using (owner = auth.uid() or is_member(id));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert with check (owner = auth.uid());

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update
  using (owner = auth.uid() or is_admin(id))
  with check (owner = auth.uid() or is_admin(id));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete using (owner = auth.uid());

drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members for select using (is_member(group_id));

-- L'inserimento passa solo da join_group() o dal trigger di creazione.
drop policy if exists members_update_self on public.group_members;
create policy members_update_self on public.group_members for update
  using (user_id = auth.uid() or is_admin(group_id))
  with check (user_id = auth.uid() or is_admin(group_id));

drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members for delete
  using (user_id = auth.uid() or is_admin(group_id));

drop policy if exists sel_select on public.selections;
create policy sel_select on public.selections for select using (is_member(group_id));

-- La selezione squadre la muovono tutti i membri: è il suo scopo.
drop policy if exists sel_write on public.selections;
create policy sel_write on public.selections for update
  using (is_member(group_id)) with check (is_member(group_id));

drop policy if exists sel_insert on public.selections;
create policy sel_insert on public.selections for insert with check (is_member(group_id));

-- La bacheca la muovono tutti i membri: convocazioni e capitani sono cose
-- che si aggiustano fra giocatori, senza passare da un admin.
drop policy if exists board_select on public.board;
create policy board_select on public.board for select using (is_member(group_id));

drop policy if exists board_insert on public.board;
create policy board_insert on public.board for insert with check (is_member(group_id));

drop policy if exists board_update on public.board;
create policy board_update on public.board for update
  using (is_member(group_id)) with check (is_member(group_id));

drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos for select using (is_member(group_id));

-- Ognuno cambia la propria foto; l'admin quella di chiunque.
drop policy if exists photos_write on public.photos;
create policy photos_write on public.photos for insert
  with check (is_admin(group_id) or player_id = my_player(group_id));

drop policy if exists photos_update on public.photos;
create policy photos_update on public.photos for update
  using (is_admin(group_id) or player_id = my_player(group_id))
  with check (is_admin(group_id) or player_id = my_player(group_id));

drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos for delete
  using (is_admin(group_id) or player_id = my_player(group_id));

-- ─── Tempo reale ───────────────────────────────────────────────────
-- Le foto restano fuori: si scaricano a parte solo quando cambia il rev.

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.groups';        exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.selections';    exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.group_members'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.board';         exception when duplicate_object then null; end;
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
