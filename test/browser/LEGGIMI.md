# Prove nel browser

L'app gira in un browser vero contro un finto Supabase che vive dentro la
pagina (`fakesupa.js`): stessa forma di risposte, stesse regole, tutto in
memoria. Nessun database vero viene toccato.

## Come si lancia

    npm i playwright                     # una volta sola
    sh test/browser/mk-test.sh           # rigenera test.html da index.html
    cd test/browser && python3 -m http.server 8902 --bind 127.0.0.1 &
    node test-voto-altri.js

`mk-test.sh` va rilanciato **a ogni modifica di index.html**: se te lo
dimentichi stai provando la versione di prima e non te ne accorgi.

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
- `shot-voto.js`, `shot-visitatore.js`, `shot-esterni.js` — fanno la foto della pagina, per guardarla davvero.
