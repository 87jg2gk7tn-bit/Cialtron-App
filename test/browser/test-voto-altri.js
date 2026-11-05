/* Prova: registrare il voto MVP per conto di un altro.
   Serve il server statico su :8902 dentro test/browser. */
const {chromium}=require('playwright');
const URL_="http://localhost:8902/test.html";
let ok=[],ko=[];
const check=(n,v,x="")=>{(v?ok:ko).push(n);console.log((v?"  ✓ ":"  ✗ ")+n+(v?"":"  →  "+String(x).replace(/\n/g," | ").slice(0,220)));};

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
  /* Le righe da votare hanno il nome dentro uno <span>; il tasto che manda
     il voto nomina la stessa persona ma senza span. Cerco quello. */
  const scegli=async nome=>{
    const fatto=await p.evaluate(n=>{
      const b=[...document.querySelectorAll("main button")].find(x=>{
        const sp=x.querySelector("span");
        return sp&&sp.textContent.trim().replace(" (tu)","")===n;});
      if(b){b.click();return true;} return false;},nome);
    await w(300); return fatto;
  };

  await p.goto(URL_,{waitUntil:"networkidle"}); await w(1200);

  // ─── gruppo, rosa, e una partita già giocata ───
  await p.getByPlaceholder("tu@esempio.it").fill("mera@test.it");
  await p.getByPlaceholder("••••••").fill("segreta1");
  await p.getByText("Crea account").click(); await w(900);
  await p.getByPlaceholder("Calcetto del giovedì").fill("Cialtrona Cup");
  await p.getByText("Crea",{exact:true}).click(); await w(900);
  await p.getByText("Non ci sono · aggiungimi").click(); await w(300);
  await p.getByPlaceholder("Come ti chiami?").fill("Mera");
  await p.getByText("Conferma").click(); await w(900);
  await tab("ROSA");
  for(const n of ["Perro","Bisseck","Luca","Ale","Fo","Capu"]){  // Capu resta fuori: serve per la prova sotto
    await p.getByText("＋ Aggiungi giocatore").click();
    await p.getByPlaceholder("Nome giocatore…").fill(n);
    await p.getByText("Aggiungi",{exact:true}).click(); await w(450);
  }
  // la partita la scrivo direttamente: qui interessa il voto, non il flusso
  const ids=await p.evaluate(()=>{
    const d=window.__fakedb(), g=d.groups[0];
    const id=n=>(g.data.players.find(x=>x.name===n)||{}).id;
    const bianchi=[id("Mera"),id("Perro"),id("Bisseck")], neri=[id("Luca"),id("Ale"),id("Fo")];
    g.data=Object.assign({},g.data,{matches:[{id:"m1",date:new Date().toISOString().slice(0,10),
      white:bianchi,black:neri,scoreWhite:5,scoreBlack:3,scorers:{},mvps:[],mvp:null}]});
    window.__asOther("groups",{id:g.id},{data:g.data});
    const m={}; g.data.players.forEach(x=>m[x.name]=x.id); return m;
  }); await w(800);

  console.log("\n— LA TENDINA 'CHI STA VOTANDO' —");
  await tab("CLASSIFICA");
  await p.locator("main button",{hasText:"MVP"}).first().click(); await w(700);
  let t=await T();
  check("si vota l'MVP dell'ultima partita", /VOTA L'MVP DELLA GIORNATA/.test(t), t.slice(0,300));
  check("c'è la tendina di chi sta votando", /CHI STA VOTANDO/.test(t), t.slice(0,400));
  check("di mio parte da me", /Se qualcuno ti detta il voto/.test(t), t.slice(0,600));
  const opzioni=await p.locator("main select").first().locator("option").allInnerTexts();
  check("nella tendina ci sono io e tutti quelli che hanno giocato",
        opzioni.length===6&&/^Io \(Mera\)/.test(opzioni[0]), JSON.stringify(opzioni));

  console.log("\n— VOTO PER ME —");
  check("scelgo Perro fra i bianchi", await scegli("Perro"), "riga non trovata");
  check("e Luca fra i neri", await scegli("Luca"), "riga non trovata");
  await p.locator("main button",{hasText:/^Vota$/}).click(); await w(900);
  let v=(await db()).board[0].votes.m1;
  check("il voto finisce sotto il mio nome", !!v.r1[ids.Mera], JSON.stringify(v.r1));
  check("ed è quello che ho scelto", v.r1[ids.Mera].w===ids.Perro&&v.r1[ids.Mera].b===ids.Luca, JSON.stringify(v.r1[ids.Mera]));
  check("il conteggio dice 1 su 6", /Hanno votato\s*1\s*su 6/.test(await T()), (await T()).slice(-300));

  console.log("\n— VOTO PER UN ALTRO —");
  await p.locator("main select").first().selectOption({label:"Bisseck"}); await w(700);
  t=await T();
  check("l'app avvisa che sto votando per lui", /Stai registrando il voto di Bisseck, non il tuo/.test(t), t.slice(0,700));
  check("le scelte ripartono vuote, non si portano dietro le mie",
        !/✓/.test(t.slice(t.indexOf("MIGLIORE DEI BIANCHI"),t.indexOf("MIGLIORE DEI NERI"))), t.slice(0,800));
  check("per lui scelgo Bisseck fra i bianchi", await scegli("Bisseck"), "riga non trovata");
  check("e Fo fra i neri", await scegli("Fo"), "riga non trovata");
  const bottone=p.locator("main button",{hasText:"Registra il voto di Bisseck"});
  check("il tasto dice di chi è il voto", await bottone.count()>0, await T());
  await bottone.click(); await w(900);
  v=(await db()).board[0].votes.m1;
  check("il voto finisce sotto il nome di Bisseck", !!v.r1[ids.Bisseck], JSON.stringify(Object.keys(v.r1)));
  check("con le scelte di Bisseck", v.r1[ids.Bisseck].w===ids.Bisseck&&v.r1[ids.Bisseck].b===ids.Fo, JSON.stringify(v.r1[ids.Bisseck]));
  check("e il mio resta quello di prima", v.r1[ids.Mera].w===ids.Perro&&v.r1[ids.Mera].b===ids.Luca, JSON.stringify(v.r1[ids.Mera]));
  check("adesso sono 2 su 6", /Hanno votato\s*2\s*su 6/.test(await T()), (await T()).slice(-300));

  console.log("\n— UNO A TESTA, NON DUE —");
  await scegli("Perro");
  await p.locator("main button",{hasText:"Cambia il voto di Bisseck"}).click(); await w(900);
  v=(await db()).board[0].votes.m1;
  check("rivotare per lui sovrascrive, non aggiunge", Object.keys(v.r1).length===2, JSON.stringify(Object.keys(v.r1)));
  check("e vale l'ultimo", v.r1[ids.Bisseck].w===ids.Perro, JSON.stringify(v.r1[ids.Bisseck]));

  console.log("\n— CHI MANCA ALL'APPELLO —");
  t=await T();
  check("l'app dice a chi devo ancora chiedere il voto", /Mancano:/.test(t)&&/Luca/.test(t.slice(t.indexOf("Mancano:"))), t.slice(t.indexOf("Hanno votato")-20));
  check("e non nomina chi ha già votato", !/Mancano:[^\n]*Bisseck/.test(t), t.slice(t.indexOf("Mancano:"),t.indexOf("Mancano:")+160));

  console.log("\n— SI VOTA SOLO PER CHI HA GIOCATO —");
  const rifiuto=await p.evaluate(async()=>{
    const d=window.__fakedb(), g=d.groups[0];
    // un giocatore che non era in campo non esiste in questa partita:
    // provo a infilare un voto a nome suo passando dalla funzione
    const fuori=g.data.players.find(x=>["Mera","Perro","Bisseck","Luca","Ale","Fo"].indexOf(x.name)<0);
    if(!fuori)return "ERRORE DELLA PROVA: erano tutti in campo, il controllo gira a vuoto";
    const sb=window.supabase.createClient();
    const r=await sb.rpc('set_vote',{p_group:g.id,p_match:"m1",p_round:"r1",
      p_a:g.data.players[0].id,p_b:g.data.players[3].id,p_who:fuori.id});
    return r.error?r.error.message:"PASSATO";
  });
  check("un voto a nome di chi non ha giocato viene rifiutato",
        /solo per chi ha giocato/.test(rifiuto), rifiuto);

  console.log("\n— BALLOTTAGGIO: ANCHE LÌ PER CONTO DI UN ALTRO —");
  await p.locator("main button",{hasText:"Chiudi le votazioni"}).click(); await w(1000);
  t=await T();
  check("si passa al ballottaggio", /BALLOTTAGGIO/.test(t), t.slice(0,300));
  check("anche qui c'è la tendina", /CHI STA VOTANDO/.test(t), t.slice(0,500));
  const sel=p.locator("main select").first();
  await sel.selectOption({label:"Luca"}); await w(700);
  t=await T();
  if(/è in ballottaggio: non vota/.test(t)){
    check("se quello scelto è in ballottaggio, l'app lo dice col suo nome", /Luca è in ballottaggio/.test(t), t.slice(0,600));
  }else{
    await p.locator("main button",{hasText:"Registra il voto di Luca"}).first().click(); await w(900);
    const v2=(await db()).board[0].votes.m1;
    check("il voto del ballottaggio va sotto il nome di Luca", !!v2.r2[ids.Luca], JSON.stringify(v2.r2));
  }

  console.log("\n— ERRORI JS —");
  check("nessun errore in pagina", errs.length===0, errs.slice(0,2).join(" || "));
  await p.screenshot({path:__dirname+"/s-voto-altri.png",fullPage:true});
  console.log("\n==========================");
  console.log("PASSATI: "+ok.length+"   FALLITI: "+ko.length);
  if(ko.length)console.log("KO:\n - "+ko.join("\n - "));
  await b.close(); process.exit(ko.length?1:0);
})();
