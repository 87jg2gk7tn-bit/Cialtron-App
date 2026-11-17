/* Prova: il giro dei capitani conta le volte. Tocca a chi l'ha fatto meno
   volte, fra questi decide la classifica. Chi resta fuori non blocca il
   giro, e quando torna tocca a lui per primo. */
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
  const ruoli=async()=>{const t=await T();const i=t.indexOf("🏆 CAPITANO");return i<0?"(niente ruoli)":t.slice(i,i+170).replace(/\n/g," | ");};
  const chi=async()=>{const t=await T();
    const c=(t.match(/CAPITANO\s*\n\s*\S\s*\n\s*([^\n]+)/)||[])[1], f=(t.match(/FORMATORE\s*\n\s*\S\s*\n\s*([^\n]+)/)||[])[1];
    return{cap:(c||"").replace(" (tu)","").trim(),form:(f||"").replace(" (tu)","").trim()};};
  const id=n=>p.evaluate(n=>(window.__fakedb().groups[0].data.players.find(x=>x.name===n)||{}).id,n);
  const nome=i=>p.evaluate(i=>(window.__fakedb().groups[0].data.players.find(x=>x.id===i)||{}).name,i);
  const capiDi=async n=>p.evaluate(n=>{
    const r=[...document.querySelectorAll("main div")].filter(d=>/🎖️\s*\d+/.test(d.innerText)&&d.innerText.split("\n").some(l=>l.trim()===n));
    r.sort((a,b)=>a.innerText.length-b.innerText.length);
    const m=r[0]&&r[0].innerText.match(/🎖️\s*(\d+)/); return m?+m[1]:null;},n);
  const sett=async()=>(await db()).board[0].settings||{};
  const perche=async()=>{const t=await T();const i=t.indexOf("Perché loro.");return i<0?"(nessun perché)":t.slice(i,t.indexOf("\n\n",i)>0?Math.min(t.indexOf("Scegli capitano",i)>0?t.indexOf("Scegli capitano",i):i+500,i+500):i+500);};
  const daCapo=async()=>{
    await tab("SQUADRE");
    const r=p.locator("main button",{hasText:"Rifai da capo la selezione"});
    if(await r.count()){await r.click();await w(900);}
  };
  /* una partita "già giocata" con i suoi ruoli, scritta direttamente: qui
     interessa il giro, il flusso di registrazione è provato più sotto */
  let giorno=1;
  const partita=async(form,cap)=>{
    const F=await id(form), Cp=await id(cap);
    await p.evaluate(([F,Cp,g])=>{
      const d=window.__fakedb(), gr=d.groups[0];
      const tutti=gr.data.players.map(x=>x.id).filter(x=>x!==F&&x!==Cp);
      const m={id:"x"+g,date:new Date(Date.UTC(2026,9,g,20)).toISOString(),
        white:[F].concat(tutti.slice(0,2)),black:[Cp].concat(tutti.slice(2)),winner:"white",scoreWhite:3,scoreBlack:1,goals:{},
        formatore:F,capitano:Cp};
      gr.data=Object.assign({},gr.data,{matches:(gr.data.matches||[]).concat(m)});
      window.__asOther("groups",{id:gr.id},{data:gr.data});
    },[F,Cp,giorno++]); await w(700);
  };
  const risposta=async(n,segno)=>{
    await tab("CI SEI?");
    const fatto=await p.evaluate(([n,s])=>{
      /* la riga più piccola che ha il nome e i suoi due tasti ✓ ✕ */
      const r=[...document.querySelectorAll("main div")].filter(d=>d.querySelectorAll("button").length===2&&
        d.innerText.split("\n").map(x=>x.trim().replace(/TU$/,"")).indexOf(n)>=0)
        .sort((a,b)=>a.innerText.length-b.innerText.length)[0];
      const b=r&&[...r.querySelectorAll("button")].find(x=>x.textContent.trim()===s);
      if(b){b.click();return true;} return false;},[n,segno]); await w(900);
    return fatto;
  };
  const rispostaDi=async n=>{const d=await db();const c=d.board[0].callups||{};const i=await id(n);
    return Object.keys(c).map(k=>(c[k][i]||{}).v).filter(Boolean)[0]||null;};

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
  // classifica: Perro, Mera, Gianni, Ale, Luca, Fo
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

  console.log("\n— ALL'INIZIO: NESSUNO L'HA FATTO —");
  await tab("SQUADRE");
  let r=await chi();
  check("formatore il primo (Perro), capitano l'ultimo (Fo)", r.form==="Perro"&&r.cap==="Fo", JSON.stringify(r));
  check("la scheda del giro non c'è più (tolta su richiesta)", !/GIRO DEI CAPITANI/.test(await T()), "");
  let g=await perche();
  check("il perché: tocca a chi non l'ha mai fatto, primo Perro e ultimo Fo", /\(mai\)/.test(g)&&/Perro è il primo in classifica e Fo l'ultimo/.test(g), g);

  console.log("\n— UNA SELEZIONE NON CONTA, LA PARTITA SÌ —");
  await faiSquadre();
  await p.locator("main button",{hasText:"Rifai da capo la selezione"}).click(); await w(900);
  r=await chi();
  check("rifatta da capo, propone gli stessi: non hanno ancora giocato da capitani", r.form==="Perro"&&r.cap==="Fo", JSON.stringify(r));
  await faiSquadre();
  await p.locator("main button",{hasText:"Registra la partita con queste squadre"}).click(); await w(900);
  const num=p.locator("main input[type=number]");
  await num.nth(0).fill("5"); await num.nth(1).fill("3"); await w(300);
  await p.locator("main button",{hasText:"Avanti →"}).first().click(); await w(600);
  const sel=p.locator("main select");
  check("in registrazione formatore e capitano arrivano dalla selezione",
        await nome(await sel.nth(0).inputValue())==="Perro"&&await nome(await sel.nth(1).inputValue())==="Fo", "");
  await p.locator("main button",{hasText:"Salva partita ✓"}).click(); await w(600);
  await p.getByRole("button",{name:"Sì, salva"}).click(); await w(1300);
  let m=((await db()).groups[0].data.matches||[]).slice(-1)[0]||{};
  check("la partita salva formatore e capitano", m.formatore===await id("Perro")&&m.capitano===await id("Fo"), JSON.stringify({f:m.formatore,c:m.capitano}));
  await daCapo();
  r=await chi();
  check("dopo la partita tocca agli altri: né Perro né Fo", ["Perro","Fo"].indexOf(r.form)<0&&["Perro","Fo"].indexOf(r.cap)<0, JSON.stringify(r));
  check("formatore Mera (primo dei rimasti), capitano Luca (ultimo)", r.form==="Mera"&&r.cap==="Luca", JSON.stringify(r));

  console.log("\n— GIANNI RESTA FUORI —");
  check("Gianni dice che non c'è", await risposta("Gianni","✕")&&await rispostaDi("Gianni")==="no", await rispostaDi("Gianni"));
  await daCapo();
  r=await chi();
  check("con Gianni assente, Gianni non ha ruoli", r.form!=="Gianni"&&r.cap!=="Gianni", JSON.stringify(r));
  await partita("Mera","Luca");
  await daCapo();
  r=await chi();
  check("fra i presenti resta solo Ale a zero: tocca a lui", r.form==="Ale"||r.cap==="Ale", JSON.stringify(r));
  check("e l'altro ruolo va a chi è a una volta (Fo, l'ultimo)", (r.form==="Ale"&&r.cap==="Fo")||(r.cap==="Ale"&&r.form==="Perro"), JSON.stringify(r));
  await partita("Ale",r.form==="Ale"?r.cap:r.form);
  await daCapo();
  g=await perche();
  check("il giro va avanti senza di lui: tocca a chi l'ha fatto 1 volta", /\(1 volta\)/.test(g), g);
  check("e Gianni, assente, non è fra quelli a cui tocca", !/Gianni/.test(g), g);
  r=await chi();
  check("i presenti ripartono fra chi l'ha fatto una volta", r.form&&r.cap&&r.form!=="Gianni"&&r.cap!=="Gianni", JSON.stringify(r));
  const v2=await p.evaluate(()=>{const d=window.__fakedb();const c={};(d.groups[0].data.matches||[]).forEach(m=>[m.formatore,m.capitano].forEach(x=>{if(x)c[x]=(c[x]||0)+1;}));return c;});
  check("e non chi l'ha già fatto due volte", v2[await id(r.form)]!==2&&v2[await id(r.cap)]!==2, JSON.stringify(r));

  console.log("\n— GIANNI TORNA —");
  check("Gianni torna: toglie il no", await risposta("Gianni","✕")&&await rispostaDi("Gianni")===null, await rispostaDi("Gianni"));
  await daCapo();
  r=await chi();
  check("Gianni torna: non l'ha mai fatto, tocca a lui", r.form==="Gianni"||r.cap==="Gianni", JSON.stringify(r));
  g=await perche();
  check("e il perché lo dice: è l'unico fra chi gioca a non averlo mai fatto", /Gianni è l'unico fra chi gioca ad averlo fatto mai/.test(g), g);

  console.log("\n— LA SCELTA A MANO NON SCAVALCA IL TURNO —");
  await p.locator("main button",{hasText:/capitano e formatore (a mano|scelti a mano)/i}).first().click(); await w(400);
  await p.evaluate(()=>{const s=[...document.querySelectorAll("main span")].find(x=>x.textContent.trim()==="Fo");
    const b=s&&[...s.parentElement.querySelectorAll("button")].find(x=>x.textContent.trim()==="🛡️"); b&&b.click();}); await w(900);
  /* Fo (già 2 volte) a mano come formatore, mentre tocca a Gianni (mai) e poi a chi è a 1 */
  await p.locator("main button",{hasText:"Chiudi"}).first().click(); await w(400);
  r=await chi();
  check("Fo, già due volte, non scavalca il turno nemmeno a mano", r.form!=="Fo"&&r.cap!=="Fo"&&(r.form==="Gianni"||r.cap==="Gianni"), JSON.stringify(r));
  check("e l'app spiega perché", /Fo era formatore per scelta vostra, ma l'ha già fatto più volte di altri/.test(await T()), (await T()).slice(0,700));

  console.log("\n— IN CLASSIFICA —");
  await tab("CLASSIFICA");
  check("Fo 🎖️ 2", await capiDi("Fo")===2, await capiDi("Fo"));
  check("Perro 🎖️ 1", await capiDi("Perro")===1, await capiDi("Perro"));
  check("Gianni 🎖️ 0", await capiDi("Gianni")===0, await capiDi("Gianni"));

  console.log("\n— LE VOLTE SEGNATE A MANO NON CONTANO PIÙ —");
  /* un segno a mano rimasto da prima (es. Gianni): senza la scheda non si
     vedrebbe, quindi non deve spostare niente */
  await p.evaluate(async gid=>{
    const d=window.__fakedb(), b=d.board[0];
    window.__asOther("board",{group_id:b.group_id},{settings:Object.assign({},b.settings,{ruoliIso:null,captainId:null,pickerId:null,giroAMano:[gid],giroFatti:[gid]})});
  },await id("Gianni")); await w(900);
  await daCapo();
  r=await chi();
  check("Gianni, con un segno a mano rimasto, resta a zero: tocca a lui", r.form==="Gianni"||r.cap==="Gianni", JSON.stringify(r));

  console.log("\n— ERRORI JS —");
  check("nessun errore in pagina", errs.length===0, errs.slice(0,2).join(" || "));
  console.log("\n==========================");
  console.log("PASSATI: "+ok.length+"   FALLITI: "+ko.length);
  if(ko.length)console.log("KO:\n - "+ko.join("\n - "));
  await b.close(); process.exit(ko.length?1:0);
})();
