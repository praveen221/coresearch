# Coresearch design

Paper and ink. Reading research should feel like a desk of clippings: cream paper, ink, a highlighter, and tape. The interface around them stays quiet. Values live in `src/app/globals.css` (app) and `docs/index.html` (site); this file holds the rules.

## Materials

- Canvas is cream paper with fine grain. Cards are lighter paper with a soft shadow and no border.
- Cutouts are the only torn, taped objects: evidence clipped from a source, the exact quotation highlighted in its surrounding text, with its source and page. Tape means “cut from a source”; nothing else gets tape. Tilt the paper, never the text.
- Ochre highlighter marks only exact quoted words.
- Coral is the hand: dashed arrows, a circled number, the brand underscore, and what needs the student. Coral text uses the darker coral ink.
- Indigo is the system’s ink: links, actions, selection, done marks, and score dots.
- Lavender is the student: their ideas, their steps in flowcharts, and tape.
- Torn sheets, halftone, and teal appear only on the site, never inside the app.

## Type

- Newsreader for headings and quoted passages; Instrument Sans for the interface; IBM Plex Mono for references, pages, dates, scores, and small uppercase labels.
- Body 16px/1.6; passages 16.5–17px/1.6; labels 11px uppercase with letter spacing. Keep running text near 65 characters.
- Spacing 4, 8, 12, 16, 24, 32, 48px. Radius 2–3px.

## Components

- Radix Themes with the indigo accent and sand grays, themed through shared tokens; CSS Modules for layout. No Tailwind, other component or icon library, or logo imitation.
- Status pairs a glyph with words, never colour alone: ✓ done, ◐ in progress, ○ not yet, ! needs you; reading ○ ◔ ◑ ● ⊘; fit ●●○ with “2 of 3”.
- Verdicts are stamps. Origins are tags; the student’s are lavender.
- Evidence pairs put the CV cutout beside the paper cutout, joined by a dashed coral line. People, grants, and venues are listed under the cutout that names them, each with its own link.
- Flowcharts are paper slips joined by coral dashed arrows; the student’s steps are lavender.

## Rules

- Clean and minimal: one accent per element, generous space, no dashboards or illustration inside the app. No in-app chat; profile fields edit in place and updates from chat appear live.
- The theme follows the system until the student picks Night or Day; picking the system’s own theme follows it again. Night keeps every role on dark paper; check contrast (AA) in both themes.
- The site says what matters in as few words as possible: a heading and one line per section.
- One visible focus ring per control; Radix components keep their own. Semantic headings; reduced motion respected.
- Phones: one column, tables become cards, 40px touch targets, long entries wrap, no horizontal page scroll.
- Unknown fields say “Not provided.” Funding stays unknown until stated. Never show sample data as a real profile.
- Show the saved-update time, and a clear message when live refresh fails.
