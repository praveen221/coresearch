# Coresearch

Find the right PhD professors and a research direction you can defend. Coresearch is an open-source Agent Skill with a local app: your AI coding agent reads professors' papers, ranks them by the kinds of fit you care about, drafts outreach you send yourself, and for research-proposal programmes tests research directions until only defensible ones survive. Every claim quotes its source.

Website: [praveen221.github.io/coresearch](https://praveen221.github.io/coresearch/)

## Prerequisites

- [Node.js 24.14 or newer](https://nodejs.org) (the current 24.x line; not Node 22). Check with `node -v`.
- Git, npm, and an AI agent that can run commands on your computer and keep a local server running: Claude Code (terminal, desktop app, or IDE), Cursor, Codex, or similar. Not a browser-only chat.
- First install needs network access. The app then listens on `127.0.0.1` only.

## Install

**Claude Code.** Clone into your personal skills folder, then start a session in that folder (or tell Claude to read `SKILL.md`):

```bash
git clone https://github.com/praveen221/coresearch.git ~/.claude/skills/coresearch
```

Or paste: “Install the Coresearch skill from https://github.com/praveen221/coresearch into ~/.claude/skills/coresearch, then set it up.”

**Cursor.** Clone the repo and open it, or copy it to `.cursor/skills/coresearch` in a project (or `~/.cursor/skills/coresearch` for every project). Then: “Read SKILL.md and set up Coresearch.”

**Codex and other agents.** `git clone https://github.com/praveen221/coresearch`, then: “Read coresearch/SKILL.md and set up Coresearch.”

Your agent asks where to keep your research, runs `npm ci`, builds the app, and opens it at `http://127.0.0.1:3780`. To update, say “update Coresearch”; your research is not changed.

## Quickstart

1. Confirm `node -v` prints `v24.14` or newer.
2. Install the skill as above.
3. Tell the agent: “Read SKILL.md and set up Coresearch.”
4. When it asks where to keep your research, pick a folder. `~/Documents/Coresearch` is fine. Do not pick a folder inside a Git repo unless that repo ignores it (in this repository, `private/` is ignored).
5. Open the URL it prints, usually `http://127.0.0.1:3780`. Tell it about yourself, upload a CV, and add professors.

## Example session

You: I’m applying to Katie Seaborn at Institute of Science Tokyo, and I have a list of other professors.

Agent: sets up the workspace, starts the app, asks whether each programme wants a **research proposal** or a **contact pitch** (do not let region decide silently), saves the professor, and asks for your CV.

You: upload the CV on the Profile page, or give the agent the PDF path.

You: Rank them, then draft a pitch for the US ones.

Agent: runs the fit-scorer and pitch-writer roles, shows scores with quotes in the app. You edit the email and send it yourself.

You: For the UK ones, start researching directions.

Agent: tells you the cost (about half a million tokens and 30–45 minutes per guess), waits for your approval, then investigates. You decide which directions survive.

## Use

Tell your agent about yourself, upload your CV, and add professors one at a time or as a Google Sheet. Then ask it to rank them, draft pitches, or start researching directions with a professor. The app shows what to do next, every professor ranked by fit, each research direction with its evidence, and the drafts to review.

Research runs in batches you approve. Each guess costs about half a million tokens and 30 to 45 minutes of agent time; use your agent's strongest reasoning setting for research.

## Share

- **A report anyone can read:** the app's Share page (or `npm run coresearch -- export`) writes a folder with a report that opens in any browser, the full database, and JSON. Your CV stays out unless you include it.
- **Live access for a collaborator:** both install [Tailscale](https://tailscale.com) and you share your computer with them. Then run `tailscale serve --bg 3780`, `npm run coresearch -- stop`, and `npm run coresearch -- start --share <machine>.<tailnet>.ts.net`, and send them `https://<machine>.<tailnet>.ts.net`. Only people you share the machine with can open it; your computer must stay on.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `engine Not compatible` / required `>=24.14.0` | Node 22 (or older) is on `PATH`. Install Node 24.14+ and check `node -v`. |
| `{"workspace":null}` or “not set up yet” | First run: tell the agent to run `setup --workspace <absolute-path>`. |
| Folder “is inside the Git repository” | Choose a folder outside the repo, or one the repo ignores (`private/` in this checkout). |
| `Run setup before start.` | Setup builds the UI. Run setup once, then start. |
| `Supply JSON on stdin` / `Unexpected end of JSON input` | Write commands need JSON piped in, e.g. `echo '{"name":"Ada"}' \| npm run coresearch -- profile:update`. |
| `Coresearch is already running` / port in use | `npm run coresearch -- stop`, or `start --port 3781`. |
| `Server exited. Inspect …/server.log` | Open that log in your workspace folder. |
| App will not open after a reboot | The server does not start itself. Ask the agent to start Coresearch. |
| Permission prompts every command | Open the agent in your workspace folder (the path `workspace` printed). |

## Privacy

Your data stays in the folder you choose, on your computer. The database is local and unencrypted, the app has no login and listens only on `127.0.0.1`, and nobody is contacted on your behalf.

## Develop

Intent: [docs/product.md](docs/product.md). Visual rules: [DESIGN.md](DESIGN.md). Contributor rules: [AGENTS.md](AGENTS.md). Use `--workspace <repository>/private` for development data.

Checks: `npm run check`, `npm run build`, `npm run test:app`.

License: [MIT](LICENSE).
