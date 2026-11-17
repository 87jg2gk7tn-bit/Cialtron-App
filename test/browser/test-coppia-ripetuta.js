/* Prova del caso segnalato: la stessa coppia proposta due volte di fila
   mentre Mera, che il capitano non l'ha mai fatto, non veniva proposto.
   Causa: i segni della vecchia lista "già fatto" contavano come una volta. */
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
  const chi=async()=>{const t=await T();
    const c=(t.match(/CAPITANO\s*\n\s*\S\s*\n\s*([^\n]+)/)||[])[1], f=(t.match(/FORMATORE\s*\n\s*\S\s*\n\s*([^\n]+)/)||[])[1];
    return{cap:(c||"").replace(" (tu)","").trim(),form:(f||"").replace(" (tu)","").trim()};};
  const id=n=>p.evaluate(n=>(window.__fakedb().groups[0].data.players.find(x=>x.name===n)||{}).id,n);
  const nome=i=>p.evaluate(i=>(window.__fakedb().groups[0].data.players.find(x=>x.id===i)||{}).name,i);
  const perche=async()=>{const t=await T();const i=t.indexOf("Perché loro.");return i<0?"(nessun perché)":t.slice(i,t.indexOf("\n\n",i)>0?Math.min(t.indexOf("Scegli capitano",i)>0?t.indexOf("Scegli capitano",i):i+500,i+500):i+500);};
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

  /* Lo stato com'era: la vecchia lista con quasi tutti segnati (anche Mera,
     mai capitano, da una selezione di prova) e una partita vera, registrata
     con i ruoli: Perro formatore, Fo capitano. */
  await p.evaluate(()=>{
    const d=window.__fakedb(), g=d.groups[0];
    const id={}; g.data.players.forEach(x=>id[x.name]=x.id);
    const base={Perro:[10,9,5],Mera:[10,7,3],Gianni:[10,6,2],Ale:[10,5,4],Luca:[10,3,2],Fo:[10,1,1]};
    const players=g.data.players.map(x=>Object.assign({},x,{base:{presences:base[x.name][0],wins:base[x.name][1],goals:base[x.name][2],mvps:0}}));
    const m={id:"m1",date:"2026-11-12T20:00:00Z",white:[id.Perro,id.Mera,id.Ale],black:[id.Fo,id.Luca,id.Gianni],
             winner:"white",scoreWhite:4,scoreBlack:2,goals:{},formatore:id.Perro,capitano:id.Fo};
    g.data=Object.assign({},g.data,{players,matches:[m]});
    window.__asOther("groups",{id:g.id},{data:g.data});
    const bd=d.board[0];
    window.__asOther("board",{group_id:bd.group_id},{settings:Object.assign({},bd.settings,
      {giroFatti:[id.Mera,id.Luca,id.Ale,id.Gianni]})});
  }); await w(900);

  console.log("\n— DOPO PERRO E FO, NON DI NUOVO PERRO E FO —");
  await daCapo();
  let r=await chi();
  check("la coppia Perro–Fo non viene riproposta", !(r.form==="Perro"&&r.cap==="Fo")&&r.form!=="Perro"&&r.cap!=="Fo", JSON.stringify(r));
  check("tocca a Mera, che non l'ha mai fatto: formatore (primo dei rimasti)", r.form==="Mera", JSON.stringify(r));
  check("e capitano Luca (ultimo dei rimasti)", r.cap==="Luca", JSON.stringify(r));
  let t=await T();
  check("l'app spiega perché, con i numeri", /Perché loro\.[\s\S]{0,80}tocca a chi l'ha fatto meno volte \(mai\)/.test(t)&&/Mera è il primo in classifica e Luca l'ultimo/.test(t), t.slice(t.indexOf("Perché"),t.indexOf("Perché")+300));
  let g=await perche();
  const tocca=((g.match(/\(mai\):\s*([^.]+)\./)||[])[1]||"").split(",").map(x=>x.trim()).sort().join(",");
  check("tocca a Mera, Gianni, Ale, Luca: tutti quelli che non l'hanno mai fatto", tocca==="Ale,Gianni,Luca,Mera", g);
  check("la scheda del giro non c'è più", !/GIRO DEI CAPITANI/.test(await T()), "");

  console.log("\n— LA VECCHIA LISTA SERVE ANCORA PER LO STORICO —");
  const s=(await db()).board[0].settings;
  check("la vecchia lista non viene cancellata (è una traccia per lo storico)", (s.giroFatti||[]).length===4, JSON.stringify(s.giroFatti));

  console.log("\n— PARTITE SENZA RUOLI: LA SCHEDA LO DICE —");
  await p.evaluate(()=>{
    const d=window.__fakedb(), g=d.groups[0], ids=g.data.players.map(x=>x.id);
    const m0={id:"m0",date:"2026-11-05T20:00:00Z",white:ids.slice(0,3),black:ids.slice(3),winner:"white",scoreWhite:2,scoreBlack:1,goals:{}};
    g.data=Object.assign({},g.data,{matches:[m0].concat(g.data.matches)});
    window.__asOther("groups",{id:g.id},{data:g.data});
  }); await w(900);
  await daCapo();
  g=await perche();
  check("avvisa: 1 partita senza formatore e capitano", /1 partita non ha formatore e capitano/.test(g)&&/Partite → Formatori e capitani/.test(g), g);

  console.log("\n— REGISTRANDO A MANO, I RUOLI ARRIVANO DALLA SELEZIONE —");
  await p.getByText("METODO CAVA").click(); await w(900);
  const bi=p.locator("main button",{hasText:"⬜"}), ne=p.locator("main button",{hasText:"⬛"});
  const n=await bi.count();
  for(let i=0;i<n;i++){ if(i%2===0)await bi.nth(i).click(); else await ne.nth(i).click(); await w(220); }
  await p.getByText(/Invia a |scegli il lato/).first().click(); await w(900);
  const lato=p.locator("main button",{hasText:"⬜ BIANCHI"});
  if(await lato.count())await lato.last().click();
  await w(1000);
  const sel=(await db()).selections[0].state;
  // invece di "Registra con queste squadre", passo da Partite → Nuova partita
  await tab("PARTITE");
  await p.locator("main button",{hasText:"＋ Nuova partita"}).click(); await w(500);
  const W=sel.finalWhite||[], B=sel.finalBlack||[];
  for(const pid of W.concat(B)){
    const nm=await nome(pid);
    await p.evaluate(([nm,lato])=>{
      const r=[...document.querySelectorAll("main div")].filter(d=>d.querySelectorAll("button").length===2&&
        [...d.querySelectorAll("span")].some(s=>s.textContent.trim()===nm)).sort((a,b)=>a.innerText.length-b.innerText.length)[0];
      r&&r.querySelectorAll("button")[lato].click();},[nm,W.indexOf(pid)>=0?0:1]); await w(200);
  }
  await p.locator("main button",{hasText:"Avanti →"}).first().click(); await w(500);
  const num=p.locator("main input[type=number]");
  await num.nth(0).fill("3"); await num.nth(1).fill("2"); await w(300);
  await p.locator("main button",{hasText:"Avanti →"}).first().click(); await w(700);
  const se=p.locator("main select");
  check("formatore già compilato dalla selezione (Mera)", await nome(await se.nth(0).inputValue())==="Mera", await se.nth(0).inputValue());
  check("capitano già compilato dalla selezione (Luca)", await nome(await se.nth(1).inputValue())==="Luca", await se.nth(1).inputValue());

  console.log("\n— SE LI TOGLI, IL 'SEI SICURO?' AVVISA —");
  await se.nth(0).selectOption(""); await se.nth(1).selectOption(""); await w(300);
  await p.locator("main button",{hasText:"Salva partita ✓"}).click(); await w(600);
  const body=await p.locator("body").innerText();
  check("avvisa che senza ruoli il giro non va avanti", /Manca chi ha fatto formatore e capitano: senza, il giro non va avanti/.test(body), body.slice(body.indexOf("SEI SICURO"),body.indexOf("SEI SICURO")+500));
  await p.getByRole("button",{name:"No, torno indietro"}).click(); await w(400);

  console.log("\n— ERRORI JS —");
  check("nessun errore in pagina", errs.length===0, errs.slice(0,2).join(" || "));
  console.log("\n==========================");
  console.log("PASSATI: "+ok.length+"   FALLITI: "+ko.length);
  if(ko.length)console.log("KO:\n - "+ko.join("\n - "));
  await b.close(); process.exit(ko.length?1:0);
})();
