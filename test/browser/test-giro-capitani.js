/* Prova: capitano e formatore si leggono dalle partite registrate.
   Conto in classifica, giro con numero e inizio, niente segni da una prova. */
const {chromium}=require('playwright');
const URL_="http://localhost:8902/test.html";
let ok=[],ko=[];
const check=(n,v,x="")=>{(v?ok:ko).push(n);console.log((v?"  ✓ ":"  ✗ ")+n+(v?"":"  →  "+String(x).replace(/\n/g," | ").slice(0,260)));};

(async()=>{
  const b=await chromium.launch({executablePath:require('./chrome')(),
                                 proxy:{server:'http://127.0.0.1:1',bypass:'localhost,127.0.0.1'}});
  const ctx=await b.newContext({viewport:{width:390,height:900}});
  await ctx.addInitScript({path:__dirname+"/fakesupa.js"});
  const p=await ctx.newPage();
  const errs=[];p.on("pageerror",e=>{errs.push(String(e));console.log(">>> "+(e.stack||String(e)).split("\n").slice(0,4).join("\n"));});
  const w=(ms=500)=>p.waitForTimeout(ms);
  const db=()=>p.evaluate(()=>window.__fakedb());
  const tab=async n=>{await p.locator("nav button").filter({hasText:n}).click();await w(500);};
  const T=async()=>(await p.locator("main").innerText());
  const ruoli=async()=>{const t=await T();const i=t.indexOf("🏆 CAPITANO");return t.slice(i,i+200).replace(/\n/g," | ");};
  const id=n=>p.evaluate(n=>(window.__fakedb().groups[0].data.players.find(x=>x.name===n)||{}).id,n);
  const nome=i=>p.evaluate(i=>(window.__fakedb().groups[0].data.players.find(x=>x.id===i)||{}).name,i);
  const capiDi=async n=>p.evaluate(n=>{
    const r=[...document.querySelectorAll("main div")].filter(d=>/🎖️\s*\d+/.test(d.innerText)&&d.innerText.split("\n").some(l=>l.trim()===n));
    r.sort((a,b)=>a.innerText.length-b.innerText.length);
    const m=r[0]&&r[0].innerText.match(/🎖️\s*(\d+)/); return m?+m[1]:null;},n);
  const sett=async()=>(await db()).board[0].settings||{};
  const giroCard=async()=>{const t=await T();const i=t.indexOf("GIRO DEI CAPITANI");return i<0?"(nessuna scheda del giro)":t.slice(i,i+420);};
  /* dopo una partita in Squadre restano le squadre fatte: per la prossima
     si riparte da capo, ed è lì che si vede il giro */
  const daCapo=async()=>{
    await tab("SQUADRE");
    const r=p.locator("main button",{hasText:"Rifai da capo la selezione"});
    if(await r.count()){await r.click();await w(900);}
  };

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
  for(const n of ["Perro","Luca","Ale","Fo","Gianni"]){
    await p.getByText("＋ Aggiungi giocatore").click();
    await p.getByPlaceholder("Nome giocatore…").fill(n);
    await p.getByText("Aggiungi",{exact:true}).click(); await w(450);
  }
  // classifica: Perro primo, Fo ultimo
  await p.evaluate(()=>{
    const d=window.__fakedb(), g=d.groups[0];
    const base={Perro:[10,9,5],Mera:[10,7,3],Gianni:[10,6,2],Ale:[10,5,4],Luca:[10,3,2],Fo:[10,1,1]};
    g.data=Object.assign({},g.data,{players:g.data.players.map(x=>base[x.name]
      ?Object.assign({},x,{base:{presences:base[x.name][0],wins:base[x.name][1],goals:base[x.name][2],mvps:0}}):x)});
    window.__asOther("groups",{id:g.id},{data:g.data});
  }); await w(800);

  const faiSquadre=async()=>{
    await p.getByText("METODO CAVA").click(); await w(900);
    const bi=p.locator("main button",{hasText:"⬜"}), ne=p.locator("main button",{hasText:"⬛"});
    const n=await bi.count();
    for(let i=0;i<n;i++){ if(i%2===0)await bi.nth(i).click(); else await ne.nth(i).click(); await w(220); }
    await p.getByText(/Invia a |scegli il lato/).first().click(); await w(900);
    const lato=p.locator("main button",{hasText:"⬜ BIANCHI"});
    if(await lato.count())await lato.last().click();
    await w(1000);
  };

  console.log("\n— UNA SELEZIONE DI PROVA NON SEGNA NESSUNO —");
  await tab("SQUADRE");
  check("formatore il primo (Perro), capitano l'ultimo (Fo)", /CAPITANO[\s\S]{0,40}Fo/.test(await T())&&/FORMATORE[\s\S]{0,40}Perro/.test(await T()), await ruoli());
  let g=await giroCard();
  check("il giro ha un numero", /N° 1/.test(g), g);
  check("e dice quanti l'hanno fatto: 0 su 6", /Fatto da\s*0 su 6/.test(g), g);
  check("e quante partite mancano più o meno: 3", /mancano 6, circa\s*3\s*partite/.test(g), g);
  await faiSquadre();
  check("finita la selezione nessuno viene segnato 'già fatto'", ((await sett()).giroFatti||[]).length===0, JSON.stringify((await sett()).giroFatti));
  await p.locator("main button",{hasText:"Rifai da capo la selezione"}).click(); await w(900);
  check("rifatta da capo, propone gli stessi due: non hanno ancora giocato da capitani", /CAPITANO[\s\S]{0,40}Fo/.test(await T())&&/FORMATORE[\s\S]{0,40}Perro/.test(await T()), await ruoli());

  console.log("\n— LA PARTITA REGISTRATA SI PORTA DIETRO I RUOLI —");
  await faiSquadre();
  await p.locator("main button",{hasText:"Registra la partita con queste squadre"}).click(); await w(900);
  const num=p.locator("main input[type=number]");
  await num.nth(0).fill("5"); await num.nth(1).fill("3"); await w(300);
  await p.locator("main button",{hasText:"Avanti →"}).first().click(); await w(600);
  let t=await T();
  check("nel passo finale c'è 'Formatore e capitano'", /Formatore e capitano/.test(t), t.slice(0,500));
  const sel=p.locator("main select");
  check("il formatore arriva dalla selezione: Perro", await nome(await sel.nth(0).inputValue())==="Perro", await sel.nth(0).inputValue());
  check("il capitano anche: Fo", await nome(await sel.nth(1).inputValue())==="Fo", await sel.nth(1).inputValue());
  await p.locator("main button",{hasText:"Salva partita ✓"}).click(); await w(600);
  check("il 'sei sicuro?' li mostra", /Formatore: Perro · Capitano: Fo/.test(await p.locator("body").innerText()), "");
  await p.getByRole("button",{name:"Sì, salva"}).click(); await w(1300);
  let m=((await db()).groups[0].data.matches||[])[0]||{};
  check("la partita salva formatore e capitano", m.formatore===await id("Perro")&&m.capitano===await id("Fo"), JSON.stringify({f:m.formatore,c:m.capitano}));
  check("e nello storico si leggono", /Formatore\s*Perro\s*·\s*Capitano\s*Fo/.test(await T()), (await T()).slice(0,600));

  console.log("\n— IN CLASSIFICA: QUANTE VOLTE —");
  await tab("CLASSIFICA"); t=await T();
  check("c'è la spiegazione del 🎖️", /quante volte ha fatto il formatore o il capitano/.test(t), t.slice(0,400));
  check("Perro 🎖️ 1", await capiDi("Perro")===1, await capiDi("Perro"));
  check("Fo 🎖️ 1", await capiDi("Fo")===1, await capiDi("Fo"));
  check("Luca 🎖️ 0", await capiDi("Luca")===0, await capiDi("Luca"));

  console.log("\n— IL GIRO SI MUOVE CON LE PARTITE —");
  await daCapo();
  g=await giroCard();
  check("fatto da 2 su 6", /Fatto da\s*2 su 6/.test(g), g);
  check("1 partita giocata in questo giro", /1\s*partita giocata/.test(g), g);
  check("Perro e Fo non sono più proposti", !/CAPITANO[\s\S]{0,40}(Fo|Perro)/.test(await T())&&!/FORMATORE[\s\S]{0,40}(Fo|Perro)/.test(await T()), await ruoli());
  await p.locator("main button",{hasText:"Sistema"}).first().click(); await w(400);
  t=await T();
  check("nel pannello chi l'ha fatto in partita ha la data", /Perro[\s\S]{0,10}fatto · partita del/.test(t), t.slice(t.indexOf("Chi ha fatto"),t.indexOf("Chi ha fatto")+600));
  const rigaPerro=p.locator("main button").filter({hasText:"fatto · partita del"}).first();
  check("e non si può togliere da qui (si corregge nella partita)", await rigaPerro.isDisabled(), "");
  await p.locator("main button").filter({hasText:/^A\s*Ale\s*—$|Ale\s*—/}).first().click(); await w(700);
  check("a mano si segna chi l'ha fatto fuori dall'app", ((await sett()).giroFatti||[]).indexOf(await id("Ale"))>=0, JSON.stringify((await sett()).giroFatti));
  check("e si vede come 'già fatto (a mano)'", /Ale[\s\S]{0,10}già fatto \(a mano\)/.test(await T()), "");
  await p.locator("main button",{hasText:"Chiudi"}).first().click(); await w(400);

  console.log("\n— CORREGGERE I RUOLI DI UNA PARTITA —");
  await tab("PARTITE");
  await p.locator("main button[title='Correggi risultato, gol o MVP']").first().click(); await w(600);
  await p.locator("main button",{hasText:"Avanti →"}).first().click(); await w(600);
  await p.locator("main select").nth(1).selectOption({label:"Luca"}); await w(200);
  await p.locator("main button",{hasText:"Aggiorna la partita ✓"}).click(); await w(500);
  await p.getByRole("button",{name:"Sì, aggiorna"}).click(); await w(1300);
  m=((await db()).groups[0].data.matches||[])[0]||{};
  check("il capitano della partita ora è Luca", m.capitano===await id("Luca"), JSON.stringify({c:m.capitano}));
  await tab("CLASSIFICA");
  check("e la classifica si rifà: Luca 1, Fo 0", await capiDi("Luca")===1&&await capiDi("Fo")===0, [await capiDi("Luca"),await capiDi("Fo")].join(","));

  console.log("\n— UN SOLO LIBERO FRA I PRESENTI: TOCCA A LUI —");
  // tutti segnati tranne Gianni (a mano): resta lui solo
  await p.evaluate(async ids=>{
    const d=window.__fakedb(), b=d.board[0];
    window.__asOther("board",{group_id:b.group_id},{settings:Object.assign({},b.settings,{giroFatti:ids})});
  },[await id("Mera"),await id("Ale"),await id("Fo")]); await w(900);
  await daCapo();
  g=await giroCard();
  check("manca solo Gianni", /Fatto da\s*5 su 6/.test(g)&&/Mancano:\s*Gianni/.test(g), g);
  t=await T();
  check("e Gianni ha un ruolo, non viene saltato", /(CAPITANO|FORMATORE)[\s\S]{0,40}Gianni/.test(t), await ruoli());

  console.log("\n— CHIUSO IL GIRO, NE PARTE UNO NUOVO —");
  await faiSquadre();
  await p.locator("main button",{hasText:"Registra la partita con queste squadre"}).click(); await w(900);
  await num.nth(0).fill("4"); await num.nth(1).fill("2"); await w(300);
  await p.locator("main button",{hasText:"Avanti →"}).first().click(); await w(600);
  await p.locator("main button",{hasText:"Salva partita ✓"}).click(); await w(500);
  await p.getByRole("button",{name:"Sì, salva"}).click(); await w(1500);
  const s2=await sett();
  check("fatto anche Gianni, si apre il giro n. 2", +s2.giroNumero===2, JSON.stringify(s2));
  check("con la data d'inizio", !!s2.giroInizio, JSON.stringify(s2.giroInizio));
  check("e la lista a mano azzerata", (s2.giroFatti||[]).length===0, JSON.stringify(s2.giroFatti));
  await daCapo();
  g=await giroCard();
  check("la scheda dice N° 2 e 0 partite", /N° 2/.test(g)&&/0\s*partite giocate/.test(g)&&/Fatto da\s*0 su 6/.test(g), g);
  check("e dice quando è iniziato", /Iniziato\s*\S+\s*\d+\s*\S+/.test(g), g);
  check("si riparte dal primo e dall'ultimo", /FORMATORE[\s\S]{0,40}Perro/.test(await T()), await ruoli());
  await tab("CLASSIFICA");
  check("e il conto in classifica resta di tutte le partite", (await capiDi("Perro"))+(await capiDi("Gianni"))+(await capiDi("Luca"))>=3, [await capiDi("Perro"),await capiDi("Gianni"),await capiDi("Luca")].join(","));

  console.log("\n— RICOMINCIA A MANO —");
  await daCapo();
  await p.locator("main button",{hasText:"Sistema"}).first().click(); await w(400);
  await p.locator("main button",{hasText:"Ricomincia il giro"}).click(); await w(800);
  check("Ricomincia apre il giro n. 3", +(await sett()).giroNumero===3, JSON.stringify(await sett()));

  console.log("\n— ERRORI JS —");
  check("nessun errore in pagina", errs.length===0, errs.slice(0,2).join(" || "));
  await p.locator("main button",{hasText:"Chiudi"}).first().click(); await w(300);
  await tab("CLASSIFICA");
  await p.screenshot({path:__dirname+"/s-giro-capitani.png",fullPage:true});
  console.log("\n==========================");
  console.log("PASSATI: "+ok.length+"   FALLITI: "+ko.length);
  if(ko.length)console.log("KO:\n - "+ko.join("\n - "));
  await b.close(); process.exit(ko.length?1:0);
})();
