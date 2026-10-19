# Coresearch

A portable Agent Skill that helps a prospective PhD student develop a defensible research direction, with a local Next.js UI and SQLite storage.

## Install

Requires [Claude Code](https://claude.com/claude-code), [Node.js 24](https://nodejs.org) (24.14 or newer), and Git. Open Claude Code and paste:

> Install the Coresearch skill from https://github.com/praveen221/coresearch into ~/.claude/skills/coresearch, then set it up.

Your information is kept in the `Coresearch` folder in your home folder. Open Claude Code there for later sessions. To update, say “update Coresearch”; your information is not changed.

Other agents: clone this repository into their skills directory and follow [SKILL.md](SKILL.md).

## Develop

Intent: [docs/product.md](docs/product.md). Visual rules: [DESIGN.md](DESIGN.md). Use `--workspace <repository>/private` for development data.

Checks: `npm run check`, `npm run build`, `npm run test:app`.

Personal data stays in the chosen workspace and out of Git. The database is local and unencrypted; the server is unauthenticated and binds to `127.0.0.1`.

License: [MIT](LICENSE).
