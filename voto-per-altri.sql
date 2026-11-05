-- ═══════════════════════════════════════════════════════════════════
--  CialtronApp — aggiunta "votare per conto di un altro"
--  Da incollare in Supabase → SQL Editor → Run, nello stesso progetto
--  dove hai già lanciato supabase.sql e voto-mvp.sql.
--  Si può rilanciare senza danni.
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
--  VOTARE PER CONTO DI UN ALTRO
--  Succede sempre: uno è già in macchina, uno non ha l'app, uno il
--  telefono ce l'ha scarico — e il voto te lo dicono a voce. Finora
--  set_vote scriveva solo sotto il nome di chi chiamava.
--
--  Adesso accetta p_who: il voto finisce sotto quel nome lì. Resta
--  fermo quello che conta davvero — si vota solo per chi ha giocato
--  quella partita, e chi registra dev'essere del gruppo. Un voto per
--  conto di un altro sovrascrive il suo precedente, come il proprio:
--  sempre uno a testa, mai due.
-- ═══════════════════════════════════════════════════════════════════

-- La vecchia firma a cinque argomenti va tolta: con tutte e due in piedi
-- una chiamata a cinque sarebbe ambigua e il database la rifiuterebbe.
drop function if exists public.set_vote(uuid,text,text,text,text);

create or replace function public.set_vote(p_group uuid, p_match text, p_round text,
                                           p_a text default null, p_b text default null,
                                           p_who text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur jsonb; part jsonb; io text; blocco jsonb;
begin
  if not is_member(p_group) then raise exception 'non sei in questo gruppo'; end if;

  select e into part
    from groups g, jsonb_array_elements(coalesce(g.data->'matches','[]'::jsonb)) e
   where g.id = p_group and e->>'id' = p_match
   limit 1;
  if part is null then raise exception 'partita non trovata'; end if;

  -- sotto quale nome finisce il voto: il mio, o quello di chi me l'ha dettato
  io := coalesce(nullif(p_who,''), my_player(p_group));
  if io is null then raise exception 'non sei collegato a un giocatore della rosa'; end if;

  if not ((coalesce(part->'white','[]'::jsonb) ? io) or (coalesce(part->'black','[]'::jsonb) ? io)) then
    raise exception 'si vota solo per chi ha giocato questa partita';
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

revoke execute on function public.set_vote(uuid,text,text,text,text,text) from anon;
grant  execute on function public.set_vote(uuid,text,text,text,text,text) to authenticated;
