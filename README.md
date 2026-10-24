# Coresearch

Find the right PhD professors and a research direction you can defend. Coresearch is an open-source Agent Skill with a local app: your AI coding agent reads professors' papers, ranks them by the kinds of fit you care about, drafts outreach you send yourself, and for research-proposal programmes tests research directions until only defensible ones survive. Every claim quotes its source.

Website: [praveen221.github.io/coresearch](https://praveen221.github.io/coresearch/)

## Install

Requires [Node.js 22](https://nodejs.org) (22.0 or newer), Git, and an AI agent that can run commands on your computer: Claude Code (terminal, desktop app, or IDE), Codex, Cursor, or similar.

Claude Code: paste this into a session.

> Install the Coresearch skill from https://github.com/praveen221/coresearch into ~/.claude/skills/coresearch, then set it up.

Other agents: run `git clone https://github.com/praveen221/coresearch`, then tell your agent: “Read coresearch/SKILL.md and set up Coresearch.”

Your agent asks where to keep your research, builds the app, and opens it at `http://127.0.0.1:3780`. To update, say “update Coresearch”; your research is not changed.

## Use

Tell your agent about yourself, upload your CV, and add professors one at a time or as a Google Sheet. Then ask it to rank them, draft pitches, or start researching directions with a professor. The app shows what to do next, every professor ranked by fit, each research direction with its evidence, and the drafts to review.

Research runs in batches you approve. Each guess costs about half a million tokens and 40 minutes of agent time; use your agent's strongest reasoning setting for research.

## Share

- **A report anyone can read:** the app's Share page (or `npm run coresearch -- export`) writes a folder with a report that opens in any browser, the full database, and JSON. Your CV stays out unless you include it.
- **Live access for a collaborator:** both install [Tailscale](https://tailscale.com) and you share your computer with them. Then run `tailscale serve --bg 3780`, `npm run coresearch -- stop`, and `npm run coresearch -- start --share <machine>.<tailnet>.ts.net`, and send them `https://<machine>.<tailnet>.ts.net`. Only people you share the machine with can open it; your computer must stay on.

## Privacy

Your data stays in the folder you choose, on your computer. The database is local and unencrypted, the app has no login and listens only on `127.0.0.1`, and nobody is contacted on your behalf.

## Develop

Intent: [docs/product.md](docs/product.md). Visual rules: [DESIGN.md](DESIGN.md). Contributor rules: [AGENTS.md](AGENTS.md). Use `--workspace <repository>/private` for development data.

Checks: `npm run check`, `npm run build`, `npm run test:app`.

License: [MIT](LICENSE).
