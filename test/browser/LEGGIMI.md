# Prove nel browser

L'app gira in un browser vero contro un finto Supabase che vive dentro la
pagina (`fakesupa.js`): stessa forma di risposte, stesse regole, tutto in
memoria. Nessun database vero viene toccato.

## Come si lancia

    cd test/browser
    npm i                                # una volta per container: Babel 7.24.7 e Playwright
    node check-sintassi.js               # il JSX compila? (stesso Babel della CDN)
    sh ../../test/browser/mk-test.sh     # dalla radice del repo: rigenera test.html
    python3 -m http.server 8902 --bind 127.0.0.1 &
    node test-giro-capitani.js           # e le altre test-*.js

`mk-test.sh` si lancia dalla radice del repo e va rilanciato **a ogni
modifica di index.html**: se te lo dimentichi stai provando la versione di
prima e non te ne accorgi.

Chromium lo trova `chrome.js` fra quelli preinstallati (la versione cambia
da un container all'altro); per usarne un altro: `CHROME=/percorso node …`.

## Perché le librerie stanno qui dentro

`vendor/` tiene React, Babel e XLSX alle stesse versioni che l'app carica
da cdnjs. Stanno nel repo perché la rete delle sessioni di sviluppo non
sempre arriva alla CDN, e senza di loro le prove non partono. **La
versione di Babel dev'essere la 7.24.7**, come quella della CDN: dalla 8
in poi il JSX viene compilato col runtime automatico e la pagina non
parte più.

## Cosa c'è

- `fakesupa.js` — il finto database. Espone `window.__fakedb()`,
  `__setdb()`, `__loginAs()`, `__asOther()` (una scrittura "da un altro
  telefono", che sveglia anche il tempo reale).
- `test-voto-altri.js` — il voto MVP registrato per conto di un altro.
- `test-visitatore.js` — il visitatore gioca ma resta fuori da classifica e giro.
- `test-esterni.js` — esterni con nome e stelle; esterni e visitatori fuori dall'MVP.
- `test-esterni-chiamata.js` — eliminare un esterno a chiamata in corso.
- `test-giro-capitani.js` — il giro conta le volte: tocca a chi l'ha fatto
  meno, chi resta fuori non blocca il giro e quando torna tocca a lui; la
  scelta a mano non scavalca il turno; Sistema in Partite (conto, volta a
  mano, correzione di una partita, azzera con conferma).
- `test-storico-capitani.js` — ricostruire i ruoli delle partite vecchie
  nella sezione Partite → Formatori e capitani.
- `test-coppia-ripetuta.js` — il caso segnalato: la stessa coppia due volte di
  fila per colpa dei vecchi segni; il perché in Squadre; i ruoli che arrivano
  dalla selezione anche registrando a mano, e l'avviso se mancano.
- `shot-voto.js`, `shot-visitatore.js`, `shot-esterni.js` — fanno la foto della pagina, per guardarla davvero.
