/* Prova: ricostruire capitano e formatore delle partite vecchie dallo storico. */
const {chromium}=require('playwright');
const URL_="http://localhost:8902/test.html";
let ok=[],ko=[];
const check=(n,v,x="")=>{(v?ok:ko).push(n);console.log((v?"  ✓ ":"  ✗ ")+n+(v?"":"  →  "+String(x).replace(/\n/g," | ").slice(0,300)));};

(async()=>{
  const b=await chromium.launch({executablePath:require('./chrome')(),proxy:{server:'http://127.0.0.1:1',bypass:'localhost,127.0.0.1'}});
  const ctx=await b.newContext({viewport:{width:390,height:900}});
  await ctx.addInitScript({path:__dirname+"/fakesupa.js"});
  const p=await ctx.newPage();
  const errs=[];p.on("pageerror",e=>{errs.push(String(e));console.log(">>> "+(e.stack||String(e)).split("\n").slice(0,4).join("\n"));});
  const w=(ms=500)=>p.waitForTimeout(ms);
  const db=()=>p.evaluate(()=>window.__fakedb());
  const tab=async n=>{await p.locator("nav button").filter({hasText:n}).click();await w(500);};
  const T=async()=>(await p.locator("main").innerText());
  const capiDi=async n=>p.evaluate(n=>{
    const r=[...document.querySelectorAll("main div")].filter(d=>/🎖️\s*\d+/.test(d.innerText)&&d.innerText.split("\n").some(l=>l.trim()===n));
    r.sort((a,b)=>a.innerText.length-b.innerText.length);
    const m=r[0]&&r[0].innerText.match(/🎖️\s*(\d+)/); return m?+m[1]:null;},n);

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
  for(const n of ["Fo","Bisseck","Perro","Luca","Ale","Cerio"]){
    await p.getByText("＋ Aggiungi giocatore").click();
    await p.getByPlaceholder("Nome giocatore…").fill(n);
    await p.getByText("Aggiungi",{exact:true}).click(); await w(450);
  }

  /* Lo storico com'era prima: partite senza ruoli, e la lista del giro
     scritta dall'app (coppie capitano, formatore) più un segno di prova. */
  const I=await p.evaluate(()=>{
    const d=window.__fakedb(), g=d.groups[0];
    const id={}; g.data.players.forEach(x=>id[x.name]=x.id);
    const base={Mera:[3,3,2],Perro:[3,2,3],Cerio:[3,2,1],Bisseck:[3,1,1],Fo:[3,1,0],Ale:[3,1,2],Luca:[3,0,1]};
    const players=g.data.players.map(x=>Object.assign({},x,{base:{presences:base[x.name][0],wins:base[x.name][1],goals:base[x.name][2],mvps:0}}));
    const matches=[
      // 1ª partita: squadre fatte a mano, capitani decisi a voce (Fo e Bisseck)
      {id:"m1",date:"2026-10-01T20:00:00Z",white:[id.Ale,id.Fo,id.Perro,id.Mera],black:[id.Luca,id.Bisseck,id.Cerio],winner:"white",scoreWhite:5,scoreBlack:3,goals:{}},
      // 2ª: squadre fatte con l'app, il capitano Perro ha scelto i bianchi
      {id:"m2",date:"2026-10-08T20:00:00Z",white:[id.Perro,id.Ale,id.Fo],black:[id.Cerio,id.Mera,id.Luca,id.Bisseck],winner:"black",scoreWhite:2,scoreBlack:4,goals:{}},
      // 3ª: squadre con l'app, il capitano Mera ha scelto i neri
      {id:"m3",date:"2026-10-15T20:00:00Z",white:[id.Luca,id.Perro,id.Bisseck],black:[id.Mera,id.Ale,id.Cerio,id.Fo],winner:"black",scoreWhite:1,scoreBlack:6,goals:{}}
    ];
    g.data=Object.assign({},g.data,{players,matches});
    window.__asOther("groups",{id:g.id},{data:g.data});
    const bd=d.board[0];
    // Fo e Bisseck segnati a mano; Ale da una prova; poi le coppie (capitano, formatore)
    window.__asOther("board",{group_id:bd.group_id},{settings:Object.assign({},bd.settings,
      {giroFatti:[id.Fo,id.Bisseck,id.Ale,id.Perro,id.Cerio,id.Mera,id.Luca]})});
    return id;
  }); await w(900);

  console.log("\n— LA SCHEDA IN PARTITE —");
  await tab("PARTITE");
  let t=await T();
  check("in Partite c'è la scheda delle partite vecchie", /CAPITANI DELLE PARTITE VECCHIE/.test(t), t.slice(0,500));
  check("dice quante sono senza ruoli: 3", /3 partite/.test(t), t.slice(0,500));
  await p.locator("main button",{hasText:"Ricostruisci dallo storico"}).click(); await w(600);
  t=await T();
  const sel=(k,d)=>p.locator(`main select[aria-label='${k} del ${d}']`);
  const v=async(k,d)=>{const x=await sel(k,d).inputValue();return Object.keys(I).find(n=>I[n]===x)||"";};

  console.log("\n— LE PROPOSTE —");
  check("2ª partita: formatore Cerio", await v("Formatore","2026-10-08T20:00:00Z")==="Cerio", await v("Formatore","2026-10-08T20:00:00Z"));
  check("2ª partita: capitano Perro", await v("Capitano","2026-10-08T20:00:00Z")==="Perro", await v("Capitano","2026-10-08T20:00:00Z"));
  check("e dice da dove viene (squadre dell'app, confermate dalla lista)", /probabile: squadre fatte con l'app, e la lista del giro lo conferma/.test(t), t.slice(0,900));
  check("3ª partita, coppia al contrario nella lista: capitano Mera", await v("Capitano","2026-10-15T20:00:00Z")==="Mera", await v("Capitano","2026-10-15T20:00:00Z"));
  check("3ª partita: formatore Luca", await v("Formatore","2026-10-15T20:00:00Z")==="Luca", await v("Formatore","2026-10-15T20:00:00Z"));
  check("1ª partita (fatta a mano): nessuna proposta inventata", await v("Formatore","2026-10-01T20:00:00Z")===""&&await v("Capitano","2026-10-01T20:00:00Z")==="", "");
  check("e lo dice, con l'indizio dei primi in squadra", /la lista del giro non lo conferma: sceglili tu/.test(t)&&/primi in squadra: Ale e Luca/.test(t), t.slice(0,1200));

  console.log("\n— LA SISTEMO E SALVO —");
  await sel("Formatore","2026-10-01T20:00:00Z").selectOption({label:"Fo"}); await w(200);
  await sel("Capitano","2026-10-01T20:00:00Z").selectOption({label:"Bisseck"}); await w(300);
  t=await T();
  check("prima di salvare la ripulitura non si vede: Fo e Bisseck non vanno toccati", !/Segnati "già fatto" senza una partita/.test(t)&&!/Toglili dal giro/.test(t), t.slice(t.indexOf("Salva capitani"),t.indexOf("Salva capitani")+300));
  await p.locator("main button",{hasText:"Salva capitani e formatori"}).click(); await w(1300);
  const ms=(await db()).groups[0].data.matches;
  const r=id=>{const m=ms.find(x=>x.id===id);return [m.formatore,m.capitano].map(x=>Object.keys(I).find(n=>I[n]===x)).join("/");};
  check("1ª salvata: Fo / Bisseck", r("m1")==="Fo/Bisseck", r("m1"));
  check("2ª salvata: Cerio / Perro", r("m2")==="Cerio/Perro", r("m2"));
  check("3ª salvata: Luca / Mera", r("m3")==="Luca/Mera", r("m3"));
  const st=(await db()).board[0].settings;
  check("salvare il passato non chiude il giro", !st.giroNumero&&(st.giroFatti||[]).length===7, JSON.stringify(st));
  t=await T();
  check("la scheda resta per ripulire i segni", /Segnati "già fatto" senza una partita/.test(t), t.slice(0,600));
  check("e fra i segnati senza partita c'è solo Ale (la prova)", /\nAle: per il giro/.test("\n"+t.slice(t.indexOf("senza una partita")+18)), t.slice(t.indexOf("Segnati"),t.indexOf("Segnati")+250));
  check("e non dice più che ci sono partite da sistemare", /Tutte le partite hanno capitano e formatore/.test(t), t.slice(0,400));
  check("le partite in storico mostrano i ruoli", /Formatore\s*Fo\s*·\s*Capitano\s*Bisseck/.test(t), "");

  console.log("\n— RIPULIRE IL SEGNO DELLA PROVA —");
  await p.locator("main button",{hasText:"Toglili dal giro"}).click(); await w(900);
  const gf=((await db()).board[0].settings.giroFatti)||[];
  check("Ale esce dal giro", gf.indexOf(I.Ale)<0, JSON.stringify(gf));
  check("gli altri segni restano", gf.length===6, gf.length);
  check("ora la scheda sparisce: non c'è più niente da fare", !/CAPITANI DELLE PARTITE VECCHIE/.test(await T()), "");

  console.log("\n— CLASSIFICA E GIRO —");
  await tab("CLASSIFICA");
  for(const [n,x] of [["Perro",1],["Cerio",1],["Mera",1],["Luca",1],["Fo",1],["Bisseck",1],["Ale",0]])
    check(n+" 🎖️ "+x, await capiDi(n)===x, await capiDi(n));
  await tab("SQUADRE");
  t=await T();
  const g=t.slice(t.indexOf("GIRO DEI CAPITANI"),t.indexOf("GIRO DEI CAPITANI")+400);
  check("il giro: fatto da 6 su 7, manca Ale", /Fatto da\s*6 su 7/.test(g)&&/Mancano:\s*Ale/.test(g), g);
  check("e Ale ha un ruolo alla prossima", /(CAPITANO|FORMATORE)[\s\S]{0,40}Ale/.test(t), t.slice(t.indexOf("🏆"),t.indexOf("🏆")+160));

  console.log("\n— ERRORI JS —");
  check("nessun errore in pagina", errs.length===0, errs.slice(0,2).join(" || "));
  console.log("\n==========================");
  console.log("PASSATI: "+ok.length+"   FALLITI: "+ko.length);
  if(ko.length)console.log("KO:\n - "+ko.join("\n - "));
  await b.close(); process.exit(ko.length?1:0);
})();
