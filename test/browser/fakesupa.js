/* ═══════════════════════════════════════════════════════════════════
   Un finto Supabase che vive dentro la pagina.
   Serve per provare l'app in un browser vero senza toccare il database
   di nessuno: stessa forma di risposte, stesse regole, tutto in memoria.
   Si inietta PRIMA che la pagina parta (addInitScript).
═══════════════════════════════════════════════════════════════════ */
(()=>{
  const DK="__fakedb__", SK="__fakesess__";
  const uuid=()=>"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
    const r=Math.random()*16|0; return (c==="x"?r:(r&0x3|0x8)).toString(16);});
  const VUOTO=()=>({users:[],groups:[],group_members:[],selections:[],photos:[],board:[],live_codes:[],live_goals:[]});
  const load=()=>{try{return JSON.parse(localStorage.getItem(DK))||VUOTO();}catch(e){return VUOTO();}};
  const save=d=>localStorage.setItem(DK,JSON.stringify(d));
  const rows=(d,t)=>(d[t]=d[t]||[]);
  const ok=data=>({data,error:null});
  const ko=msg=>({data:null,error:{message:msg}});

  window.__fakedb=()=>load();
  window.__setdb=d=>save(d);
  window.__whoami=()=>{try{return JSON.parse(localStorage.getItem(SK)||"null");}catch(e){return null;}};
  window.__loginAs=(email,pass)=>{
    const d=load(); let u=d.users.find(x=>x.email===email);
    if(!u){u={id:uuid(),email,pass};d.users.push(u);save(d);}
    localStorage.setItem(SK,JSON.stringify({user:{id:u.id,email:u.email}}));
    return u.id;
  };

  const chans=[];
  const fire=(table,row)=>chans.forEach(c=>c.handlers.forEach(h=>{
    if(h.cfg.table===table)try{h.cb({new:row,eventType:"UPDATE"});}catch(e){}}));
  /* una scrittura "da un altro telefono": aggiorna e sveglia il tempo reale */
  window.__asOther=(table,match,patch)=>{
    const d=load(), r=rows(d,table).find(x=>Object.keys(match).every(k=>x[k]===match[k]));
    if(!r)return false;
    Object.assign(r,patch); save(d); fire(table,r); return true;
  };

  const uid=()=>{const s=window.__whoami();return s&&s.user&&s.user.id;};
  const isMember=gid=>{const d=load();return !!rows(d,"group_members").find(m=>m.group_id===gid&&m.user_id===uid());};
  const myPlayer=gid=>{const d=load();const m=rows(d,"group_members").find(x=>x.group_id===gid&&x.user_id===uid());return m&&m.player_id;};
  const partita=(d,gid,mid)=>{
    const g=rows(d,"groups").find(x=>x.id===gid);
    return ((g&&g.data&&g.data.matches)||[]).find(m=>m.id===mid)||null;
  };

  /* ─── la catena .from(t).select().eq()… ─── */
  function query(table){
    const st={table,filtri:[],campi:"*",azione:"select",payload:null};
    const applica=()=>{
      const d=load();
      return rows(d,table).filter(r=>st.filtri.every(f=>
        f.op==="eq"?r[f.k]===f.v:(f.op==="gt"?String(r[f.k]||"")>String(f.v):true)));
    };
    const esegui=()=>{
      const d=load();
      if(st.azione==="select"){
        if(table==="board"&&!isMember((st.filtri.find(f=>f.k==="group_id")||{}).v))return [];
        return applica();
      }
      if(st.azione==="insert"||st.azione==="upsert"){
        const lista=Array.isArray(st.payload)?st.payload:[st.payload];
        const out=lista.map(p0=>{
          /* Il gruppo nuovo: nel database vero ci pensa un trigger a dargli
             il codice invito e a iscrivere chi l'ha creato come admin. */
          const p=table==="groups"&&st.azione==="insert"
            ? Object.assign({code:Math.random().toString(36).slice(2,8).toUpperCase(),
                             data:{players:[],matches:[]}},p0)
            : p0;
          const chiavi=table==="photos"?["group_id","player_id"]
                      :table==="selections"||table==="board"?["group_id"]:["id"];
          let r=rows(d,table).find(x=>chiavi.every(k=>x[k]===p[k]));
          if(r&&st.azione==="insert"&&table!=="groups")return r;
          if(r){Object.assign(r,p);}
          else{
            r=Object.assign({id:p.id||uuid(),created_at:new Date().toISOString()},p);
            rows(d,table).push(r);
            if(table==="groups")rows(d,"group_members").push(
              {group_id:r.id,user_id:uid(),role:"admin",player_id:null,member_name:null});
          }
          return r;
        });
        save(d); out.forEach(r=>fire(table,r));
        return out;
      }
      if(st.azione==="update"){
        const tocc=rows(d,table).filter(r=>st.filtri.every(f=>f.op!=="eq"||r[f.k]===f.v));
        /* come il database vero: se la regola non ti fa scrivere non torna
           un errore, tornano zero righe. È il caso che ci ha fatto perdere
           una partita intera, quindi qui si imita davvero. */
        const liberi=table==="groups"||table==="board"||table==="selections"||table==="group_members"
          ? tocc.filter(r=>isMember(r.group_id||r.id)) : tocc;
        liberi.forEach(r=>Object.assign(r,st.payload));
        save(d); liberi.forEach(r=>fire(table,r));
        return liberi;
      }
      if(st.azione==="delete"){
        const via=applica(); d[table]=rows(d,table).filter(r=>via.indexOf(r)<0); save(d); return via;
      }
      return [];
    };
    const api={
      select(c){st.campi=c||"*"; if(st.azione==="select")st.azione="select"; return api;},
      insert(p){st.azione="insert";st.payload=p;return api;},
      upsert(p){st.azione="upsert";st.payload=p;return api;},
      update(p){st.azione="update";st.payload=p;return api;},
      delete(){st.azione="delete";return api;},
      eq(k,v){st.filtri.push({op:"eq",k,v});return api;},
      gt(k,v){st.filtri.push({op:"gt",k,v});return api;},
      in(k,v){st.filtri.push({op:"in",k,v});return api;},
      order(){return api;}, limit(){return api;},
      single(){const r=esegui();return Promise.resolve(r.length?ok(r[0]):ko("nessuna riga"));},
      maybeSingle(){const r=esegui();return Promise.resolve(ok(r.length?r[0]:null));},
      then(res,rej){try{return Promise.resolve(ok(esegui())).then(res,rej);}catch(e){return Promise.resolve(ko(String(e))).then(res,rej);}}
    };
    return api;
  }

  /* ─── le funzioni del database ─── */
  const RPC={
    join_group(a){
      const d=load(); const g=rows(d,"groups").find(x=>x.code===String(a.p_code||"").toUpperCase());
      if(!g)return ko("codice non valido");
      if(!rows(d,"group_members").find(m=>m.group_id===g.id&&m.user_id===uid()))
        rows(d,"group_members").push({group_id:g.id,user_id:uid(),role:"member",player_id:null,member_name:null});
      save(d); return ok(g.id);
    },
    save_data(a){
      const d=load(); const g=rows(d,"groups").find(x=>x.id===a.p_group);
      if(!g)return ko("gruppo non trovato");
      if(!isMember(a.p_group))return ko("non sei in questo gruppo");
      g.data=a.p_data; g.updated_at=new Date().toISOString(); save(d); fire("groups",g); return ok(true);
    },
    set_callup(a){
      const d=load(); let b=rows(d,"board").find(x=>x.group_id===a.p_group);
      if(!b){b={group_id:a.p_group,settings:{},callups:{},votes:{}};rows(d,"board").push(b);}
      const cur=Object.assign({},b.callups||{});
      const g=Object.assign({},cur[a.p_date]||{});
      if(a.p_value)g[a.p_player]={v:a.p_value}; else delete g[a.p_player];
      cur[a.p_date]=g; b.callups=cur; save(d); fire("board",b); return ok(cur);
    },
    /* il voto: scrive sotto il nome di chi vota, o di chi gli ha dettato
       il voto (p_who). Stesse regole della funzione vera. */
    set_vote(a){
      const d=load();
      if(!isMember(a.p_group))return ko("non sei in questo gruppo");
      const part=partita(d,a.p_group,a.p_match);
      if(!part)return ko("partita non trovata");
      const io=a.p_who||myPlayer(a.p_group);
      if(!io)return ko("non sei collegato a un giocatore della rosa");
      const gioca=id=>(part.white||[]).indexOf(id)>=0||(part.black||[]).indexOf(id)>=0;
      if(!gioca(io))return ko("si vota solo per chi ha giocato questa partita");
      let b=rows(d,"board").find(x=>x.group_id===a.p_group);
      if(!b){b={group_id:a.p_group,settings:{},callups:{},votes:{}};rows(d,"board").push(b);}
      const cur=Object.assign({},b.votes||{});
      const bl=Object.assign({},cur[a.p_match]||{});
      if(a.p_round==="r1"){
        if(!a.p_a||!a.p_b)return ko("servono due voti: un bianco e un nero");
        if((part.white||[]).indexOf(a.p_a)<0)return ko("il primo voto va a un giocatore dei bianchi");
        if((part.black||[]).indexOf(a.p_b)<0)return ko("il secondo voto va a un giocatore dei neri");
        bl.r1=Object.assign({},bl.r1||{}); bl.r1[io]={w:a.p_a,b:a.p_b};
      }else if(a.p_round==="r2"){
        if(!a.p_a)return ko("serve un voto");
        bl.r2=Object.assign({},bl.r2||{}); bl.r2[io]=a.p_a;
      }else if(a.p_round==="close1")bl.closed1=true;
      else if(a.p_round==="close2")bl.closed2=true;
      else if(a.p_round==="reset"){Object.keys(bl).forEach(k=>delete bl[k]);}
      else return ko("turno non valido");
      cur[a.p_match]=bl; b.votes=cur; save(d); fire("board",b); return ok(cur);
    },
    claim_new_player(a){
      const d=load(); const g=rows(d,"groups").find(x=>x.id===a.p_group);
      const pid=Math.random().toString(36).slice(2,11);
      g.data=Object.assign({},g.data||{},{players:((g.data||{}).players||[]).concat({id:pid,name:a.p_name,base:{presences:0,wins:0,goals:0,mvps:0}})});
      const m=rows(d,"group_members").find(x=>x.group_id===a.p_group&&x.user_id===uid());
      if(m){m.player_id=pid;m.member_name=a.p_name;}
      save(d); fire("groups",g); return ok(pid);
    },
    live_code(a){return ok("ABCD1234");},
    live_rotate(a){return ok("EFGH5678");}
  };

  const fakeClient={
    auth:{
      getSession:()=>Promise.resolve(ok({session:window.__whoami()})),
      getUser:()=>Promise.resolve(ok({user:(window.__whoami()||{}).user||null})),
      onAuthStateChange:cb=>{window.__authcb=cb;return{data:{subscription:{unsubscribe(){}}}};},
      signUp:({email,password})=>{
        const d=load();
        if(d.users.find(u=>u.email===email))return Promise.resolve(ko("utente già esistente"));
        const id=window.__loginAs(email,password);
        if(window.__authcb)setTimeout(()=>window.__authcb("SIGNED_IN",window.__whoami()),0);
        return Promise.resolve(ok({user:{id,email}}));
      },
      signInWithPassword:({email,password})=>{
        const d=load(); const u=d.users.find(x=>x.email===email);
        if(!u||u.pass!==password)return Promise.resolve(ko("credenziali non valide"));
        window.__loginAs(email,password);
        if(window.__authcb)setTimeout(()=>window.__authcb("SIGNED_IN",window.__whoami()),0);
        return Promise.resolve(ok({user:{id:u.id,email}}));
      },
      signOut:()=>{localStorage.removeItem(SK);
        if(window.__authcb)setTimeout(()=>window.__authcb("SIGNED_OUT",null),0);
        return Promise.resolve(ok(null));},
      resetPasswordForEmail:()=>Promise.resolve(ok(null))
    },
    from:t=>query(t),
    rpc:(nome,args)=>{
      const f=RPC[nome];
      if(!f)return Promise.resolve(ko('function public.'+nome+' does not exist'));
      try{return Promise.resolve(f(args||{}));}catch(e){return Promise.resolve(ko(String(e&&e.message||e)));}
    },
    channel(nome){
      const c={nome,handlers:[],on(_e,cfg,cb){this.handlers.push({cfg,cb});return this;},subscribe(){chans.push(c);return c;}};
      return c;
    },
    removeChannel(c){const i=chans.indexOf(c);if(i>=0)chans.splice(i,1);}
  };

  window.supabase={createClient:()=>fakeClient};
})();
