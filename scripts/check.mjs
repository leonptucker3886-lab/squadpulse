// SquadPulse check: loads every logged deploy link, records real HTTP status (never trusts "READY"),
// and flags squad members silent longer than the threshold. Writes status.json.
import fs from "node:fs";
const d = JSON.parse(fs.readFileSync("deliverables.json","utf8"));
const h = JSON.parse(fs.readFileSync("heartbeats.json","utf8"));
const now = new Date();
async function probe(url){
  const t0=Date.now();
  try{
    const r=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(15000)});
    return {http:r.status,up:r.status>=200&&r.status<400,ms:Date.now()-t0};
  }catch(e){return {http:null,up:false,ms:Date.now()-t0,error:String(e.message||e)};}
}
const deploys=[];
for(const p of d.projects){deploys.push({name:p.name,owner:p.owner,deploy:p.deploy,repo:p.repo,...(await probe(p.deploy))});}
const lim=h.silence_minutes||60;
const members=h.members.map(m=>{const mins=Math.round((now-new Date(m.last_seen))/60000);return {...m,minutes_since:mins,silent:mins>lim};});
const out={checked_at:now.toISOString(),silence_minutes:lim,up:deploys.filter(x=>x.up).length,down:deploys.filter(x=>!x.up).length,deploys,members};
fs.writeFileSync("status.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out,null,2));
if(out.down) console.log(`::warning::${out.down} deploy(s) DOWN`);
for(const m of members) if(m.silent) console.log(`::warning::${m.name} silent ${m.minutes_since} min`);
