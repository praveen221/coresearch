# Coresearch design

Reference: [OpenCode analysis](https://getdesign.md/opencode.ai/design-md), retrieved with `getdesign`. Adapted for the agreed local profile UI; not an official OpenCode design system.

## Visual rules

- Flat warm-white surfaces, near-black text, thin borders. No shadows, gradients, decorative illustrations, or dashboard metrics.
- Monospace throughout. Use the local system monospace stack; Berkeley Mono is not bundled or required.
- Canvas `#fdfcfc`; soft surface `#f8f7f7`; ink `#201d1d`; body `#424245`; secondary `#646262`; border `rgba(15,0,0,.12)`.
- Body 16px/1.5; metadata 14px/1.5; heading 28px/1.5. Use weight 400, 500, or 700.
- Spacing: 4, 8, 12, 16, 24, 32px. Interactive radius 4px; content sections square.
- Use Radix Themes components directly. Shared CSS variables define visual values. CSS Modules handle application layout.
- Use text/bracket markers where helpful. No logo imitation or additional icon library.
- Preserve visible keyboard focus, semantic headings, readable contrast, and reduced-motion preferences.

## Initial interface

- Left navigation: Profile, then expandable Workspace with an empty lab list.
- Main view: profile information, editable in place; updates from chat also appear. No in-app chat.
- Unknown fields say “Not provided.” Funding remains unknown until stated.
- Show saved-update time and a clear message when live refresh fails. Never display sample data as a real profile.
- Narrow screens stack navigation above content; long entries wrap without horizontal scrolling.

The paper investigation board and lab screens are not part of this increment.
