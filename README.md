# Coresearch

A portable Agent Skill that helps a prospective PhD student develop a defensible research direction, with a local Next.js UI and SQLite storage.

Requires Node.js 24.14+ (24.x). Run `npm ci`, then follow [SKILL.md](SKILL.md). Intent: [docs/product.md](docs/product.md). Visual rules: [DESIGN.md](DESIGN.md).

Checks: `npm run check`, `npm run build`, `npm run test:app`.

Personal data stays in the chosen workspace and out of Git. The database is local and unencrypted; the server is unauthenticated and binds to `127.0.0.1`.

License: [MIT](LICENSE).
