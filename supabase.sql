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
end $$;
