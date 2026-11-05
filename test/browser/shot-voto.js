const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',proxy:{server:'http://127.0.0.1:1',bypass:'localhost,127.0.0.1'}});
  const ctx=await b.newContext({viewport:{width:390,height:1000},deviceScaleFactor:2});
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
  for(const n of ["Perro","Bisseck","Luca","Ale","Fo"]){
    await p.getByText("＋ Aggiungi giocatore").click();
    await p.getByPlaceholder("Nome giocatore…").fill(n);
    await p.getByText("Aggiungi",{exact:true}).click(); await w(450);
  }
  await p.evaluate(()=>{
    const d=window.__fakedb(), g=d.groups[0];
    const id=n=>(g.data.players.find(x=>x.name===n)||{}).id;
    g.data=Object.assign({},g.data,{matches:[{id:"m1",date:new Date().toISOString().slice(0,10),
      white:[id("Mera"),id("Perro"),id("Bisseck")],black:[id("Luca"),id("Ale"),id("Fo")],
      scoreWhite:5,scoreBlack:3,scorers:{},mvps:[],mvp:null}]});
    window.__asOther("groups",{id:g.id},{data:g.data});
  }); await w(800);
  await p.locator("nav button").filter({hasText:"CLASSIFICA"}).click(); await w(500);
  await p.locator("main button",{hasText:"MVP"}).first().click(); await w(800);
  const sc=async n=>{await p.evaluate(x=>{const b=[...document.querySelectorAll("main button")].find(y=>{const s=y.querySelector("span");return s&&s.textContent.trim().replace(" (tu)","")===x;});b&&b.click();},n);await w(250);};
  await sc("Perro"); await sc("Luca");
  await p.locator("main button",{hasText:/^Vota$/}).click(); await w(900);
  await p.locator("main select").first().selectOption({label:"Bisseck"}); await w(700);
  await sc("Bisseck"); await sc("Fo");
  await p.screenshot({path:__dirname+"/s-voto-altri.png",fullPage:true});
  await b.close();
})();
