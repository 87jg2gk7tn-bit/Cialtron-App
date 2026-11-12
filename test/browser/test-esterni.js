/* Prova: esterni con nome e stelle; esterni e visitatori fuori dall'MVP. */
const {chromium}=require('playwright');
const URL_="http://localhost:8902/test.html";
let ok=[],ko=[];
const check=(n,v,x="")=>{(v?ok:ko).push(n);console.log((v?"  ✓ ":"  ✗ ")+n+(v?"":"  →  "+String(x).replace(/\n/g," | ").slice(0,260)));};

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                                 proxy:{server:'http://127.0.0.1:1',bypass:'localhost,127.0.0.1'}});
  const ctx=await b.newContext({viewport:{width:390,height:900}});
  await ctx.addInitScript({path:__dirname+"/fakesupa.js"});
  const p=await ctx.newPage();
  const errs=[];p.on("pageerror",e=>{errs.push(String(e));console.log(">>> "+(e.stack||String(e)).split("\n").slice(0,4).join("\n"));});
  const w=(ms=500)=>p.waitForTimeout(ms);
  const db=()=>p.evaluate(()=>window.__fakedb());
  const tab=async n=>{await p.locator("nav button").filter({hasText:n}).click();await w(500);};
  const T=async()=>(await p.locator("main").innerText());
  const stelle=async n=>{await p.locator("main button",{hasText:/^[★☆]$/}).nth(n-1).click();await w(150);};

  await p.goto(URL_,{waitUntil:"networkidle"}); await w(1200);
  await p.getByPlaceholder("tu@esempio.it").fill("mera@test.it");
  await p.getByPlaceholder("••••••").fill("segreta1");
  await p.getByText("Crea account").click(); await w(900);
  await p.getByPlaceholder("Calcetto del giovedì").fill("Cialtrona Cup");
  await p.getByText("Crea",{exact:true}).click(); await w(900);
  await p.getByText("Non ci sono · aggiungimi").click(); await w(300);
  await p.getByPlaceholder("Come ti chiami?").fill("Mera");
  await p.getByText("Conferma").click(); await w(900);
  await tab("ROSA");
  for(const n of ["Perro","Luca","Ale"]){
    await p.getByText("＋ Aggiungi giocatore").click();
    await p.getByPlaceholder("Nome giocatore…").fill(n);
    await p.getByText("Aggiungi",{exact:true}).click(); await w(450);
  }
  await p.getByText("＋ Aggiungi giocatore").click();
  await p.getByPlaceholder("Nome giocatore…").fill("Gianni");
  await p.locator("main label",{hasText:"Visitatore"}).first().locator("input").check(); await w(200);
  await p.getByText("Aggiungi",{exact:true}).click(); await w(600);

  console.log("\n— AGGIUNGERE UN ESTERNO: NOME E STELLE —");
  await tab("SQUADRE");
  await p.locator("main button",{hasText:"＋ Aggiungi un esterno"}).first().click(); await w(400);
  let t=await T();
  check("si apre il modulo dell'esterno", /NUOVO ESTERNO/.test(t)&&/Quanto è forte/.test(t), t.slice(t.indexOf("CHI GIOCA"),t.indexOf("CHI GIOCA")+500));
  const salva=p.locator("main button",{hasText:/^(Salva|Scegli le stelle)$/}).first();
  check("senza stelle non si salva", await salva.isDisabled(), await salva.innerText());
  await p.getByPlaceholder("Nome (facoltativo)").fill("Marco");
  await stelle(4);
  check("con le stelle sì", !(await salva.isDisabled()), await salva.innerText());
  await salva.click(); await w(800);
  let sel=(await db()).selections[0].state;
  check("l'esterno è salvato con nome e stelle", sel.ext===1&&sel.extInfo&&sel.extInfo.ext1&&sel.extInfo.ext1.name==="Marco"&&sel.extInfo.ext1.stars===4, JSON.stringify({ext:sel.ext,info:sel.extInfo}));
  t=await T();
  check("e si vede col nome e le stelle", /Marco\s*★★★★☆/.test(t), t.slice(t.indexOf("CHI GIOCA"),t.indexOf("CHI GIOCA")+500));

  // un secondo esterno solo con le stelle: il nome è facoltativo
  await p.locator("main button",{hasText:"＋ Aggiungi un esterno"}).first().click(); await w(300);
  await stelle(2);
  await p.locator("main button",{hasText:/^Salva$/}).first().click(); await w(800);
  t=await T();
  check("senza nome si chiama 'Esterno 2'", /Esterno 2\s*★★☆☆☆/.test(t), t.slice(t.indexOf("CHI GIOCA"),t.indexOf("CHI GIOCA")+600));

  console.log("\n— CORREGGERE UN ESTERNO —");
  await p.locator("main button[aria-label='Correggi Esterno 2']").click(); await w(300);
  await p.getByPlaceholder("Nome (facoltativo)").fill("Dario");
  await stelle(3);
  await p.locator("main button",{hasText:/^Salva$/}).first().click(); await w(800);
  sel=(await db()).selections[0].state;
  check("nome e stelle si correggono", sel.extInfo.ext2.name==="Dario"&&sel.extInfo.ext2.stars===3, JSON.stringify(sel.extInfo));
  check("e non si aggiunge un terzo esterno", sel.ext===2, sel.ext);

  console.log("\n— IN SELEZIONE SI VEDONO LE STELLE —");
  await p.getByText("METODO CAVA").click(); await w(900);
  t=await T();
  check("chi fa le squadre vede Marco con le sue stelle", /Marco\s*★★★★☆/.test(t), t.slice(0,900));
  check("e Dario con le sue", /Dario\s*★★★☆☆/.test(t), t.slice(0,900));
  const bi=p.locator("main button",{hasText:"⬜"}), ne=p.locator("main button",{hasText:"⬛"});
  const n=await bi.count();
  for(let i=0;i<n;i++){ if(i%2===0)await bi.nth(i).click(); else await ne.nth(i).click(); await w(220); }
  await p.getByText(/Invia a |scegli il lato/).first().click(); await w(900);
  const lato=p.locator("main button",{hasText:"⬜ BIANCHI"});
  if(await lato.count())await lato.last().click();
  await w(1000);
  t=await T();
  check("a squadre fatte le stelle restano", /Marco[^\n]*★/.test(t)&&/Dario[^\n]*★/.test(t), t.slice(0,900));

  console.log("\n— ELIMINARE UN ESTERNO DALLA MODIFICA —");
  await p.locator("main button",{hasText:"Sposta, togli o aggiungi giocatori"}).click(); await w(500);
  await p.locator("main button",{hasText:"＋ Aggiungi un esterno"}).first().click(); await w(300);
  await p.getByPlaceholder("Nome (facoltativo)").fill("Ezio");
  await stelle(1);
  await p.locator("main button",{hasText:/^Salva$/}).first().click(); await w(800);
  sel=(await db()).selections[0].state;
  check("aggiungo Ezio a squadre fatte", (sel.extList||[]).length===3&&sel.extInfo.ext3&&sel.extInfo.ext3.name==="Ezio", JSON.stringify({l:sel.extList,i:sel.extInfo}));
  // dalla matita: nel modulo c'è il tasto per eliminarlo
  await p.locator("main button[aria-label='Correggi Ezio']").click(); await w(300);
  check("nel modulo di correzione c'è 'Elimina questo esterno'", await p.locator("main button",{hasText:"Elimina questo esterno"}).count()===1, "");
  await p.locator("main button",{hasText:"Elimina questo esterno"}).click(); await w(900);
  sel=(await db()).selections[0].state;
  const inSq=(sel.finalWhite||[]).concat(sel.finalBlack||[]);
  check("Ezio sparisce dall'elenco degli esterni", JSON.stringify(sel.extList)===JSON.stringify(["ext1","ext2"]), JSON.stringify(sel.extList));
  check("e dalle squadre", inSq.indexOf("ext3")<0, JSON.stringify(inSq));
  check("e dalle stelle salvate", !sel.extInfo.ext3, JSON.stringify(sel.extInfo));
  check("e dalla pagina", !/Ezio/.test(await T()), "");
  // dalla riga in squadra: il cestino lo elimina subito
  check("sulla riga dell'esterno c'è il cestino, non la ✕", await p.locator("main button[aria-label='Elimina Dario']").count()===1, "");
  await p.locator("main button[aria-label='Elimina Dario']").click(); await w(900);
  sel=(await db()).selections[0].state;
  const inSq2=(sel.finalWhite||[]).concat(sel.finalBlack||[]);
  check("il cestino toglie Dario da tutto", JSON.stringify(sel.extList)===JSON.stringify(["ext1"])&&inSq2.indexOf("ext2")<0&&!sel.extInfo.ext2, JSON.stringify({l:sel.extList,sq:inSq2,i:sel.extInfo}));
  check("Marco invece resta com'era", sel.extInfo.ext1&&sel.extInfo.ext1.name==="Marco"&&inSq2.indexOf("ext1")>=0, JSON.stringify(sel.extInfo));
  const giocatoriPrima=inSq2.filter(x=>!/^ext/.test(x)).length;
  check("i giocatori della rosa non si toccano", giocatoriPrima===5, giocatoriPrima);
  // uno nuovo dopo l'eliminazione: un id libero, nessun doppione
  await p.locator("main button",{hasText:"＋ Aggiungi un esterno"}).first().click(); await w(300);
  await p.getByPlaceholder("Nome (facoltativo)").fill("Fabio");
  await stelle(2);
  await p.locator("main button",{hasText:/^Salva$/}).first().click(); await w(800);
  sel=(await db()).selections[0].state;
  const inSq3=(sel.finalWhite||[]).concat(sel.finalBlack||[]);
  check("un esterno nuovo prende un posto libero, senza doppioni",
        new Set(sel.extList).size===sel.extList.length&&sel.extList.length===2&&inSq3.filter(x=>/^ext/.test(x)).length===2,
        JSON.stringify({l:sel.extList,sq:inSq3}));
  check("e porta con sé il suo nome", Object.values(sel.extInfo).some(x=>x.name==="Fabio"), JSON.stringify(sel.extInfo));
  await p.locator("main button",{hasText:/^Fatto$/}).click(); await w(500);

  console.log("\n— DALLA SELEZIONE ALLA PARTITA —");
  await p.locator("main button",{hasText:"Registra la partita con queste squadre"}).click(); await w(900);
  t=await T();
  check("in registrazione gli esterni hanno il loro nome", /Marco/.test(t)&&/Fabio/.test(t)&&!/Dario|Ezio/.test(t), t.slice(0,700));
  // risultato e avanti
  const num=p.locator("main input[type=number]");
  await num.nth(0).fill("5"); await num.nth(1).fill("3"); await w(300);
  await p.locator("main button",{hasText:"Avanti →"}).first().click(); await w(600);
  t=await T();
  const opz=await p.locator("main select option").allInnerTexts();
  check("nell'MVP a mano non ci sono esterni né visitatori", opz.indexOf("Marco")<0&&opz.indexOf("Fabio")<0&&opz.indexOf("Gianni")<0&&opz.length>1, JSON.stringify(opz));
  check("ma fra i marcatori gli esterni ci sono, col nome", /Marco/.test(t)&&/Fabio/.test(t), t.slice(t.indexOf("Chi ha segnato"),t.indexOf("Chi ha segnato")+500));
  await p.locator("main button",{hasText:"Salva partita ✓"}).click(); await w(700);
  check("prima di salvare chiede se sei sicuro", /SEI SICURO\?/.test(await p.locator("body").innerText()), "");
  await p.getByRole("button",{name:"Sì, salva"}).click(); await w(1300);
  const m=((await db()).groups[0].data.matches||[])[0]||{};
  check("la partita salva nome e stelle degli esterni", m.ext&&m.ext.ext1&&m.ext.ext1.name==="Marco"&&m.ext.ext1.stars===4&&Object.values(m.ext).some(x=>x.name==="Fabio")&&Object.keys(m.ext).length===2, JSON.stringify(m.ext));
  t=await T();
  check("nello storico si legge 'Marco' con le stelle, non 'Esterno 1'", /Marco\s*★★★★☆/.test(t)&&!/Esterno 1/.test(t), t.slice(0,900));

  console.log("\n— VOTO MVP: ESTERNI E VISITATORI FUORI —");
  await tab("CLASSIFICA");
  await p.locator("main button",{hasText:"MVP"}).first().click(); await w(800);
  t=await T();
  const voto=t.slice(t.indexOf("VOTA L'MVP"),t.indexOf("Hanno votato"));
  check("c'è il voto della partita", /VOTA L'MVP/.test(t), t.slice(0,400));
  check("fra i votabili non c'è il visitatore", !/Gianni/.test(voto), voto.slice(0,700));
  check("né gli esterni", !/Marco|Fabio|Esterno/.test(voto.replace(/Esterni e visitatori/,"")), voto.slice(0,700));
  const opzVoto=await p.locator("main select").first().locator("option").allInnerTexts();
  check("nella tendina di chi vota non ci sono né visitatori né esterni", !opzVoto.some(x=>/Gianni|Marco|Fabio/.test(x)), JSON.stringify(opzVoto));
  check("l'app lo dice", /Esterni e visitatori non votano e non si votano/.test(t), voto.slice(0,300));
  const tot=t.match(/Hanno votato\s*(\d+)\s*su\s*(\d+)/);
  const giocanti=((m.white||[]).concat(m.black||[])).filter(id=>!/^ext/.test(id)).length-1; // meno Gianni
  check("il conteggio dei votanti non li conta", tot&&+tot[2]===giocanti, (tot&&tot[0])+" atteso su "+giocanti);

  console.log("\n— ESTERNO AGGIUNTO IN PARTITE, SENZA PASSARE DALLE SQUADRE —");
  await tab("PARTITE");
  await p.locator("main button",{hasText:"＋ Nuova partita"}).click(); await w(500);
  await p.locator("main button",{hasText:"＋ Aggiungi un esterno"}).click(); await w(300);
  check("anche qui senza stelle non si salva", await p.locator("main button",{hasText:"Scegli le stelle"}).isDisabled(), "");
  await p.getByPlaceholder("Nome (facoltativo)").fill("Ugo");
  await stelle(5);
  await p.locator("main button",{hasText:/^Salva$/}).first().click(); await w(500);
  t=await T();
  check("l'esterno entra fra chi si assegna, col nome e le stelle", /Ugo\s*★★★★★/.test(t), t.slice(0,700));
  await p.locator("main button",{hasText:"＋ Aggiungi un esterno"}).click(); await w(300);
  await p.getByPlaceholder("Nome (facoltativo)").fill("Vito");
  await stelle(3);
  await p.locator("main button",{hasText:/^Salva$/}).first().click(); await w(400);
  // Ugo nella squadra dei bianchi, poi lo elimino
  await p.evaluate(()=>{const r=[...document.querySelectorAll("main div")].find(d=>/^Ugo/.test((d.querySelector("span")||{}).textContent||"")&&d.querySelectorAll("button").length===2);
    r&&r.querySelectorAll("button")[0].click();}); await w(300);
  check("prima di eliminarlo Ugo è fra i bianchi (1 vs 0)", /·\s*1\s*vs\s*0/.test(await T()), (await T()).slice(0,200));
  await p.locator("main button[aria-label='Correggi Ugo']").click(); await w(300);
  await p.locator("main button",{hasText:"Elimina questo esterno"}).click(); await w(500);
  t=await T();
  check("in Partite Ugo si elimina", !/Ugo/.test(t)&&/Vito/.test(t), t.slice(0,800));
  check("e non resta contato fra i bianchi", /·\s*0\s*vs\s*0/.test(t), t.slice(0,200));
  await p.locator("main button",{hasText:"＋ Aggiungi un esterno"}).click(); await w(300);
  await p.getByPlaceholder("Nome (facoltativo)").fill("Zeno");
  await stelle(1);
  await p.locator("main button",{hasText:/^Salva$/}).first().click(); await w(400);
  t=await T();
  check("uno nuovo dopo l'eliminazione non pesta Vito", /Vito\s*★★★☆☆/.test(t)&&/Zeno\s*★☆☆☆☆/.test(t), t.slice(0,900));
  await p.locator("main button",{hasText:"Annulla"}).first().click(); await w(400);

  console.log("\n— ERRORI JS —");
  check("nessun errore in pagina", errs.length===0, errs.slice(0,2).join(" || "));
  await p.screenshot({path:__dirname+"/s-esterni.png",fullPage:true});
  console.log("\n==========================");
  console.log("PASSATI: "+ok.length+"   FALLITI: "+ko.length);
  if(ko.length)console.log("KO:\n - "+ko.join("\n - "));
  await b.close(); process.exit(ko.length?1:0);
})();
