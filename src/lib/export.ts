import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { withDatabase } from './database.ts';
import { RuleError } from './errors.ts';
import { listFitKinds } from './fit.ts';
import type { FitKind } from './fit-schema.ts';
import type { Contact, CvCutout, Fit, Pitch } from './outreach-schema.ts';
import { targetOutreach } from './outreach.ts';
import { getOverview } from './overview.ts';
import type { Overview, Stage } from './overview-schema.ts';
import { getProfile } from './profile.ts';
import { getResearch, listIdeas } from './research.ts';
import { clearsBar } from './research-schema.ts';
import type { Clip, Source, Track } from './research-schema.ts';
import { onFinalList } from './target-schema.ts';
import type { Target } from './target-schema.ts';
import { listTargets } from './targets.ts';

export const exportOptionsSchema = z.strictObject({
  pitches: z.boolean().default(true).describe('Include pitch drafts.'),
  notes: z.boolean().default(true).describe('Include the student’s notes from imported lists.'),
  cv: z.boolean().default(false).describe('Include the CV file itself, which carries contact details.'),
});
export const exportFileSchema = z.strictObject({ name: z.string(), path: z.string(), bytes: z.number().int() });
export const exportRecordSchema = z.strictObject({ folder: z.string(), createdAt: z.string(), files: z.array(exportFileSchema) });
export type ExportRecord = z.infer<typeof exportRecordSchema>;
export const exportListSchema = z.array(exportRecordSchema);

interface Professor {
  target: Target; fit: Fit; contacts: Contact[]; pitch: Pitch | null; clips: Clip[]; sources: Source[]; tracks: Track[];
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function cite(source: Source | undefined): string {
  if (source === undefined) return 'Unknown source';
  if (source.kind === 'page') return source.title;
  const author = source.authors[0]?.split(' ').at(-1) ?? source.title;
  return `${author}${source.authors.length > 1 ? ' et al.' : ''} ${String(source.year ?? 'n.d.')}, “${source.title}”`;
}

function link(source: Source | undefined): string {
  if (source === undefined) return '';
  const url = source.url ?? (source.doi === null ? null : `https://doi.org/${source.doi}`);
  return url === null || !/^https?:\/\//.test(url) ? '' : ` · <a href="${esc(url)}">link</a>`;
}

function passage(before: string, quote: string, after: string): string {
  const flat = (text: string): string => text.replace(/\s+/g, ' ');
  return `<blockquote>…${esc(flat(before).slice(-160))} <mark>${esc(quote)}</mark> ${esc(flat(after).slice(0, 160))}…</blockquote>`;
}

function cutout(clip: Clip, sources: readonly Source[]): string {
  const source = sources.find((item) => item.id === clip.sourceId);
  return `<figure class="cutout">${passage(clip.before, clip.quote, clip.after)}<figcaption>[c${String(clip.id)}] ${esc(clip.kind)} · `
    + `${esc(cite(source))}${clip.page === null ? '' : `, p. ${String(clip.page)}`}${link(source)}</figcaption>`
    + `${clip.note === null ? '' : `<p class="note">${esc(clip.note)}</p>`}</figure>`;
}

function cvCutout(cv: CvCutout): string {
  return `<figure class="cutout cv">${passage(cv.before, cv.quote, cv.after)}<figcaption>Student’s CV${cv.page === null ? ''
    : `, p. ${String(cv.page)}`}</figcaption></figure>`;
}

function stages(list: readonly Stage[]): string {
  const marker = { done: '[x]', doing: '[~]', todo: '[ ]', blocked: '[!]' } as const;
  return `<ol class="stages">${list.map((stage) => `<li>${marker[stage.state]} ${esc(stage.label)}${stage.detail === null ? ''
    : ` <span class="muted">· ${esc(stage.detail)}</span>`}</li>`).join('')}</ol>`;
}

function brief(text: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = (): void => {
    if (list.length > 0) out.push(`<ul>${list.join('')}</ul>`);
    list = [];
  };
  for (const line of text.split('\n').map((item) => item.trim())) {
    if (line === '') { flush(); continue; }
    if (line.startsWith('- ')) { list.push(`<li>${esc(line.slice(2))}</li>`); continue; }
    flush();
    out.push(line.startsWith('#') ? `<h5>${esc(line.replace(/^#+\s*/, ''))}</h5>` : `<p>${esc(line)}</p>`);
  }
  flush();
  return out.join('');
}

function distinct(clips: readonly Clip[], kind: Clip['kind']): Clip[] {
  return clips.filter((clip) => clip.kind === kind && clip.trackId === null)
    .filter((clip, index, all) => all.findIndex((other) => other.quote === clip.quote) === index);
}

function fitSection(professor: Professor, kinds: readonly FitKind[]): string {
  const rows = kinds.map((kind) => {
    const value = professor.fit[kind.key];
    return `<tr><th scope="row">${esc(kind.label)}</th><td>${value === undefined ? '·' : value.score === null ? '–' : `${String(value.score)} of 3`}</td>`
      + `<td>${value === undefined ? `<span class="muted">Not checked. ${esc(kind.question)}</span>` : esc(value.finding)}</td></tr>`;
  }).join('');
  const evidence = kinds.flatMap((kind) => {
    const value = professor.fit[kind.key];
    if (value === undefined || value.evidence.length === 0) return [];
    return [`<details><summary>${esc(kind.label)}: why ${value.score === null ? 'not found' : `${String(value.score)} of 3`}</summary>`
      + `<p>${esc(value.reason)}</p>${value.evidence.map((item) => {
        const clip = item.clipId === null ? undefined : professor.clips.find((candidate) => candidate.id === item.clipId);
        return `<div class="pair"><p class="lead">${esc(item.note)}</p>${item.cv === null ? '' : cvCutout(item.cv)}${clip === undefined ? ''
          : cutout(clip, professor.sources)}</div>`;
      }).join('')}<p class="muted">${esc(kind.anchors)} Scored by ${esc(value.reviewer)}.</p></details>`];
  }).join('');
  return `<h3>How well the student fits</h3><table><thead><tr><th>Kind</th><th>Score</th><th>Finding</th></tr></thead><tbody>${rows}</tbody></table>${evidence}`;
}

function contactSection(professor: Professor): string {
  if (professor.contacts.length === 0) return '';
  return `<h3>Shared contacts</h3>${professor.contacts.map((contact) => `<div class="pair"><p class="lead">${esc(contact.collaborator)}`
    + `${contact.note === null ? '' : ` — ${esc(contact.note)}`}${contact.match === 'initial' ? ' <span class="muted">(only surname and initial match)</span>' : ''}</p>`
    + `${contact.cv === null ? '' : cvCutout(contact.cv)}${contact.papers.map((paper) => `<p>Co-authored: ${esc(paper.title)}`
      + `${paper.year === null ? '' : ` (${String(paper.year)})`}. Authors: ${paper.authors.map((name) =>
        name === paper.collaboratorAs || name === paper.professorAs ? `<mark>${esc(name)}</mark>` : esc(name)).join(', ')}</p>`).join('')}</div>`).join('')}`;
}

function adviceSection(professor: Professor): string {
  const criteria = distinct(professor.clips, 'criteria');
  const rules = distinct(professor.clips, 'requirement');
  return (criteria.length === 0 ? '' : `<h3>What ${esc(professor.target.professor)} looks for</h3>${criteria.map((clip) => cutout(clip, professor.sources)).join('')}`)
    + (rules.length === 0 ? '' : `<h3>Application rules</h3>${rules.map((clip) => cutout(clip, professor.sources)).join('')}`);
}

function directionsSection(professor: Professor): string {
  const strong = professor.tracks.filter((track) => track.status === 'strong')
    .sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1) || a.id - b.id);
  if (strong.length === 0) return '';
  return `<h3>Research directions that survived testing (${String(strong.length)})</h3><p class="muted">Each stayed open after the closest work was `
    + 'read. Scores are by an independent reviewer: novelty, depth, lab fit, student fit, and feasibility, 0 to 3 each.</p>'
    + strong.map((track) => {
      const refs = [...new Set([...(track.brief ?? '').matchAll(/\[c(\d+)\]/g)].map((match) => Number(match[1])))];
      const clips = refs.flatMap((ref) => professor.clips.filter((clip) => clip.id === ref)).slice(0, 6);
      const score = track.score;
      return `<article class="direction"><h4>${esc(track.title)}</h4><p class="muted">${score === null ? 'Not scored'
        : `${String(score.total)} of 15 · novelty ${String(score.novelty)}, depth ${String(score.depth)}, lab fit ${String(score.labFit)}, student fit `
          + `${String(score.studentFit)}, feasibility ${String(score.feasibility)}${clearsBar(score) ? ' · clears the bar' : ''}`}</p>`
        + `<p><strong>Question:</strong> ${esc(track.question)}</p>`
        + (track.researchQuestions.length === 0 ? '' : `<ol>${track.researchQuestions.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>`)
        + (track.contribution === null ? '' : `<p><strong>Contribution:</strong> ${esc(track.contribution)}</p>`)
        + (track.brief === null ? '' : `<details><summary>Brief</summary>${brief(track.brief)}</details>`)
        + (clips.length === 0 ? '' : `<details><summary>Key evidence (${String(clips.length)})</summary>${clips.map((clip) => cutout(clip, professor.sources)).join('')}</details>`)
        + '</article>';
    }).join('');
}

function professorSection(professor: Professor, overview: Overview, kinds: readonly FitKind[], pitches: boolean): string {
  const item = overview.proposals.find((entry) => entry.targetId === professor.target.id)
    ?? overview.pitches.find((entry) => entry.targetId === professor.target.id);
  const pitch = pitches ? professor.pitch : null;
  return `<section class="professor" id="p${String(professor.target.id)}"><h2>${esc(professor.target.professor)}</h2>`
    + `<p class="muted">${esc(professor.target.university ?? professor.target.lab ?? 'Independent lab')} · `
    + `${professor.target.pathway === 'proposal' ? 'research proposal' : 'pitch'}${professor.target.deadline === null ? ''
      : ` · closes ${esc(professor.target.deadline.date)}`}</p>`
    + (item === undefined ? '' : `${stages(item.stages)}<p><strong>Next:</strong> ${esc(item.next)}</p>`)
    + directionsSection(professor) + fitSection(professor, kinds) + adviceSection(professor) + contactSection(professor)
    + `${pitch === null ? '' : `<h3>Pitch draft (${esc(pitch.status)})</h3><p><strong>Subject:</strong> ${esc(pitch.subject)}</p>`
      + `<pre>${esc(pitch.body)}</pre>`}</section>`;
}

const style = `:root{--bg:#fdfcfc;--soft:#f8f7f7;--ink:#201d1d;--muted:#646262;--line:rgba(15,0,0,.12);--mark:#f1e7a8;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#181616;--soft:#211e1e;--ink:#ece8e8;--muted:#a39d9d;--line:rgba(255,240,240,.16);--mark:#5c5121;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
main{max-width:920px;margin:0 auto;padding:32px max(16px,env(safe-area-inset-left))}
h1{font-size:26px;margin:4px 0 8px}h2{font-size:21px;margin:0 0 4px}h3{font-size:16px;margin:28px 0 8px}h4{font-size:15px;margin:0 0 4px}h5{font-size:14px;margin:16px 0 4px}
a{color:inherit}.muted{color:var(--muted)}.kicker{color:var(--muted);margin:0}
section{border-top:1px solid var(--line);margin-top:32px;padding-top:24px}
table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}th,td{text-align:left;vertical-align:top;padding:6px 8px 6px 0;border-bottom:1px solid var(--line)}
.stages{display:flex;flex-wrap:wrap;gap:4px 16px;list-style:none;padding:0;margin:12px 0;font-size:14px}
.cutout{margin:12px 0;padding:10px 14px;background:var(--soft);border:1px solid var(--line)}.cutout blockquote{margin:0;font-size:14px;color:var(--muted)}
mark{background:var(--mark);color:var(--ink);padding:0 2px}figcaption{font-size:12px;color:var(--muted);margin-top:6px}.note{margin:6px 0 0;font-size:14px}
.pair{margin:12px 0;padding:10px 14px;border:1px solid var(--line)}.lead{margin:0 0 6px;font-weight:600}
.direction{margin:16px 0;padding:14px 16px;border:2px solid var(--ink)}details{margin:8px 0}summary{cursor:pointer}
pre{white-space:pre-wrap;background:var(--soft);padding:12px;border:1px solid var(--line);font:inherit}
@media print{details{display:block}details>summary{display:none}}`;

function report(overview: Overview, kinds: readonly FitKind[], professors: readonly Professor[], name: string | null, pitches: boolean): string {
  const date = new Date().toISOString().slice(0, 10);
  const all = [...overview.proposals, ...overview.pitches].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const listed = all.some((item) => item.finalList) ? all.filter((item) => item.finalList) : all;
  const statusOf = (id: number): string => {
    const pitch = overview.pitches.find((item) => item.targetId === id);
    return pitch === undefined ? 'research proposal' : `pitch: ${pitch.status === 'none' ? 'no draft yet' : pitch.status === 'hold' ? 'write it yourself' : pitch.status}`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>Coresearch report${name === null ? '' : ` · ${esc(name)}`}</title><style>${style}</style></head><body><main>`
    + `<header><p class="kicker">Coresearch report · exported ${date}</p><h1>${name === null ? 'PhD applications' : `${esc(name)}’s PhD applications`}</h1>`
    + '<p class="muted">Every claim rests on a quoted passage: highlighted words are exact quotes from the paper, page, or CV named under them. '
    + 'Fit is scored 0 to 3 per kind; “–” means checked and not found.</p></header>'
    + `<section id="overview"><h2>Overview</h2><table><thead><tr><th>Rank</th><th>Professor</th><th>Path and status</th><th>Fit</th><th>Deadline</th></tr></thead><tbody>`
    + listed.map((item) => `<tr><td>${item.rank === null ? '—' : String(item.rank)}</td><td><a href="#p${String(item.targetId)}">${esc(item.professor)}</a>`
      + `<br><span class="muted">${esc(item.university ?? '')}</span></td><td>${esc(statusOf(item.targetId))}</td><td>${item.fit === null ? '—'
        : `${String(item.fit.score)}/${String(item.fit.max)}`}</td><td>${esc(item.deadline ?? '—')}</td></tr>`).join('')
    + '</tbody></table>'
    + `${overview.steps.filter((step) => step.finalList).length === 0 ? '' : `<h3>What to do next</h3><ol>${overview.steps.filter((step) => step.finalList)
      .map((step) => `<li>${esc(step.date ?? 'now')}: ${esc(step.text)}</li>`).join('')}</ol>`}</section>`
    + professors.map((professor) => professorSection(professor, overview, kinds, pitches)).join('')
    + `<section id="kinds"><h2>How fit is scored</h2>${kinds.map((kind) => `<p><strong>${esc(kind.label)}</strong> — ${esc(kind.question)} `
      + `<span class="muted">${esc(kind.anchors)}${kind.weight === 0 ? ' Not counted in the rank.' : kind.weight > 1 ? ` Counts ×${String(kind.weight)}.` : ''}</span></p>`).join('')}</section>`
    + '</main></body></html>';
}

const readme = `This folder is a Coresearch export.

report.html        Open in any web browser. A readable report of the applications, research directions, fit, and evidence.
coresearch.sqlite  The full database. Open it with Coresearch, or with any SQLite viewer.
data.json          The same research as JSON, for other tools.

Every quotation in the report is checked against the saved text of its source.
`;

function sizeOf(workspace: string, folder: string, name: string): { name: string; path: string; bytes: number } {
  const path = join(folder, name);
  return { name, path, bytes: statSync(join(workspace, path)).size };
}

export function createExport(workspace: string, input: unknown): ExportRecord {
  const options = exportOptionsSchema.parse(input);
  const createdAt = new Date().toISOString();
  const folder = join('exports', createdAt.slice(0, 19).replace(/[:T]/g, '-'));
  const absolute = join(workspace, folder);
  if (existsSync(absolute)) throw new RuleError('An export was just made; wait a second and try again.');
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  const database = join(absolute, 'coresearch.sqlite');
  withDatabase(workspace, (db) => { db.exec(`VACUUM INTO '${database.replace(/'/g, '\'\'')}'`); });
  const copy = new DatabaseSync(database);
  try {
    if (!options.pitches) copy.exec('DELETE FROM pitches;');
    if (!options.notes) copy.exec('UPDATE targets SET notes = NULL;');
    if (!options.cv) copy.exec('UPDATE profile SET cv_file = NULL, cv_text = NULL, cv_pages = NULL, cv_added_at = NULL;');
    copy.exec('VACUUM;');
  } finally {
    copy.close();
  }
  chmodSync(database, 0o600);
  const overview = getOverview(workspace);
  const kinds = listFitKinds(workspace);
  const profile = getProfile(workspace);
  const targets = listTargets(workspace);
  const chosen = targets.filter((target) => onFinalList(target) || target.pathway === 'proposal' || Object.keys(target.fit).length > 0);
  const professors: Professor[] = (chosen.length === 0 ? targets : chosen).map((target) => {
    const outreach = targetOutreach(workspace, target.id);
    const research = target.pathway === 'proposal' ? getResearch(workspace, target.id) : null;
    const tracks = research?.tracks ?? [];
    const strong = new Set(tracks.filter((track) => track.status === 'strong').map((track) => track.id));
    const known = new Set(outreach.clips.map((clip) => clip.id));
    const clips = [...outreach.clips, ...(research?.clips ?? []).filter((clip) => !known.has(clip.id) && clip.trackId !== null && strong.has(clip.trackId))];
    const cited = new Set([...clips.map((clip) => clip.sourceId), ...outreach.contacts.flatMap((contact) => contact.papers.map((paper) => paper.sourceId))]);
    const sources = [...outreach.sources, ...(research?.sources ?? []).filter((source) => cited.has(source.id)
      && !outreach.sources.some((item) => item.id === source.id))];
    return { target: options.notes ? target : { ...target, notes: {} }, fit: outreach.fit, contacts: outreach.contacts,
      pitch: options.pitches ? outreach.pitch : null, clips, sources, tracks };
  }).sort((a, b) => Number(onFinalList(b.target)) - Number(onFinalList(a.target))
    || Number(a.target.pathway === 'pitch') - Number(b.target.pathway === 'pitch') || a.target.id - b.target.id);
  const publicProfile = { ...profile, cv: options.cv ? profile.cv : null };
  writeFileSync(join(absolute, 'report.html'), report(overview, kinds, professors, profile.name, options.pitches), { mode: 0o600 });
  writeFileSync(join(absolute, 'data.json'), JSON.stringify({ exportedAt: createdAt, options, profile: publicProfile, kinds, overview,
    ideas: listIdeas(workspace), professors }, null, 2), { mode: 0o600 });
  writeFileSync(join(absolute, 'README.txt'), readme, { mode: 0o600 });
  if (options.cv && profile.cv !== null && existsSync(join(workspace, profile.cv.filePath))) {
    copyFileSync(join(workspace, profile.cv.filePath), join(absolute, 'cv.pdf'));
  }
  return exportRecordSchema.parse({ folder, createdAt, files: ['report.html', 'coresearch.sqlite', 'data.json', 'README.txt', 'cv.pdf']
    .filter((name) => existsSync(join(absolute, name))).map((name) => sizeOf(workspace, folder, name)) });
}

const fileOrder = ['report.html', 'coresearch.sqlite', 'data.json', 'README.txt', 'cv.pdf'];

function order(name: string): number {
  const index = fileOrder.indexOf(name);
  return index === -1 ? fileOrder.length : index;
}

export function listExports(workspace: string): ExportRecord[] {
  const root = join(workspace, 'exports');
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse()
    .map((name) => {
      const folder = join('exports', name);
      return { folder, createdAt: statSync(join(workspace, folder)).mtime.toISOString(),
        files: readdirSync(join(workspace, folder)).sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((file) => sizeOf(workspace, folder, file)) };
    });
}
