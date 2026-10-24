---
name: coresearch
description: Help a prospective PhD student find the right professors and a research direction they can defend. Sets up a local workspace and app; saves the student's profile, CV, ideas, and professor list; ranks professors by the kinds of fit the student chooses, with quoted evidence; drafts outreach the student edits and sends; and for proposal programmes runs evidence-backed research tracks with independent review. Use for Coresearch setup, updates, profile, professors, outreach, research, sharing, and export.
---

# Coresearch

Requires a local agent with filesystem and shell access, Node.js 24.14+ (24.x), npm, and localhost server support. First installation requires network access. Works in Claude Code (terminal, desktop app, IDE extensions), Codex, Cursor, and other agents that can run commands and keep a local server running; not in browser-only chat.

Run commands from this skill's directory, located relative to this `SKILL.md`; never assume the caller's current directory is the package. Prefer `npm run -s coresearch --` so npm does not print its script banner. All agents use the same commands and application.

## Setup and reopen

1. First installation (no `node_modules` in this directory): run `npm ci`.
2. Run `npm run -s coresearch -- workspace`. It prints JSON: `{"workspace":"<absolute-path>"}`, or `{"workspace":null}` before the first setup.
3. If `workspace` is null: ask the student where Coresearch should keep their research. Suggest `~/Documents/Coresearch`; any folder name and location is fine, including an existing folder, a copy of someone's workspace, or an unzipped export. Expand `~` to an absolute path. Coresearch supports one workspace per installation. Then run `npm run -s coresearch -- setup --workspace <absolute-path>`. Setup creates or preserves the database, remembers the folder, and builds the UI. It refuses a folder inside a Git repository unless the repository ignores it.
4. Run `npm run -s coresearch -- start`. Repeated starts reuse a healthy instance. The command prints `url` when startup succeeds; give the student that URL.
5. Read saved data with `profile:get`, `idea:list`, and `target:list` before asking for information.

After setup, omit `--workspace`; every command uses the remembered folder. Role briefs still pass `--workspace` so a sub-agent does not depend on remembered settings. For development in this repository, use `setup --workspace <repository>/private`. Write commands take JSON on stdin (`< file`); a command with no stdin fails. Run `guide` only when starting fit, pitch, or research, not during profile setup.

Code lives in this skill's directory; the student's data lives in the workspace, and updates replace code only. If your current working directory is not the workspace or inside it, end your first reply of the session with one line: “Tip: open your agent in <workspace> for fewer permission prompts.” Say it once per session.

## Updating Coresearch

When the student asks to update Coresearch, run `npm run coresearch -- update` from this skill's directory. It updates only this installation, refuses if the installation has local changes, and restarts the app when new code arrives. Report the result; never run `git pull` yourself.

## Chat updates

Run `npm run coresearch -- profile:schema` for the accepted update fields. Supply JSON on stdin to `npm run coresearch -- profile:update`; use a securely written temporary input file if needed, not interpolated shell text.

- Save only explicitly supplied information. Unknown fields stay unknown. Ask when a statement is ambiguous.
- Scalar updates replace that field; omitted fields are preserved. Add/remove interests, constraints, and collaborators explicitly; do not replace earlier items implicitly.
- Use these commands, not ad hoc SQL. Acknowledge a save only when the command succeeds. On failure, report the error and preserve the intended update for correction.
- The student may edit the profile in the UI at any time; run `profile:get` before relying on saved values.
- Keep conversation concise. Do not invent labs, start research, contact anyone, or regenerate the UI during updates.

## Professors

A target is one specific professor. When the student names a lab, professor, or university:

1. Ask whether the lab is part of a university or independent.
2. Require one specific professor. General applications to a lab or university are not accepted; ask until one is named.
3. University lab: ask for the university; the lab name is optional. Independent lab: ask for its name and partner university, which may stay unknown.
4. Ask whether this programme wants a research proposal or a contact pitch. Region picks a default (UK and Europe → proposal; elsewhere → pitch); do not rely on the default without asking.
5. Ask for links: the professor's page, the PhD programme page, and the lab website if one exists. Publication profiles and an advertised position also help. Several links of each kind are allowed.
6. You may search for missing links, but save one only after the student confirms it belongs to this professor.

Run `npm run coresearch -- target:schema` for accepted fields. Use `target:add` (JSON on stdin), `target:list`, `target:get --id <id>`, `target:update --id <id>` (JSON on stdin), and `target:remove --id <id>`. Remove a target only when the student asks. The student may also add or edit targets in the UI; run `target:get` before relying on saved values. A whole list imports from a Google Sheet or CSV with `list:preview` and `list:import`.

## Research, fit, and outreach

Run `npm run coresearch -- guide` and follow it. It lists the rules and every step, with the commands to use: CV and collaborators, professor lists, kinds of fit, pitches, programme rules, the paper library, seeds, batches of guesses, investigation, review, and the shortlist. Never present a quotation except the JSON returned by `clip:add` or a score command; if `clip:add` rejects the words, copy them from `source:text --id <id> --page <n>` instead of rephrasing.

Independent work runs as roles. `npm run coresearch -- role <name> --target <id>` (or `--track <id>`) prints a complete brief for a fresh agent: `seed-scanner`, `drafter`, `critic`, `investigator`, `reviewer`, `fit-scorer`, `pitch-writer`. If your agent can start sub-agents, give each brief to one; otherwise run it in a new session. Never let the agent that drafted or investigated a track also review it. Run no more investigators at once than the student's limit (`settings:get`).

Use your agent's strongest reasoning setting for drafting, investigating, and reviewing; lighter settings are fine for profile, list, and pitch edits. Before a batch, tell the student its cost: about half a million tokens and 30 to 45 minutes of agent time per guess.

## Sharing

- Export: `npm run coresearch -- export` writes a folder in the workspace with a report anyone can open in a browser, the full database, and JSON. Optional JSON on stdin (`pitches`, `notes`, `cv`, `texts`; `export:list` shows the defaults). The CV is left out unless the student asks. `texts` adds the saved text of every paper and page, so another computer can continue the research from the unzipped folder. The student can also export from the app's Share page.
- Live access for a collaborator over Tailscale: the student runs `tailscale serve --bg <port>`, then `npm run coresearch -- stop` and `npm run coresearch -- start --share <machine>.<tailnet>.ts.net`, and sends the collaborator `https://<machine>.<tailnet>.ts.net`. Only people the machine is shared with can open it, and the computer must stay on.

## Server control

`npm run coresearch -- status` reports availability. `stop` stops only an instance whose saved identity matches its health response. `start` accepts `--port <number>` (default 3780) and `--share <host>`.

The UI refreshes saved data every two seconds while visible. The local server can outlive the chat; it does not continue agent work and does not start automatically after a computer restart.

Installation paths and permissions vary by agent. Skill-format compatibility does not bypass host approvals or guarantee identical agent behavior.
