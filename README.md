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
photos         group_id, player_id, photo, rev            ← fuori dal documento: sono base64 pesanti
```

Le statistiche **non** sono memorizzate: si ricalcolano dalle partite e ci si somma `base`,
la parte manuale (storico importato o correzione con ✏️). Le partite registrate dopo
continuano quindi ad aggiornare i totali.

I permessi stanno nelle policy RLS, non nell'app: un giocatore che provasse a scrivere la
classifica verrebbe fermato dal database. Le regole sono verificate da `test/rls-test.sh`
(27 controlli su un Postgres locale con un finto schema `auth`).

## Ruoli

| | admin | giocatore |
|---|---|---|
| Classifica, partite, rosa, import | ✅ | 👀 sola lettura |
| Selezione squadre | ✅ | ✅ (al proprio turno: picker o capitano) |
| La propria foto e il proprio nome | ✅ | ✅ |
| Invitare, promuovere altri admin | ✅ | ❌ |

Chi crea il gruppo ne è il proprietario, è sempre admin e non è degradabile.

## Funzionalità

* **Classifica** — media (punti ÷ presenze), 3 punti per vittoria, badge CAP (1º) e PICK (ultimo), correzione manuale con ✏️. Compatta sotto i 460 px, tabellare sopra
* **Partite** — 3 step: squadre → vincitore → MVP e gol; storico cancellabile
* **Selezione squadre** — il Picker forma le squadre, il Capitano sceglie il lato; in tempo reale, e ognuno agisce solo al proprio turno
* **Rosa** — foto dal telefono (ritagliata a 160 px, JPEG 65 %), 5 statistiche calcolate
* **Import Excel** — `Nome · Presenze · Vittorie · Gol · MVP`, con anteprima
* **Migrazione** — porta dentro rosa, partite e foto dal vecchio database Firebase

## Primo avvio

1. [supabase.com](https://supabase.com) → **New project**
2. **SQL Editor** → incolla `supabase.sql` → **Run**
3. **Authentication → Sign In / Providers → Email** → togli *Confirm email*
4. **Project Settings → API** → copia *Project URL* e *chiave anon* nell'app
5. Crea il gruppo, aggiungi la rosa, condividi il codice invito

La chiave *anon* è fatta per stare nell'app: da sola non apre niente, sono le policy a
decidere chi vede cosa. La *service_role* non va mai messa qui dentro.
