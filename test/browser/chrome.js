/* Dov'è Chromium: CHROME se lo dici tu, se no il primo che si trova fra
   quelli preinstallati. La versione cambia da un container all'altro,
   quindi niente percorsi scritti a mano. */
const fs=require('fs'), path=require('path');
module.exports=()=>{
  if(process.env.CHROME)return process.env.CHROME;
  const radice=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';
  try{
    for(const d of fs.readdirSync(radice).filter(x=>/^chromium-\d+$/.test(x)).sort().reverse())
      for(const sotto of ['chrome-linux64','chrome-linux']){
        const f=path.join(radice,d,sotto,'chrome');
        if(fs.existsSync(f))return f;
      }
  }catch(e){}
  return undefined;   // lascia fare a Playwright
};
