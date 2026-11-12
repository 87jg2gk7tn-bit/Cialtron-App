const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',proxy:{server:'http://127.0.0.1:1',bypass:'localhost,127.0.0.1'}});
  const ctx=await b.newContext({viewport:{width:390,height:900},deviceScaleFactor:2});
  await ctx.addInitScript({path:__dirname+"/fakesupa.js"});
  const p=await ctx.newPage(); const w=(ms=500)=>p.waitForTimeout(ms);
  await p.goto("http://localhost:8902/test.html",{waitUntil:"networkidle"}); await w(1200);
  await p.getByPlaceholder("tu@esempio.it").fill("m@t.it");
  await p.getByPlaceholder("••••••").fill("segreta1");
  await p.getByText("Crea account").click(); await w(900);
  await p.getByPlaceholder("Calcetto del giovedì").fill("Cialtrona Cup");
  await p.getByText("Crea",{exact:true}).click(); await w(900);
  await p.getByText("Non ci sono · aggiungimi").click(); await w(300);
  await p.getByPlaceholder("Come ti chiami?").fill("Mera");
  await p.getByText("Conferma").click(); await w(900);
  await p.locator("nav button").filter({hasText:"ROSA"}).click(); await w(500);
  for(const n of ["Perro","Luca"]){
    await p.getByText("＋ Aggiungi giocatore").click();
    await p.getByPlaceholder("Nome giocatore…").fill(n);
    await p.getByText("Aggiungi",{exact:true}).click(); await w(450);
  }
  await p.locator("nav button").filter({hasText:"SQUADRE"}).click(); await w(500);
  await p.locator("main button",{hasText:"＋ Aggiungi un esterno"}).first().click(); await w(300);
  await p.getByPlaceholder("Nome (facoltativo)").fill("Marco");
  await p.locator("main button",{hasText:/^[★☆]$/}).nth(3).click(); await w(200);
  await p.locator("main button",{hasText:/^Salva$/}).first().click(); await w(700);
  await p.locator("main button",{hasText:"＋ Aggiungi un esterno"}).first().click(); await w(300);
  await p.locator("main button",{hasText:/^[★☆]$/}).nth(1).click(); await w(300);
  const el=p.locator("main").getByText("CHI GIOCA");
  await el.scrollIntoViewIfNeeded(); await w(300);
  await p.screenshot({path:__dirname+"/s-esterni.png"});
  await b.close();
})();
