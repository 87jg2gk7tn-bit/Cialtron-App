-- ═══════════════════════════════════════════════════════════════════
--  CialtronApp — aggiunta "vota l'MVP"
--  Da incollare in Supabase → SQL Editor → Run, nello stesso progetto
--  dove hai già lanciato supabase.sql. Si può rilanciare senza danni.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.trips') is not null then
    raise exception E'Fermo: questo database è quello di GeppGo, non di CialtronApp.';
  end if;
  if to_regclass('public.board') is null then
    raise exception E'Fermo: qui non c''è CialtronApp. Lancia prima supabase.sql.';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════
--  VOTA L'MVP
--  Dopo la partita chi ha giocato vota il migliore dei bianchi e il
--  migliore dei neri. I due più votati vanno al ballottaggio, e lì
--  votano tutti gli altri — i finalisti no. Si può votare sé stessi, e
--  se il ballottaggio finisce pari l'MVP è di entrambi.
--
--  I voti stanno nella bacheca, uno per votante, e ci si scrive solo
--  da questa funzione: così nessuno vota al posto di un altro e due
--  voti nello stesso istante non si cancellano a vicenda.
-- ═══════════════════════════════════════════════════════════════════

alter table public.board add column if not exists votes jsonb not null default '{}'::jsonb;

create or replace function public.set_vote(p_group uuid, p_match text, p_round text,
                                           p_a text default null, p_b text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur jsonb; part jsonb; io text; blocco jsonb;
begin
  if not is_member(p_group) then raise exception 'non sei in questo gruppo'; end if;
  io := my_player(p_group);
  if io is null then raise exception 'non sei collegato a un giocatore della rosa'; end if;

  select e into part
    from groups g, jsonb_array_elements(coalesce(g.data->'matches','[]'::jsonb)) e
   where g.id = p_group and e->>'id' = p_match
   limit 1;
  if part is null then raise exception 'partita non trovata'; end if;

  if not ((coalesce(part->'white','[]'::jsonb) ? io) or (coalesce(part->'black','[]'::jsonb) ? io)) then
    raise exception 'puoi votare solo se hai giocato questa partita';
  end if;

  insert into board (group_id) values (p_group) on conflict (group_id) do nothing;
  select votes into cur from board where group_id = p_group for update;
  cur := coalesce(cur, '{}'::jsonb);
  blocco := coalesce(cur -> p_match, '{}'::jsonb);

  if p_round = 'r1' then
    if p_a is null or p_b is null then raise exception 'servono due voti: un bianco e un nero'; end if;
    if not (coalesce(part->'white','[]'::jsonb) ? p_a) then raise exception 'il primo voto va a un giocatore dei bianchi'; end if;
    if not (coalesce(part->'black','[]'::jsonb) ? p_b) then raise exception 'il secondo voto va a un giocatore dei neri'; end if;
    if not (blocco ? 'r1') then blocco := blocco || jsonb_build_object('r1','{}'::jsonb); end if;
    blocco := jsonb_set(blocco, array['r1', io], jsonb_build_object('w', p_a, 'b', p_b), true);

  elsif p_round = 'r2' then
    if p_a is null then raise exception 'serve un voto'; end if;
    if not (blocco ? 'r2') then blocco := blocco || jsonb_build_object('r2','{}'::jsonb); end if;
    blocco := jsonb_set(blocco, array['r2', io], to_jsonb(p_a), true);

  elsif p_round = 'close1' then blocco := blocco || jsonb_build_object('closed1', true);
  elsif p_round = 'close2' then blocco := blocco || jsonb_build_object('closed2', true);
  elsif p_round = 'reset'  then blocco := '{}'::jsonb;
  else raise exception 'turno non valido';
  end if;

  cur := cur || jsonb_build_object(p_match, blocco);
  update board set votes = cur, updated_at = now(), updated_by = auth.uid() where group_id = p_group;
  return cur;
end;
$$;

revoke execute on function public.set_vote(uuid,text,text,text,text) from anon;
grant  execute on function public.set_vote(uuid,text,text,text,text) to authenticated;
