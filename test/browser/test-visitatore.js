/* Prova: il visitatore gioca, ma non è in classifica né nel giro dei capitani. */
const {chromium}=require('playwright');
const URL_="http://localhost:8902/test.html";
let ok=[],ko=[];
const check=(n,v,x="")=>{(v?ok:ko).push(n);console.log((v?"  ✓ ":"  ✗ ")+n+(v?"":"  →  "+String(x).replace(/\n/g," | ").slice(0,240)));};

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
  const ruoli=async()=>{const t=await T();const i=t.indexOf("🏆 CAPITANO");return t.slice(i,i+200).replace(/\n/g," | ");};
  const giocatore=n=>p.evaluate(n=>(window.__fakedb().groups[0].data.players.find(x=>x.name===n)||{}),n);

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
  for(const n of ["Perro","Luca","Ale","Fo"]){
    await p.getByText("＋ Aggiungi giocatore").click();
    await p.getByPlaceholder("Nome giocatore…").fill(n);
    await p.getByText("Aggiungi",{exact:true}).click(); await w(450);
  }

  console.log("\n— AGGIUNGERE UN VISITATORE —");
  await p.getByText("＋ Aggiungi giocatore").click();
  await p.getByPlaceholder("Nome giocatore…").fill("Gianni");
  let t=await T();
  check("nel modulo c'è la spunta visitatore", /Visitatore/.test(t)&&/non entra in classifica/.test(t), t.slice(0,500));
  await p.locator("main label",{hasText:"Visitatore"}).first().locator("input").check(); await w(200);
  await p.getByText("Aggiungi",{exact:true}).click(); await w(700);
  check("Gianni viene salvato come visitatore", (await giocatore("Gianni")).visitor===true, JSON.stringify(await giocatore("Gianni")));
  t=await T();
  check("sulla scheda c'è il segno VISITATORE", /Gianni\s*VISITATORE/.test(t), t.slice(t.indexOf("Gianni")-10,t.indexOf("Gianni")+60));

  // numeri veri: Gianni sarebbe primo, Fo ultimo
  await p.evaluate(()=>{
    const d=window.__fakedb(), g=d.groups[0];
    const base={Gianni:[10,10,9],Perro:[10,8,5],Mera:[10,6,3],Ale:[10,5,4],Luca:[10,3,2],Fo:[10,0,1]};
    g.data=Object.assign({},g.data,{players:g.data.players.map(x=>base[x.name]
      ?Object.assign({},x,{base:{presences:base[x.name][0],wins:base[x.name][1],goals:base[x.name][2],mvps:0}}):x)});
    window.__asOther("groups",{id:g.id},{data:g.data});
  }); await w(800);

  console.log("\n— IN CLASSIFICA NON C'È —");
  await tab("CLASSIFICA"); t=await T();
  check("Gianni non compare in classifica", !/Gianni/.test(t), t.slice(0,600));
  check("il primo in classifica è Perro", /Perro/.test(t)&&t.indexOf("Perro")<t.indexOf("Mera"), t.slice(0,500));
  for(const v of ["MARCATORI","MVP"]){
    await p.locator("main button",{hasText:v}).first().click(); await w(500);
    check("neanche nella classifica "+v.toLowerCase(), !/Gianni/.test(await T()), (await T()).slice(0,300));
  }

  console.log("\n— NEL GIRO DEI CAPITANI NON C'È —");
  await tab("SQUADRE"); t=await T();
  check("il formatore è il primo della classifica, non il visitatore", /FORMATORE[\s\S]{0,40}Perro/.test(t), await ruoli());
  check("il capitano è l'ultimo", /CAPITANO[\s\S]{0,40}Fo/.test(t), await ruoli());
  check("il giro conta solo chi lo fa (0 su 5... nessuno ancora)", /Non l'ha ancora fatto nessuno/.test(t), t.slice(t.indexOf("GIRO"),t.indexOf("GIRO")+200));
  await p.locator("main button",{hasText:"Sistema"}).first().click(); await w(400);
  const righeGiro=await p.locator("main button").filter({hasText:/già fatto|—/}).allInnerTexts();
  check("nel pannello del giro Gianni non c'è", righeGiro.length===5&&!righeGiro.some(x=>/Gianni/.test(x)), JSON.stringify(righeGiro));
  await p.locator("main button",{hasText:"Chiudi"}).first().click(); await w(400);
  await p.locator("main button",{hasText:/capitano e formatore (a mano|scelti a mano)/i}).first().click(); await w(400);
  t=await T();
  const pannello=t.slice(t.indexOf("Comanda la classifica"),t.indexOf("CHI GIOCA"));
  check("e non si può nominare capitano a mano", !/Gianni/.test(pannello), pannello.slice(0,400));
  await p.locator("main button",{hasText:"Chiudi"}).first().click(); await w(400);

  console.log("\n— MA GIOCA —");
  t=await T();
  check("fra chi gioca c'è anche lui (6 in campo)", /In campo:\s*6/.test(t), t.slice(t.indexOf("CHI GIOCA"),t.indexOf("CHI GIOCA")+200));
  await p.getByText("METODO CAVA").click(); await w(800);
  t=await T();
  check("e il formatore lo può mettere in squadra", /Gianni/.test(t), t.slice(0,800));
  // si chiude la selezione: il giro segna chi ha fatto i ruoli, mai il visitatore
  const bi=p.locator("main button",{hasText:"⬜"}), ne=p.locator("main button",{hasText:"⬛"});
  const n=await bi.count();
  for(let i=0;i<n;i++){ if(i%2===0)await bi.nth(i).click(); else await ne.nth(i).click(); await w(250); }
  await p.getByText(/Invia a |Fatto: scegli il lato|scegli il lato/).first().click(); await w(900);
  const lato=p.locator("main button",{hasText:"⬜ BIANCHI"});
  if(await lato.count())await lato.last().click();
  await w(1000);
  const st=(await db()).selections[0].state;
  const inSquadra=(st.finalWhite||[]).concat(st.finalBlack||[]);
  const gid=(await giocatore("Gianni")).id;
  check("le squadre sono fatte e Gianni è dentro", inSquadra.indexOf(gid)>=0, JSON.stringify(st.phase)+" "+inSquadra.length);
  const fatti=(await db()).board[0].settings.giroFatti||[];
  check("il giro segna capitano e formatore, non lui", fatti.length===2&&fatti.indexOf(gid)<0, JSON.stringify(fatti));

  console.log("\n— DOPO UNA PARTITA RESTA FUORI DALLA CLASSIFICA —");
  await p.evaluate(gid=>{
    const d=window.__fakedb(), g=d.groups[0];
    const id=n=>(g.data.players.find(x=>x.name===n)||{}).id;
    g.data=Object.assign({},g.data,{matches:[{id:"m1",date:new Date().toISOString().slice(0,10),
      white:[gid,id("Mera"),id("Luca")],black:[id("Perro"),id("Ale"),id("Fo")],
      scoreWhite:6,scoreBlack:2,goals:{[gid]:4},mvps:[gid],mvp:gid}]});
    window.__asOther("groups",{id:g.id},{data:g.data});
  },gid); await w(800);
  await tab("CLASSIFICA"); t=await T();
  check("anche con 4 gol e l'MVP non entra in classifica", !/Gianni/.test(t), t.slice(0,500));
  await tab("ROSA"); t=await T();
  const scheda=t.slice(t.indexOf("Gianni"),t.indexOf("Gianni")+260);
  check("ma i suoi numeri restano sulla sua scheda (11 presenze)", /·\s*11 presenze/.test(scheda), scheda);

  console.log("\n— TOGLIENDO LA SPUNTA RIENTRA —");
  // la spunta di Gianni: è l'unica accesa
  await p.locator("main input[type=checkbox]:checked").first().click(); await w(900);
  check("la spunta si toglie e si salva", (await giocatore("Gianni")).visitor===false, JSON.stringify(await giocatore("Gianni")));
  await tab("CLASSIFICA"); t=await T();
  check("e Gianni torna in classifica, primo", /Gianni/.test(t)&&t.indexOf("Gianni")<t.indexOf("Perro"), t.slice(0,500));

  console.log("\n— ERRORI JS —");
  check("nessun errore in pagina", errs.length===0, errs.slice(0,2).join(" || "));
  console.log("\n==========================");
  console.log("PASSATI: "+ok.length+"   FALLITI: "+ko.length);
  if(ko.length)console.log("KO:\n - "+ko.join("\n - "));
  await b.close(); process.exit(ko.length?1:0);
})();
