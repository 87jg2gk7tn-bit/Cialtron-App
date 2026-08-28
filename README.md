# CialtronApp ⚽

App web per gestire un gruppo di calcetto ricreativo.
Single-file HTML standalone: nessun framework da installare, nessuna build, vanilla JS + React da CDN.

Apri `index.html` in un browser (o pubblicalo su GitHub Pages / Netlify) e funziona.

## Stack tecnico

| Cosa | Come |
|---|---|
| UI | React 18 da CDN, JSX compilato a runtime da Babel standalone |
| Sync | Firebase Realtime Database via REST (`fetch` su `*.json`), nessun SDK |
| Import Excel | XLSX.js (script già caricato) |
| Font | Bebas Neue + DM Sans (Google Fonts) |
| Persistenza locale | `localStorage` per l'URL del database (`cia-db-url`) |

## Modello dati (nodo radice Firebase)

```
adminPin        "1234"
players         [ { id, name, photo, overrides:{presences,wins,goals,mvps} } ]
matches         [ { id, date, white:[id], black:[id], winner:"white"|"black", mvp, goals:{id:n} } ]
teamSelection   { phase:"idle"|"picking"|"captain"|"done", assign:{id:"white"|"black"},
                  captainSide, finalWhite:[id], finalBlack:[id] }
```

Le statistiche **non** sono memorizzate: `computeStats()` le ricalcola dalle partite a ogni render.
Gli `overrides` di un giocatore, se presenti, hanno la precedenza sul valore calcolato.

## Funzionalità

* **Classifica** — ordinata per media (punti ÷ presenze), 3 punti per vittoria, badge CAP (1º) e PICK (ultimo), modifica manuale delle stat con ✏️ (solo admin)
* **Partite** — assegna i giocatori a Bianchi/Neri → vincitore, MVP e gol; storico cancellabile
* **Selezione squadre** — il Picker (ultimo in classifica) forma le squadre, invia la proposta al Capitano (primo) che sceglie il lato; sincronizzata per tutti via polling Firebase ogni 3 s
* **Rosa** — foto caricabile da iPhone (ridimensionata a 160 px, JPEG 65 %), nome modificabile, 5 statistiche calcolate automaticamente
* **Admin PIN** — solo chi conosce il PIN (salvato su Firebase) modifica i dati; gli altri vedono tutto e partecipano alla selezione squadre
* **Setup guidato** — al primo avvio chiede l'URL Firebase e il PIN, poi salva l'URL in `localStorage`

## Setup

1. [console.firebase.google.com](https://console.firebase.google.com) → nuovo progetto
2. Realtime Database → Crea database → modalità test
3. Copia l'URL (`https://xxx-default-rtdb.firebaseio.com`) e incollalo al primo avvio dell'app
4. Scegli il PIN admin

> Le regole "modalità test" scadono dopo 30 giorni. Per non perdere l'accesso, in
> Firebase → Realtime Database → Regole imposta `{"rules":{".read":true,".write":true}}`.

## Da fare

* **Import Excel** (colonne `Nome · Presenze · Vittorie · Gol · MVP`) — XLSX.js è caricato ma non ancora usato
* **Foto fuori dal nodo `players`** — oggi le foto base64 viaggiano dentro `players` e vengono riscaricate a ogni polling (3 s); vanno spostate su un nodo separato con cache in `localStorage`
* **Setup non distruttivo** — se la GET iniziale fallisce per un problema di rete, il setup riscrive `players` e `matches` vuoti
* **Overrides** — modificare a mano le stat di un giocatore le congela: le partite successive non le aggiornano più
* **Identità del dispositivo** — nella selezione squadre chiunque può agire da Picker o da Capitano
