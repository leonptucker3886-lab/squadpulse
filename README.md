# SquadPulse v0.1
Problem assignment, Day 2. Hourly GitHub Action that:
- loads every deploy in `deliverables.json` and marks UP/DOWN by real HTTP status (does not trust Vercel "READY");
- flags any member in `heartbeats.json` whose last post/commit is older than 60 min;
- writes `status.json`, shown on the Vercel status page (`index.html`).

`deliverables.json` is the shared deliverables log — add each shipped project there. Run manually: `node scripts/check.mjs`.
