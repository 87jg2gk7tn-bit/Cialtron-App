/* Prova: eliminare un esterno a chiamata in corso (cava e tradizionale). */
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
  const nuovoEsterno=async(nome,n)=>{
    await p.locator("main button",{hasText:"＋ Aggiungi un esterno"}).first().click(); await w(300);
    await p.getByPlaceholder("Nome (facoltativo)").fill(nome); await stelle(n);
    await p.locator("main button",{hasText:/^Salva$/}).first().click(); await w(800);
  };
  const elimina=async nome=>{
    await p.locator(`main button[aria-label='Correggi ${nome}']`).click(); await w(300);
    await p.locator("main button",{hasText:"Elimina questo esterno"}).click(); await w(900);
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
  await p.getByText("＋ Aggiungi giocatore").click();
  await p.getByPlaceholder("Nome giocatore…").fill("Cerio");
  await p.getByText("Aggiungi",{exact:true}).click(); await w(500);

  console.log("\n— METODO CAVA, IL FORMATORE STA ASSEGNANDO —");
  await tab("SQUADRE");
  await p.getByText("METODO CAVA").click(); await w(900);
  await nuovoEsterno("Cicci",4);
  await nuovoEsterno("Pippo",2);
  let sel=(await db()).selections[0].state;
  check("due esterni entrano nella chiamata", (sel.pool||[]).filter(x=>/^ext/.test(x)).length===2, JSON.stringify(sel.pool));
  // Cicci viene assegnato ai bianchi, poi lo elimino
  await p.evaluate(()=>{const r=[...document.querySelectorAll("main div")].find(d=>/^Cicci/.test((d.querySelector("span")||{}).textContent||"")&&d.querySelectorAll("button").length===2);
    r&&r.querySelectorAll("button")[0].click();}); await w(700);
  sel=(await db()).selections[0].state;
  check("Cicci assegnato ai bianchi", sel.assign&&sel.assign.ext1==="white", JSON.stringify(sel.assign));
  await p.locator("main button[aria-label='Correggi Cicci']").click(); await w(300);
  check("anche a chiamata in corso c'è 'Elimina questo esterno'", await p.locator("main button",{hasText:"Elimina questo esterno"}).count()===1, (await T()).slice(0,600));
  await p.locator("main button",{hasText:"Elimina questo esterno"}).click(); await w(900);
  sel=(await db()).selections[0].state;
  check("Cicci esce dalla chiamata", (sel.pool||[]).indexOf("ext1")<0, JSON.stringify(sel.pool));
  check("e dalle assegnazioni", !sel.assign||sel.assign.ext1===undefined, JSON.stringify(sel.assign));
  check("e dall'elenco degli esterni", JSON.stringify(sel.extList)===JSON.stringify(["ext2"])&&!sel.extInfo.ext1, JSON.stringify({l:sel.extList,i:sel.extInfo}));
  check("la chiamata resta in piedi", sel.phase==="picking"&&/Pippo/.test(await T())&&!/Cicci/.test(await T()), sel.phase);
  // assegno Pippo: con lui fatto si può mandare al capitano
  await p.evaluate(()=>{const r=[...document.querySelectorAll("main div")].find(d=>/^Pippo/.test((d.querySelector("span")||{}).textContent||"")&&d.querySelectorAll("button").length===2);
    r&&r.querySelectorAll("button")[1].click();}); await w(700);
  const fatto=p.locator("main button",{hasText:/scegli il lato|Invia a/}).first();
  check("assegnato l'ultimo rimasto si può andare avanti", !(await fatto.isDisabled()), await fatto.innerText());
  await p.locator("main button",{hasText:"Cambia metodo"}).click(); await w(800);

  console.log("\n— CHIAMATA TRADIZIONALE: ELIMINO L'ULTIMO DA CHIAMARE —");
  await p.getByText("METODO TRADIZIONALE").click(); await w(900);
  await nuovoEsterno("Pippo",2);
  sel=(await db()).selections[0].state;
  const idPippo=(sel.extList||[])[0];
  check("Pippo entra nella chiamata ed è l'unico da chiamare", sel.phase==="draft"&&(sel.pool||[]).indexOf(idPippo)>=0, JSON.stringify({ph:sel.phase,pool:sel.pool}));
  await elimina("Pippo");
  sel=(await db()).selections[0].state;
  check("tolto l'unico da chiamare, la chiamata si chiude da sola", sel.phase==="done", sel.phase);
  check("con le due squadre fatte", (sel.finalWhite||[]).length===1&&(sel.finalBlack||[]).length===1, JSON.stringify({w:sel.finalWhite,b:sel.finalBlack}));
  check("e senza Pippo da nessuna parte", JSON.stringify(sel).indexOf('"'+idPippo+'"')<0, JSON.stringify(sel).slice(0,300));
  /* Il giro qui non si può controllare: con due soli giocatori in rosa,
     fatto da entrambi, si chiude e riparte vuoto — ed è giusto così. */

  console.log("\n— ERRORI JS —");
  check("nessun errore in pagina", errs.length===0, errs.slice(0,2).join(" || "));
  console.log("\n==========================");
  console.log("PASSATI: "+ok.length+"   FALLITI: "+ko.length);
  if(ko.length)console.log("KO:\n - "+ko.join("\n - "));
  await b.close(); process.exit(ko.length?1:0);
})();
