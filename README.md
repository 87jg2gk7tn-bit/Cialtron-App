# CialtronApp ⚽

App web per gestire un gruppo di calcetto ricreativo.
Single-file HTML standalone: nessun framework da installare, nessuna build, vanilla JS + React da CDN.

Ogni giocatore ha il suo account. Il primo crea il gruppo, gli altri entrano con un codice
invito e dicono chi sono nella rosa; da lì in poi le modifiche si vedono in tempo reale su
tutti i telefoni.

## Come si aggiorna

Ogni push su `main` fa ripartire `.github/workflows/pages.yml`, che ripubblica il sito su
GitHub Pages. Il service worker riprende sempre l'HTML dalla rete quando c'è (la cache serve
solo offline), e l'app confronta `version.json` con la propria versione: se non coincidono
compare la barra **"Nuova versione disponibile → Aggiorna"**. La versione in esecuzione è
scritta in fondo a ogni schermata.

Pubblicando una modifica vanno aggiornati insieme `APP_VERSION` in `index.html` e
`version.json` (stesso valore, più una nota breve).

## Installarla sul telefono

Apri il sito in **Safari** → Condividi → **Aggiungi a Home**. Parte a schermo intero con la
sua icona. Su Android: Chrome → menu → Installa app.

> La web app installata su iOS ha uno spazio dati separato da Safari: la prima volta dentro
> l'app va rifatto l'accesso.

## Stack tecnico

| Cosa | Come |
|---|---|
| UI | React 18 da CDN, JSX compilato a runtime da Babel standalone |
| Account e dati | Supabase: autenticazione email/password, Postgres con RLS, Realtime |
| Import Excel | XLSX.js |
| Offline e aggiornamenti | `sw.js`, network-first sull'HTML |
| Font | Bebas Neue + DM Sans (Google Fonts) |
| Sul dispositivo | `localStorage`: progetto Supabase (`cialtron_cfg`), ultimo gruppo (`cialtron_group`), cache foto (`cia-photo-<gruppo>-<giocatore>`) |

## Il database

Lo schema completo è in **`supabase.sql`** — da incollare nel SQL Editor di Supabase e
lanciare una volta sola. È riscrivibile: rieseguirlo non cancella dati.

```
groups         id, owner, name, invite_code, data jsonb   ← rosa e partite, ci scrivono gli admin
group_members  group_id, user_id, player_id, role         ← chi è chi, e chi può cosa
selections     group_id, state jsonb                      ← selezione squadre, ci scrivono tutti i membri
board          group_id, settings, callups jsonb          ← giorno di gioco, capitani scelti, convocazioni
photos         group_id, player_id, photo, rev            ← fuori dal documento: sono base64 pesanti
```

Le statistiche **non** sono memorizzate: si ricalcolano dalle partite e ci si somma `base`,
la parte manuale (storico importato o correzione con ✏️). Le partite registrate dopo
continuano quindi ad aggiornare i totali.

I punti sono `vittorie × 3`. **Il pareggio non esiste**: si gioca finché non vince
qualcuno, quindi un punteggio pari non si può salvare — la schermata del risultato lo
dice e non fa proseguire. Se in archivio è rimasta una partita chiusa in pari da prima
di questa regola, conta come presenza e nient'altro, e la lista Partite la segnala con
`PARI · NESSUN PUNTO` perché si possa cancellare e riscrivere.

I permessi stanno nelle policy RLS, non nell'app: un giocatore che provasse a scrivere la
classifica verrebbe fermato dal database. Le regole sono verificate da `test/rls-test.sh`
(42 controlli su un Postgres locale con un finto schema `auth`).

Le risposte alla convocazione passano dalla funzione `set_callup`, che blocca la riga e
infila la risposta dentro: due persone che rispondono nello stesso istante non si
cancellano a vicenda. Le date più vecchie di 60 giorni vengono potate da sole.

## Ruoli

| | admin | giocatore |
|---|---|---|
| Classifica, partite, rosa, import | ✅ | 👀 sola lettura |
| Selezione squadre | ✅ | ✅ (al proprio turno: picker o capitano) |
| Convocazioni, giorno di gioco, scelta dei capitani | ✅ | ✅ |
| La propria foto e il proprio nome | ✅ | ✅ |
| Invitare, promuovere altri admin | ✅ | ❌ |

Chi crea il gruppo ne è il proprietario, è sempre admin e non è degradabile.

## Funzionalità

* **Classifica** — tre classifiche dagli stessi numeri, con lo switcher in alto: **generale** ordinata per **media** (punti ÷ presenze: 6 punti in 2 partite fa 3.00 e sta sopra a 3 punti in 2 partite, che fa 1.50), **marcatori** per gol e **MVP** per premi. I punti sono 3 per vittoria, e il pareggio non esiste. La maglia nera in fondo vale solo nella generale. Badge CAP e PICK, correzione manuale con ✏️. Compatta sotto i 460 px, tabellare sopra
* **Classifica in PDF** — dal tasto in fondo alla classifica esce un foglio A4 con podio, foto, tutte e tre le classifiche e i numeri della stagione. La libreria si scarica solo quando si preme il tasto (serve la rete la prima volta). Sul telefono si apre il menu di condivisione, così va dritta nel gruppo; altrove si scarica come file
* **Rosa** — un tocco sulla foto la apre grande, e da lì "Modifica" per scattarne una nuova o prenderla dalle foto del telefono; "Togli la foto" torna all'iniziale colorata
* **Partita in corso** — i gol segnati dall'**Apple Watch** mentre si gioca arrivano in tempo reale su tutti i telefoni: in Partite compaiono come partita in corso, e da lì si registra con risultato e marcatori già scritti. Dell'orologio, nell'app, non si vede niente. Vedi *Gol dal polso* più sotto
* **Partite** — 3 step: squadre → **risultato** → MVP e gol, con **Avanti e Indietro** a ogni passo e niente che si perde tornando sui propri passi. Il vincitore si ricava dal punteggio: 3 punti a chi vince, e un punteggio pari non si può salvare. I gol si assegnano squadra per squadra, con il contatore "quanti di quanti" accanto a ognuna (avvisa se non tornano, non blocca: le autoreti esistono). Prima di scrivere in storico compare un **riepilogo da confermare**, e da lì in poi la partita si **riapre con ✏️** per correggere risultato, gol o MVP: resta la stessa partita, e classifica e statistiche si rifanno da sole
* **Convocazione** — la prossima partita (di serie il **giovedì**) con chi c'è e chi no, modificabile da chiunque fino all'ultimo. La domanda "ci sei?" comincia a girare dal **giorno d'avviso** — di serie la domenica prima — e ti segue in cima a ogni schermata finché non rispondi. Giorno di gioco, giorno d'avviso e orario li cambia chiunque dalla scheda
* **Avvisi di turno** — un'app senza server non può mandare notifiche vere: al loro posto, chi deve fare qualcosa se lo trova scritto in cima a ogni schermata. *Tocca a te chiamare* durante la chiamata alternata, *le squadre sono pronte, scegli con quale giocare* quando il formatore ha finito la cava
* **Selezione squadre** — due metodi, in tempo reale e ognuno al proprio turno:
  * **cava** — il Formatore fa le due squadre, il Capitano sceglie con quale giocare
  * **tradizionale** — chiamata alternata, uno per volta, comincia il Formatore

  Si pesca fra chi ha detto "ci sono" nella convocazione (o tutta la rosa, se il gruppo decide così). Capitano e Formatore sono il primo e l'ultimo **fra chi gioca**, e si possono scegliere a mano.

  A squadre fatte niente è bloccato: si sposta un giocatore da una parte all'altra, si toglie chi si è ritirato, si aggiunge chi arriva all'ultimo o un esterno — senza rifare la chiamata e senza cambiare metodo
* **Esterni** — riempitivi per arrivare al numero quando mancano giocatori: entrano nelle squadre e nelle partite ma non hanno profilo, non prendono statistiche e non compaiono in classifica
* **Rosa** — foto dal telefono (ritagliata a 160 px, JPEG 65 %), 5 statistiche calcolate e modificabili al volo con la matita, senza passare dall'Excel
* **Import Excel** — `Nome · Presenze · Vittorie · Gol · MVP`, con anteprima che confronta riga per riga i numeri del foglio con quelli già in app (`20 → 22`) prima di scrivere niente
* **Migrazione** — porta dentro rosa, partite e foto dal vecchio database Firebase

## Gol dal polso (Apple Watch)

Mentre si gioca il telefono è in borsa. Con una **scorciatoia** (app Comandi Rapidi, che
gira anche su Apple Watch) i gol si segnano dal quadrante e arrivano nell'app in tempo
reale. Non serve un'app nativa, né un Mac, né l'iscrizione da sviluppatore: la scorciatoia
chiama una funzione del database.

**Nell'app non c'è nessuna schermata dell'orologio.** I gol arrivano e basta: in Partite
compare la **partita in corso** — punteggio, chi ha segnato, la ✕ per togliere un gol
sbagliato — e da lì si registra, con risultato e marcatori già compilati. Chiusa la
registrazione, la partita in corso sparisce. Tutto quello che riguarda l'orologio sta nel
pannello dell'account, sotto *Orologio*, dove si va una volta sola.

**Come sta in piedi.** Il gruppo ha un **codice fisso di 6 caratteri** (`live_code`), che
si mette nella scorciatoia una volta e non si tocca più; se gira troppo lo si cambia
(`live_rotate`) e il vecchio smette di valere. Quel codice è l'unica credenziale che gira
sull'orologio, e con esso si può fare una cosa sola: aggiungere o togliere un gol
(`live_goal` / `live_undo`, chiamabili con la chiave pubblica). Non legge la rosa, non
tocca la classifica, non vede nient'altro. I gol stanno in `live_goals`, una riga per gol
— due tocchi ravvicinati non si sovrascrivono — e contano solo quelli delle ultime 12 ore:
la partita è adesso.

**La squadra non si chiede.** Il database la prende dalle squadre appena formate nella
selezione: dal polso basta il **nome**. Davanti al nome si può comunque mettere `⬜` o `⬛`
per dirla, e la stessa casella accetta `⬜ senza nome` (punteggio senza marcatore) e
`annulla` (toglie l'ultimo gol). La risposta torna al polso già pronta da leggere:
`⬜ 3 - 2 ⬛   Pedro`.

**La scorciatoia, una volta sola** (iPhone → Comandi Rapidi → +):

1. **Testo** — l'elenco dei nomi, uno per riga, più `⬜ senza nome`, `⬛ senza nome`, `Annulla ultimo`
2. **Dividi testo** — separatore *Nuove righe*
3. **Scegli da un elenco**
4. **Ottieni contenuto di URL** — `POST` su `https://<progetto>.supabase.co/rest/v1/rpc/live_goal`,
   intestazioni `apikey: <chiave pubblica>` e `Content-Type: application/json`,
   corpo JSON `{"p_code":"<codice>","p_who":"<risultato del passo 3>"}`
5. **Mostra risultato** — il campo `testo` della risposta

Il comando compare nell'app Comandi Rapidi dell'orologio e si può mettere sul quadrante.
Elenco, URL, chiave e corpo sono già pronti da copiare in *Account → Orologio*.

**Quello che non copre.** Il cronometro del cambio porta ogni 5 minuti resta fuori: per
quello va bene una qualsiasi app da intervalli sul Watch, che vibra al polso anche mentre
si gioca. E se l'orologio in quel momento non raggiunge il telefono, il tocco si perde e la
scorciatoia lo dice: si ripreme, oppure si sistema dopo dall'app.

## Primo avvio

1. [supabase.com](https://supabase.com) → **New project**
2. **SQL Editor** → incolla `supabase.sql` → **Run**
3. **Authentication → Sign In / Providers → Email** → togli *Confirm email*
4. **Project Settings → API** → copia *Project URL* e *chiave anon* nell'app
5. Crea il gruppo, aggiungi la rosa, condividi il codice invito

La chiave *anon* è fatta per stare nell'app: da sola non apre niente, sono le policy a
decidere chi vede cosa. La *service_role* non va mai messa qui dentro.
