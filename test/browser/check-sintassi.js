/* Compila il JSX di index.html con lo stesso Babel della CDN (7.24.7):
   se c'è un errore di sintassi lo dice qui, prima di aprire il browser. */
const fs=require('fs'), path=require('path'), babel=require('@babel/standalone');
const src=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
const re=/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g;
let m,n=0;
while((m=re.exec(src))){
  n++;
  const riga=src.slice(0,m.index).split("\n").length;
  try{ babel.transform(m[1],{presets:["react"]}); console.log("blocco "+n+" (riga "+riga+"): ok"); }
  catch(e){ console.log("blocco "+n+" (riga "+riga+"): ERRORE\n  "+e.message); process.exitCode=1; }
}
if(!n){console.log("nessun blocco babel trovato"); process.exitCode=1;}
