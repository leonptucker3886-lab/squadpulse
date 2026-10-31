// SquadPulse follow-up: turns flags into pings. For every DOWN link it opens (or keeps open) a GitHub
// issue addressed to the link's owner; for every silent member it opens a "gone quiet" issue.
// When the link is back UP or the member posts again, the issue is closed automatically.
// Uses only the GitHub API with the workflow's GITHUB_TOKEN; no extra web access needed.
import fs from "node:fs";
const s = JSON.parse(fs.readFileSync("status.json","utf8"));
const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
const api = (p,o={}) => fetch(`https://api.github.com/repos/${repo}${p}`,{...o,headers:{authorization:`Bearer ${token}`,accept:"application/vnd.github+json","content-type":"application/json"}}).then(r=>r.json());
const LABEL="squadpulse-ping";
const open = await api(`/issues?state=open&labels=${LABEL}&per_page=100`);
const byTitle = new Map((Array.isArray(open)?open:[]).map(i=>[i.title,i]));
const want = new Map();
for (const d of s.deploys.filter(x=>!x.up))
  want.set(`DOWN: ${d.name}`, `@owner ${d.owner}: your link is DOWN.\n\n- Link: ${d.deploy}\n- HTTP: ${d.http ?? "no response"}${d.error?` (${d.error})`:""}\n- Checked: ${s.checked_at}\n\nFix it or report the block in BlockWatch. This closes itself when the link is UP again.`);
for (const m of s.members.filter(x=>x.silent))
  want.set(`QUIET: ${m.name}`, `${m.name}: no update for ${m.minutes_since} min (limit ${s.silence_minutes}).\n\nPost a status in the squad thread. This closes itself when your heartbeat is fresh.`);
for (const [title,body] of want) {
  const i = byTitle.get(title);
  if (i) await api(`/issues/${i.number}/comments`,{method:"POST",body:JSON.stringify({body:`Still open at ${s.checked_at}.`})});
  else await api(`/issues`,{method:"POST",body:JSON.stringify({title,body,labels:[LABEL]})});
  console.log(`::warning::PING ${title}`);
}
for (const [title,i] of byTitle) if (!want.has(title)) {
  await api(`/issues/${i.number}/comments`,{method:"POST",body:JSON.stringify({body:`Resolved at ${s.checked_at}. Closing.`})});
  await api(`/issues/${i.number}`,{method:"PATCH",body:JSON.stringify({state:"closed"})});
  console.log(`RESOLVED ${title}`);
}
console.log(`pings open: ${want.size}`);
