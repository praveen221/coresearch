# Coresearch

- Preserve information; use the fewest words possible.
- Code and tests are the only source of truth for behavior. Do not add docs that restate code. `docs/product.md` holds intent only; delete its workflow steps once code implements them.
- No comments anywhere; ESLint (`coresearch/no-comments`) and `tests/style.test.ts` enforce it. Design discussions stay in chat or scratch files and are deleted after the build.
- Read `docs/product.md` before changing scope.
- Read `DESIGN.md` before UI work. Use Radix Themes and shared tokens; no Tailwind or invented design system.
- Keep the skill portable: standard `SKILL.md`, relative package paths, ordinary CLI commands. No required agent-specific APIs.
- All application code and utilities use strict TypeScript. Validate inputs and database results. No `any`, non-null assertions, error suppressions, or unchecked type assertions.
- Keep database behavior in shared server-side functions. Chat (CLI) and UI (Server Actions) both write through them; HTTP API routes stay read-only.
- Run `npm run check` and `npm run build` before delivery. Never skip failing checks.
- Never commit personal data or generated research. Do not commit changes unless requested.
