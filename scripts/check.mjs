// SquadPulse check: loads every logged deploy link as an anonymous (logged-out) visitor,
// records real HTTP status, marks each link PUBLIC or BLOCKED (login wall), flags silent members,
// and opens a BLOCKWATCH issue for any BLOCKED link. Writes status.json.
import fs from "node:fs";
const d = JSON.parse(fs.readFileSync("deliverables.json","utf8"));
const h = JSON.parse(fs.readFileSync("heartbeats.json","utf8"));
const now = new Date();
const LOGIN_HOST = /(^|\.)vercel\.com$|accounts\.google\.com|github\.com\/login|auth0\.com|clerk\./i;
const LOGIN_BODY = /vercel authentication|log in to vercel|sso-api|_vercel_sso|authentication required|sign in to continue/i;
async function probe(url){
  const t0=Date.now(); let cur=url, hops=0, r;
  try{
    while(true){
      r=await fetch(cur,{redirect:"manual",headers:{"user-agent":"SquadPulse-logged-out-check"},signal:AbortSignal.timeout(15000)});
      const loc=r.headers.get("location");
      if(r.status>=300&&r.status<400&&loc&&hops<5){cur=new URL(loc,cur).toString();hops++;
        if(LOGIN_HOST.test(new URL(cur).host)||/\/login|\/sso/i.test(cur)) return {http:r.status,up:false,access:"BLOCKED",reason:"redirects to login: "+cur,final_url:cur,ms:Date.now()-t0};
        continue;}
      break;
    }
    const body=(await r.text()).slice(0,20000);
    if(r.status===401||r.status===403||LOGIN_BODY.test(body)) return {http:r.status,up:false,access:"BLOCKED",reason:"login wall (HTTP "+r.status+")",final_url:cur,ms:Date.now()-t0};
    const up=r.status>=200&&r.status<400;
    return {http:r.status,up,access:up?"PUBLIC":"DOWN",final_url:cur,ms:Date.now()-t0};
  }catch(e){return {http:null,up:false,access:"DOWN",ms:Date.now()-t0,error:String(e.message||e)};}
}
const deploys=[];
for(const p of d.projects){deploys.push({name:p.name,owner:p.owner,deploy:p.deploy,repo:p.repo,...(await probe(p.deploy))});}
const lim=h.silence_minutes||60;
const members=h.members.map(m=>{const mins=Math.round((now-new Date(m.last_seen))/60000);return {...m,minutes_since:mins,silent:mins>lim};});
const out={checked_at:now.toISOString(),trigger:process.env.GITHUB_EVENT_NAME||"local",run_url:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null,
  silence_minutes:lim,up:deploys.filter(x=>x.up).length,down:deploys.filter(x=>!x.up).length,
  public:deploys.filter(x=>x.access==="PUBLIC").length,blocked:deploys.filter(x=>x.access==="BLOCKED").length,deploys,members};
fs.writeFileSync("status.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out,null,2));
for(const x of deploys) console.log(`${x.access.padEnd(8)} ${x.http??"-"} ${x.deploy}`);
// BlockWatch: open (or update) one issue per BLOCKED link; close it when the link is PUBLIC again.
const tok=process.env.GITHUB_TOKEN, repo=process.env.GITHUB_REPOSITORY;
if(tok&&repo){
  const api=(p,o={})=>fetch(`https://api.github.com/repos/${repo}${p}`,{...o,headers:{authorization:`Bearer ${tok}`,accept:"application/vnd.github+json","content-type":"application/json"}}).then(r=>r.json());
  const open=await api(`/issues?state=open&labels=blockwatch&per_page=100`);
  const list=Array.isArray(open)?open:[];
  for(const x of deploys){
    const title=`BLOCKWATCH: ${x.name} is behind a login wall`;
    const ex=list.find(i=>i.title===title);
    if(x.access==="BLOCKED"){
      const body=`Blocked: anonymous visitors to ${x.name}\nBlocking: ${x.reason}\nLink: ${x.deploy}\nOwner: ${x.owner}\nSince: ${out.checked_at}\nRun: ${out.run_url}`;
      if(ex) await api(`/issues/${ex.number}/comments`,{method:"POST",body:JSON.stringify({body:`Still BLOCKED at ${out.checked_at} (${out.run_url})`})});
      else await api(`/issues`,{method:"POST",body:JSON.stringify({title,body,labels:["blockwatch"]})});
    } else if(ex && x.access==="PUBLIC"){
      await api(`/issues/${ex.number}/comments`,{method:"POST",body:JSON.stringify({body:`PUBLIC again at ${out.checked_at}. Closing.`})});
      await api(`/issues/${ex.number}`,{method:"PATCH",body:JSON.stringify({state:"closed"})});
    }
  }
}
if(out.blocked) console.log(`::warning::${out.blocked} link(s) BLOCKED by login wall`);
if(out.down) console.log(`::warning::${out.down} deploy(s) not public`);
for(const m of members) if(m.silent) console.log(`::warning::${m.name} silent ${m.minutes_since} min`);
