#!/bin/bash
# Verifica le policy di supabase.sql su un Postgres locale.
#
#   initdb -D /tmp/pg -U pg --auth=trust && pg_ctl -D /tmp/pg -o "-p 5555 -k /tmp" start
#   psql -h /tmp -p 5555 -U pg -d postgres -f test/pg-stub.sql   # finto schema auth
#   psql -h /tmp -p 5555 -U pg -d postgres -c "create publication supabase_realtime;"
#   psql -h /tmp -p 5555 -U pg -d postgres -f supabase.sql
#   psql -h /tmp -p 5555 -U pg -d postgres -f test/pg-grants.sql
#   test/rls-test.sh
#
# Ogni caso gira in una sessione a sé, come utente non privilegiato: è l'unico
# modo perché le policy RLS vengano davvero applicate (un superuser le salta).
PSQL="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-5555} -U ${PGUSER:-app} -d ${PGDATABASE:-postgres} -X -q -t -A"
A=11111111-1111-1111-1111-111111111111   # admin / proprietario
B=22222222-2222-2222-2222-222222222222   # giocatore
C=33333333-3333-3333-3333-333333333333   # estraneo
OK=0; KO=0
as(){ local uid=$1; shift; $PSQL -c "select set_config('request.jwt.claim.sub','$uid',false);" -c "$*" 2>&1 | tail -n +2; }
ok(){   if [ "$2" == "$3" ]; then echo "  ✓ $1"; OK=$((OK+1)); else echo "  ✗ $1  → atteso [$3] ottenuto [$2]"; KO=$((KO+1)); fi }
deve_fallire(){ local out; out=$(as "$2" "$3"); if echo "$out"|grep -qi 'errore\|error\|denied\|violates\|exception\|permission'; then echo "  ✓ $1"; OK=$((OK+1)); else echo "  ✗ $1  → non ha dato errore: $out"; KO=$((KO+1)); fi }

psql -h ${PGHOST:-/tmp} -p ${PGPORT:-5555} -U ${PGADMIN:-pg} -d ${PGDATABASE:-postgres} -X -q -c "
  truncate groups cascade;
  insert into auth.users(id,email) values
   ('$A','admin@x.it'),('$B','gioc@x.it'),('$C','estraneo@x.it') on conflict do nothing;"

echo "— CREAZIONE GRUPPO —"
GID=$(as $A "insert into groups(owner,name) values(auth.uid(),'Calcetto del giovedì') returning id;")
ok "il gruppo viene creato" "$(echo $GID | grep -cE "^[0-9a-f-]{36}$")" "1"
ok "chi crea è subito admin" "$(as $A "select role from group_members where group_id='$GID' and user_id=auth.uid();")" "admin"
ok "la selezione squadre nasce con il gruppo" "$(as $A "select count(*) from selections where group_id='$GID';")" "1"
CODE=$(as $A "select invite_code from groups where id='$GID';")
ok "c'è un codice invito" "$(echo -n $CODE|wc -c)" "8"

echo "— UN ESTRANEO NON VEDE NIENTE —"
ok "estraneo: nessun gruppo" "$(as $C "select count(*) from groups;")" "0"
ok "estraneo: nessuna partita" "$(as $C "select count(*) from selections;")" "0"
deve_fallire "estraneo: non può modificare il gruppo" $C "update groups set name='rubato' where id='$GID'; select 1/(case when (select count(*) from groups where name='rubato')=0 then 0 else 1 end);"

echo "— ENTRARE COL CODICE —"
ok "join con codice giusto" "$(as $B "select join_group('$CODE') = '$GID';")" "t"
ok "ora il giocatore vede il gruppo" "$(as $B "select count(*) from groups where id='$GID';")" "1"
ok "entra come 'player'" "$(as $B "select role from group_members where group_id='$GID' and user_id=auth.uid();")" "player"
deve_fallire "codice sbagliato rifiutato" $C "select join_group('zzzzzzzz');"

echo "— CHI PUÒ SCRIVERE COSA —"
ok "admin modifica rosa e partite" "$(as $A "update groups set data='{\"players\":[{\"id\":\"p1\",\"name\":\"Marco\"}],\"matches\":[]}'::jsonb where id='$GID'; select jsonb_array_length(data->'players') from groups where id='$GID';")" "1"
deve_fallire "il giocatore NON modifica la classifica" $B "update groups set data='{\"players\":[]}'::jsonb where id='$GID'; select 1/(case when (select jsonb_array_length(data->'players') from groups where id='$GID')=1 then 0 else 1 end);"
ok "il giocatore muove la selezione squadre" "$(as $B "update selections set state='{\"phase\":\"picking\"}'::jsonb where group_id='$GID'; select state->>'phase' from selections where group_id='$GID';")" "picking"

echo "— IDENTITÀ E FOTO —"
ok "il giocatore dichiara chi è" "$(as $B "update group_members set player_id='p1',member_name='Marco' where group_id='$GID' and user_id=auth.uid(); select player_id from group_members where group_id='$GID' and user_id=auth.uid();")" "p1"
ok "carica la propria foto" "$(as $B "insert into photos(group_id,player_id,photo,rev) values('$GID','p1','data:jpeg',1); select count(*) from photos where group_id='$GID';")" "1"
deve_fallire "non carica la foto di un altro" $B "insert into photos(group_id,player_id,photo,rev) values('$GID','p9','data:jpeg',1);"
ok "l'admin carica la foto di chiunque" "$(as $A "insert into photos(group_id,player_id,photo,rev) values('$GID','p9','data:jpeg',1); select count(*) from photos where group_id='$GID';")" "2"

echo "— RUOLI —"
deve_fallire "nessuno si promuove admin da solo" $B "update group_members set role='admin' where group_id='$GID' and user_id=auth.uid();"
ok "l'admin promuove un altro admin" "$(as $A "update group_members set role='admin' where group_id='$GID' and user_id='$B'; select role from group_members where group_id='$GID' and user_id='$B';")" "admin"
ok "il nuovo admin ora modifica la classifica" "$(as $B "update groups set data='{\"players\":[],\"matches\":[]}'::jsonb where id='$GID'; select jsonb_array_length(data->'players') from groups where id='$GID';")" "0"
deve_fallire "il proprietario non è degradabile" $B "update group_members set role='player' where group_id='$GID' and user_id='$A';"

echo "— AGGIUNGERSI ALLA ROSA —"
as $A "update groups set data='{\"players\":[{\"id\":\"p1\",\"name\":\"Marco\"}],\"matches\":[]}'::jsonb where id='$GID';" >/dev/null
ok "un giocatore si aggiunge da solo" "$(as $C "select join_group('$CODE');" >/dev/null; as $C "select length(claim_new_player('$GID','Fede'));")" "9"
ok "ora la rosa ha due giocatori" "$(as $A "select jsonb_array_length(data->'players') from groups where id='$GID';")" "2"
ok "e risulta collegato alla sua voce" "$(as $C "select member_name from group_members where group_id='$GID' and user_id=auth.uid();")" "Fede"
deve_fallire "non si aggiunge un nome già presente" $C "select claim_new_player('$GID','marco');"
deve_fallire "un estraneo non si aggiunge" $B "select claim_new_player('00000000-0000-0000-0000-000000000000','X');"

echo
echo "=========================="
echo "PASSATI: $OK   FALLITI: $KO"
exit $([ $KO -eq 0 ] && echo 0 || echo 1)
