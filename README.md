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

I punti sono `vittorie × 3 + pareggi`. I pareggi si contano solo dalle partite registrate
nell'app: nello storico importato da Excel non esistono, perché quel foglio non li ha, e
per lo stesso motivo non sono modificabili a mano.

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

* **Classifica** — media (punti ÷ presenze), 3 punti per vittoria, badge CAP (1º) e PICK (ultimo), correzione manuale con ✏️. Compatta sotto i 460 px, tabellare sopra
* **Partite** — 3 step: squadre → **risultato** → MVP e gol. Il vincitore si ricava dal punteggio, e se finisce pari è pareggio: 3 punti a chi vince, 1 a testa se si pareggia. Chi registra vede se i gol assegnati tornano col risultato scritto (avvisa, non blocca: le autoreti esistono). Storico cancellabile
* **Convocazione** — la prossima partita (di serie il **giovedì**) con chi c'è e chi no, modificabile da chiunque fino all'ultimo. La domanda "ci sei?" comincia a girare dal **giorno d'avviso** — di serie la domenica prima — e ti segue in cima a ogni schermata finché non rispondi. Giorno di gioco, giorno d'avviso e orario li cambia chiunque dalla scheda
* **Avvisi di turno** — un'app senza server non può mandare notifiche vere: al loro posto, chi deve fare qualcosa se lo trova scritto in cima a ogni schermata. *Tocca a te chiamare* durante la chiamata alternata, *le squadre sono pronte, scegli con quale giocare* quando il formatore ha finito la cava
* **Selezione squadre** — due metodi, in tempo reale e ognuno al proprio turno:
  * **cava** — il Formatore fa le due squadre, il Capitano sceglie con quale giocare
  * **tradizionale** — chiamata alternata, uno per volta, comincia il Formatore

  Si pesca fra chi ha detto "ci sono" nella convocazione (o tutta la rosa, se il gruppo decide così). Capitano e Formatore sono il primo e l'ultimo **fra chi gioca**, e si possono scegliere a mano
* **Esterni** — riempitivi per arrivare al numero quando mancano giocatori: entrano nelle squadre e nelle partite ma non hanno profilo, non prendono statistiche e non compaiono in classifica
* **Rosa** — foto dal telefono (ritagliata a 160 px, JPEG 65 %), 5 statistiche calcolate e modificabili al volo con la matita, senza passare dall'Excel
* **Import Excel** — `Nome · Presenze · Vittorie · Gol · MVP`, con anteprima che confronta riga per riga i numeri del foglio con quelli già in app (`20 → 22`) prima di scrivere niente
* **Migrazione** — porta dentro rosa, partite e foto dal vecchio database Firebase

## Primo avvio

1. [supabase.com](https://supabase.com) → **New project**
2. **SQL Editor** → incolla `supabase.sql` → **Run**
3. **Authentication → Sign In / Providers → Email** → togli *Confirm email*
4. **Project Settings → API** → copia *Project URL* e *chiave anon* nell'app
5. Crea il gruppo, aggiungi la rosa, condividi il codice invito

La chiave *anon* è fatta per stare nell'app: da sola non apre niente, sono le policy a
decidere chi vede cosa. La *service_role* non va mai messa qui dentro.
