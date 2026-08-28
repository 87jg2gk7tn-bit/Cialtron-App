# CialtronApp ⚽

App web per gestire un gruppo di calcetto ricreativo.
Single-file HTML standalone: nessun framework da installare, nessuna build, vanilla JS + React da CDN.

## Come si aggiorna

Ogni push su questo branch fa ripartire il workflow `.github/workflows/pages.yml`,
che ripubblica il sito su GitHub Pages. L'app controlla `version.json` all'avvio,
quando torna in primo piano e ogni 5 minuti: se la versione pubblicata è diversa da
quella in esecuzione compare la barra **"Nuova versione disponibile → Aggiorna"**,
che ricarica la pagina con un parametro anti-cache. La versione in esecuzione è
scritta in fondo a ogni schermata.

Quando si pubblica una modifica vanno aggiornati insieme `APP_VERSION` in
`index.html` e `version.json` (stesso valore, più una nota breve di cosa è cambiato).

## Installarla sul telefono

L'app è pubblicabile su **GitHub Pages** (Settings → Pages → Source: Deploy from a branch → seleziona il branch, cartella `/root`).
L'indirizzo diventa `https://<utente>.github.io/Cialtron-App/`.

Sull'iPhone: apri il link in **Safari** → tasto Condividi → **Aggiungi a Home**.
Parte a schermo intero con la sua icona, senza barra del browser (manifest + meta `apple-mobile-web-app-*` inclusi).
Su Android: Chrome → menu → Installa app.

## Stack tecnico

| Cosa | Come |
|---|---|
| UI | React 18 da CDN, JSX compilato a runtime da Babel standalone |
| Sync | Firebase Realtime Database via REST (`fetch` su `*.json`), nessun SDK |
| Import Excel | XLSX.js |
| Font | Bebas Neue + DM Sans (Google Fonts) |
| Persistenza locale | `localStorage`: URL del database (`cia-db-url`) e cache delle foto (`cia-photo-<id>`, `cia-photorev-<id>`) |

## Modello dati (nodo radice Firebase)

```
adminPin        "1234"
players         [ { id, name, photoRev, base:{presences,wins,goals,mvps} } ]
photos          { <playerId>: "data:image/jpeg;base64,…" }
matches         [ { id, date, white:[id], black:[id], winner:"white"|"black", mvp, goals:{id:n} } ]
teamSelection   { phase:"idle"|"picking"|"captain"|"done", assign:{id:"white"|"black"},
                  captainSide, finalWhite:[id], finalBlack:[id] }
```

Le statistiche **non** sono memorizzate: `computeStats()` le ricalcola dalle partite a ogni render e
ci somma `base`, cioè la parte manuale (storico importato da Excel o correzione fatta con ✏️).
Le partite registrate dopo continuano quindi ad aggiornare i totali.

Le foto stanno nel nodo `photos`, fuori da `players`: il polling ogni 3 secondi legge solo
`players`, `matches` e `teamSelection`, e una foto viene riscaricata solo quando il suo
`photoRev` cambia. Sul dispositivo resta in cache in `localStorage`.

## Funzionalità

* **Classifica** — ordinata per media (punti ÷ presenze), 3 punti per vittoria, badge CAP (1º) e PICK (ultimo), correzione manuale delle stat con ✏️ (solo admin). Layout compatto sotto i 460 px, tabellare sopra
* **Partite** — flusso in 3 step: squadre → vincitore → MVP e gol; storico cancellabile con conferma
* **Selezione squadre** — il Picker (ultimo in classifica) forma le squadre, invia la proposta al Capitano (primo) che sceglie il lato; sincronizzata per tutti via polling Firebase ogni 3 s
* **Rosa** — foto caricabile dal telefono (ritagliata a 160 px, JPEG 65 %), nome modificabile, 5 statistiche calcolate automaticamente
* **Import Excel** — colonne `Nome · Presenze · Vittorie · Gol · MVP` (accetta anche Giocatore/Partite/Vinte/Reti); anteprima prima di confermare, aggiorna gli esistenti e aggiunge i nuovi
* **Admin PIN** — solo chi conosce il PIN (salvato su Firebase) modifica i dati; gli altri vedono tutto e partecipano alla selezione squadre
* **Setup guidato** — al primo avvio chiede l'URL Firebase; se il database contiene già un gruppo ci si entra come ospiti senza toccare i dati, se è vuoto si sceglie il PIN admin

## Setup del database

1. [console.firebase.google.com](https://console.firebase.google.com) → nuovo progetto
2. Realtime Database → Crea database → modalità test
3. Copia l'URL (`https://xxx-default-rtdb.firebaseio.com`) e incollalo al primo avvio dell'app
4. Scegli il PIN admin

> Le regole "modalità test" scadono dopo 30 giorni. Per non perdere l'accesso, in
> Firebase → Realtime Database → Regole imposta `{"rules":{".read":true,".write":true}}`.

Il PIN admin è leggibile da chiunque conosca l'URL del database: è un freno tra amici,
non una misura di sicurezza.

## Aperto

* **Identità del dispositivo** — nella selezione squadre chiunque può agire da Picker o da Capitano
* **Scritture concorrenti** — ogni salvataggio riscrive l'intero nodo: se due admin modificano insieme, vince l'ultimo
