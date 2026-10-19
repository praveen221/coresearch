---
name: coresearch
description: Set up a local Coresearch workspace and save the student's profile and target professors or labs from chat into SQLite, with a local UI where the student can also edit them. Use for Coresearch setup, profile and target updates, and reopening the workspace; lab research is not implemented yet.
---

# Coresearch

Requires a local agent with filesystem and shell access, Node.js 24.14+ (24.x), npm, and localhost server support. First installation requires network access.

Run commands from this skill's directory, located relative to this `SKILL.md`; never assume the caller's current directory is the package. All agents use the same commands and application.

## Setup and reopen

1. Use the student's existing workspace. Default: `~/.local/share/coresearch`. An explicitly chosen absolute path overrides it via `--workspace`. Keep personal data outside the installed package. For development in this repository, use `<repository>/private`.
2. First installation or package update: run `npm ci`, then `npm run coresearch -- setup --workspace <absolute-path>`. Setup creates/preserves SQLite and builds the UI. Stop an existing instance before rebuilding.
3. Run `npm run coresearch -- start --workspace <absolute-path>`. Repeated starts reuse a healthy instance. Return the URL only after successful startup.
4. Read saved data with `profile:get` and `target:list` (same `--workspace`) before asking for information.

## Chat updates

Run `npm run coresearch -- profile:schema` for the accepted update fields. Supply JSON on stdin to `npm run coresearch -- profile:update --workspace <absolute-path>`; use a securely written temporary input file if needed, not interpolated shell text.

- Save only explicitly supplied information. Unknown fields stay unknown. Ask when a statement is ambiguous.
- Scalar updates replace that field; omitted fields are preserved. Add/remove interests and constraints explicitly; do not replace earlier items implicitly.
- Use these commands, not ad hoc SQL. Acknowledge a save only when the command succeeds. On failure, report the error and preserve the intended update for correction.
- The student may edit the profile in the UI at any time; run `profile:get` before relying on saved values.
- Keep conversation concise. Do not invent labs, start research, contact anyone, or regenerate the UI during updates.

## Targets

A target is one specific professor. When the student names a lab, professor, or university:

1. Ask whether the lab is part of a university or independent.
2. Require one specific professor. General applications to a lab or university are not accepted; ask until one is named.
3. University lab: ask for the university; the lab name is optional. Independent lab: ask for its name and partner university, which may stay unknown.
4. Ask for links: the professor's page, the PhD programme page, and the lab website if one exists. Publication profiles and an advertised position also help. Several links of each kind are allowed.
5. You may search for missing links, but save one only after the student confirms it belongs to this professor.

Run `npm run coresearch -- target:schema` for accepted fields. Use `target:add` (JSON on stdin), `target:list`, `target:get --id <id>`, `target:update --id <id>` (JSON on stdin), and `target:remove --id <id>`, each with `--workspace`. Remove a target only when the student asks. The student may also add or edit targets in the UI; run `target:get` before relying on saved values.

## Server control

`npm run coresearch -- status --workspace <absolute-path>` reports availability. `stop` stops only an instance whose saved identity matches its health response. `start` accepts `--port <number>` (default 3780).

The UI refreshes saved data every two seconds while visible. The local server can outlive the chat; it does not continue agent work and does not start automatically after a computer restart.

Installation paths and permissions vary by agent. Skill-format compatibility does not bypass host approvals or guarantee identical agent behavior.
