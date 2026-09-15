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
E=44444444-4444-4444-4444-444444444444   # estraneo vero, non entra mai
OK=0; KO=0
as(){ local uid=$1; shift; $PSQL -c "select set_config('request.jwt.claim.sub','$uid',false);" -c "$*" 2>&1 | tail -n +2; }
ok(){   if [ "$2" == "$3" ]; then echo "  ✓ $1"; OK=$((OK+1)); else echo "  ✗ $1  → atteso [$3] ottenuto [$2]"; KO=$((KO+1)); fi }
deve_fallire(){ local out; out=$(as "$2" "$3"); if echo "$out"|grep -qi 'errore\|error\|denied\|violates\|exception\|permission'; then echo "  ✓ $1"; OK=$((OK+1)); else echo "  ✗ $1  → non ha dato errore: $out"; KO=$((KO+1)); fi }

psql -h ${PGHOST:-/tmp} -p ${PGPORT:-5555} -U ${PGADMIN:-pg} -d ${PGDATABASE:-postgres} -X -q -c "
  truncate groups cascade;
  insert into auth.users(id,email) values
   ('$A','admin@x.it'),('$B','gioc@x.it'),('$C','estraneo@x.it'),('$E','fuori@x.it') on conflict do nothing;"

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

echo "— BACHECA: CONVOCAZIONI E CAPITANI —"
ok "la bacheca nasce col gruppo" "$(as $A "select count(*) from board where group_id='$GID';")" "1"
ok "un giocatore normale cambia il giorno" "$(as $C "update board set settings='{\"matchDay\":0,\"matchTime\":\"20:30\"}'::jsonb where group_id='$GID'; select settings->>'matchTime' from board where group_id='$GID';")" "20:30"
ok "un giocatore normale sceglie il capitano" "$(as $C "update board set settings=settings||'{\"captainId\":\"p1\"}'::jsonb where group_id='$GID'; select settings->>'captainId' from board where group_id='$GID';")" "p1"
# l'estraneo prova a scrivere; la verifica la fa chi la bacheca può leggerla
as $E "update board set settings='{\"rubato\":true}'::jsonb where group_id='$GID';" >/dev/null 2>&1
ok "un estraneo non tocca la bacheca" "$(as $A "select (settings ? 'rubato') from board where group_id='$GID';")" "f"
ok "e non vede nemmeno la bacheca" "$(as $E "select count(*) from board;")" "0"
deve_fallire "un estraneo non risponde alle convocazioni" $E "select set_callup('$GID','2026-09-20','p1','si');"

D=$(date -u +%Y-%m-%d)
ok "rispondo alla convocazione" "$(as $C "select set_callup('$GID','$D','p1','si')->'$D'->'p1'->>'v';")" "si"
ok "risponde anche un altro" "$(as $A "select set_callup('$GID','$D','p9','no')->'$D'->'p9'->>'v';")" "no"
ok "la prima risposta non viene persa" "$(as $A "select callups->'$D'->'p1'->>'v' from board where group_id='$GID';")" "si"
ok "si può cambiare idea" "$(as $C "select set_callup('$GID','$D','p1','no')->'$D'->'p1'->>'v';")" "no"
ok "si può togliere la risposta" "$(as $C "select coalesce(set_callup('$GID','$D','p1','')->'$D'->'p1'->>'v','(vuoto)');")" "(vuoto)"
ok "resta scritto chi ha risposto" "$(as $A "select (callups->'$D'->'p9'->>'by') = '$A' from board where group_id='$GID';")" "t"
deve_fallire "risposta senza senso rifiutata" $C "select set_callup('$GID','$D','p9','forse');"
deve_fallire "data senza senso rifiutata" $C "select set_callup('$GID','domenica','p9','si');"
VECCHIA=$(date -u -d '120 days ago' +%Y-%m-%d)
as $A "select set_callup('$GID','$VECCHIA','p9','si');" >/dev/null
as $A "select set_callup('$GID','$D','p9','si');" >/dev/null
ok "le convocazioni vecchie vengono potate" "$(as $A "select callups ? '$VECCHIA' from board where group_id='$GID';")" "f"

echo "— SEGNARE DAL POLSO —"
# l'orologio non fa login: parla col database usando la sola chiave pubblica,
# che qui è il ruolo "ospite". Deve poter fare una cosa sola, con il codice.
POLSO="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-5555} -U ospite -d ${PGDATABASE:-postgres} -X -q -t -A"
orologio(){ $POLSO -c "$*" 2>&1 | tail -n +1; }
orologio_fallisce(){ local out; out=$(orologio "$2"); if echo "$out"|grep -qi 'error\|denied\|exception\|permission'; then echo "  ✓ $1"; OK=$((OK+1)); else echo "  ✗ $1  → non ha dato errore: $out"; KO=$((KO+1)); fi }

# una rosa vera nel gruppo, per far risolvere i nomi
as $A "update groups set data='{\"players\":[{\"id\":\"pm\",\"name\":\"Mera\"},{\"id\":\"pp\",\"name\":\"Pedro\"}],\"matches\":[]}'::jsonb where id='$GID';" >/dev/null
TOK=$(as $C "select live_open('$GID','[\"pm\"]'::jsonb,'[\"pp\"]'::jsonb);")
ok "un giocatore qualunque apre la partita dal vivo" "$(echo -n $TOK | grep -cE '^[A-Z0-9]{5}$')" "1"
deve_fallire "un estraneo non apre niente" $E "select live_open('$GID');"
orologio_fallisce "l'orologio non può aprire una partita" "select live_open('$GID');"

# dal polso si manda solo il nome: la squadra la sa il database
ok "l'orologio segna col solo nome" "$(orologio "select live_goal('$TOK','Pedro')->>'chi';")" "Pedro"
ok "e lo mette nella squadra giusta" "$(as $A "select team from live_goals where token='$TOK' order by id desc limit 1;")" "black"
ok "il nome diventa il giocatore giusto" "$(as $A "select player_id from live_goals where token='$TOK' order by id desc limit 1;")" "pp"
ok "funziona anche scritto a metà" "$(orologio "select live_goal('$TOK','mer')->>'chi';")" "Mera"
ok "e Mera finisce coi bianchi" "$(as $A "select team from live_goals where token='$TOK' order by id desc limit 1;")" "white"
ok "il punteggio torna indietro sul quadrante" "$(orologio "select live_goal('$TOK','⬛ senza nome')->>'testo';")" "⬜ 1 - 2 ⬛   gol senza nome"
ok "il punteggio lo tiene il database" "$(as $A "select count(*) from live_goals where token='$TOK';")" "3"
ok "annullare si scrive nella stessa casella" "$(orologio "select live_goal('$TOK','annulla ultimo')->>'chi';")" "senza nome"
ok "e ne resta uno in meno" "$(as $A "select count(*) from live_goals where token='$TOK';")" "2"
ok "e anche il gol di prima, coi bianchi che tornano a zero" "$(orologio "select live_undo('$TOK')->>'white';")" "0"
ok "restano solo i gol veri" "$(as $A "select count(*) from live_goals where token='$TOK';")" "1"
orologio "select live_goal('$TOK','⬜ Pedro');" >/dev/null
ok "col simbolo davanti la squadra la decidi tu" "$(as $A "select team from live_goals where token='$TOK' order by id desc limit 1;")" "white"

orologio_fallisce "un codice inventato non apre niente" "select live_goal('ZZZZZ','Pedro');"
orologio_fallisce "un nome che non esiste è rifiutato" "select live_goal('$TOK','Ronaldo');"
orologio_fallisce "senza squadra e senza nome non si segna" "select live_goal('$TOK','senza nome');"
orologio_fallisce "col codice non si leggono i gol" "select count(*) from live_goals;"
orologio_fallisce "col codice non si legge la rosa" "select count(*) from groups;"

ok "i gol si vedono nel gruppo" "$(as $B "select count(*) from live_goals where token='$TOK';")" "2"
ok "un estraneo non li vede" "$(as $E "select count(*) from live_goals;")" "0"
ok "dall'app si toglie un gol storto" "$(as $B "delete from live_goals where token='$TOK'; select count(*) from live_goals where token='$TOK';")" "0"

TOK2=$(as $A "select live_open('$GID');")
ok "aprirne un'altra chiude la prima" "$(as $A "select closed_at is not null from live_matches where token='$TOK';")" "t"
orologio_fallisce "sul codice chiuso non si segna più" "select live_goal('$TOK','Pedro');"
ok "sul codice nuovo sì, dicendo la squadra" "$(orologio "select live_goal('$TOK2','⬛ Mera')->>'testo';")" "⬜ 0 - 1 ⬛   Mera"
orologio_fallisce "ma senza squadre aperte il nome da solo non basta" "select live_goal('$TOK2','Pedro');"
as $A "select live_close('$TOK2');" >/dev/null
orologio_fallisce "chiusa la partita, l'orologio non scrive più" "select live_goal('$TOK2','⬛ Mera');"
as $A "update live_matches set closed_at=null, expires_at=now()-interval '1 hour' where token='$TOK2';" >/dev/null
orologio_fallisce "e un codice scaduto non vale" "select live_goal('$TOK2','⬛ Mera');"

echo
echo "=========================="
echo "PASSATI: $OK   FALLITI: $KO"
exit $([ $KO -eq 0 ] && echo 0 || echo 1)
