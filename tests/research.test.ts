import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { resolveServedFile } from '../src/lib/files.ts';
import { attachPdf, getSource, savePaper, setSourceStatus } from '../src/lib/library.ts';
import type { Work } from '../src/lib/openalex.ts';
import {
  addClip, addEvent, addIdea, addTrack, decideTrack, getResearch, getTrackDetail, linkSource, listIdeas, removeIdea, updateTrack,
} from '../src/lib/research.ts';
import { addTarget } from '../src/lib/targets.ts';

function pdf(pages: readonly string[]): Buffer {
  const escape = (line: string): string => line.replace(/[()\\]/g, (char) => `\\${char}`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${String(4 + index * 2)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...pages.flatMap((text, index) => {
      const stream = `BT /F1 12 Tf 72 720 Td (${escape(text)}) Tj ET`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(5 + index * 2)} 0 R >>`,
        `<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`,
      ];
    }),
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => { offsets.push(out.length); out += `${String(index + 1)} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const work: Work = {
  openalexId: 'W1', doi: '10.1000/example', title: 'Humanlike voice and misplaced trust', year: 2025, date: '2025-01-01',
  type: 'article', venue: 'Example Venue', authors: ['Katie Seaborn', 'Example Author'], abstract: 'An abstract.',
  references: ['W2'], pdfUrls: [], landingUrl: 'https://doi.org/10.1000/example', citedBy: 0,
};

async function fixture(run: (workspace: string, targetId: number) => Promise<void>): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'coresearch-research-'));
  try {
    const target = addTarget({ professor: 'Katie Seaborn', labKind: 'university', university: 'University of Cambridge' }, workspace);
    await run(workspace, target.id);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
}

void test('a paper is stored once, its PDF text is extracted, and reading status stays honest', async () => {
  await fixture(async (workspace, targetId) => {
    const { source, added } = savePaper(workspace, targetId, work);
    assert.equal(added, true);
    assert.equal(savePaper(workspace, targetId, { ...work, openalexId: 'W9', title: 'Humanlike Voice and Misplaced Trust!' }).added, false);
    assert.deepEqual(source.references, ['W2']);
    assert.throws(() => setSourceStatus(workspace, source.id, { status: 'full' }), /cannot be marked as read/);
    assert.equal(setSourceStatus(workspace, source.id, { status: 'abstract' }).status, 'abstract');
    const file = join(workspace, 'upload.pdf');
    writeFileSync(file, pdf(['Introduction to warm voices.', 'Participants relied on wrong advice from the warm voice.']));
    const attached = await attachPdf(workspace, source.id, file);
    assert.equal(attached.pageCount, 2);
    assert.match(attached.filePath ?? '', /^targets\/1-katie-seaborn\/papers\/2025-seaborn-humanlike-voice-and-misplaced-trust-1\.pdf$/);
    assert.ok(existsSync(join(workspace, attached.textPath ?? '')));
    assert.equal(setSourceStatus(workspace, source.id, { status: 'full', note: 'whole paper' }).statusNote, 'whole paper');
    writeFileSync(file, 'not a pdf');
    await assert.rejects(attachPdf(workspace, source.id, file), /not a PDF/);
  });
});

void test('clippings must quote the saved text; tracks record evidence, decisions, and a readable file', async () => {
  await fixture(async (workspace, targetId) => {
    const paper = savePaper(workspace, targetId, work).source;
    const file = join(workspace, 'upload.pdf');
    writeFileSync(file, pdf(['Introduction to warm voices.', 'Participants relied on wrong advice from the warm voice.']));
    await attachPdf(workspace, paper.id, file);
    const idea = addIdea(workspace, { kind: 'question', text: 'Does warmth make wrong advice persuasive?' });
    const track = addTrack(workspace, { targetId, origin: 'student', ideaId: idea.id, title: 'Warmth and reliance',
      question: 'Does a warm voice increase reliance on wrong advice?' });
    assert.equal(track.status, 'running');
    linkSource(workspace, track.id, { sourceId: paper.id, role: 'seed' });
    assert.throws(() => addClip(workspace, { sourceId: paper.id, trackId: track.id, kind: 'finding',
      quote: 'Participants trusted the warm voice more than the cold one' }), /does not occur/);
    const clip = addClip(workspace, { sourceId: paper.id, trackId: track.id, kind: 'finding',
      quote: 'relied on wrong advice from the warm voice', note: 'Direct evidence of misplaced reliance.' });
    assert.equal(clip.page, 2);
    assert.equal(clip.before, 'Participants');
    assert.throws(() => updateTrack(workspace, track.id, { status: 'awaiting' }), /prompt/);
    updateTrack(workspace, track.id, { status: 'awaiting', prompt: 'Continue with Indian first-time users?', summary: 'Promising.' });
    addEvent(workspace, track.id, { kind: 'search', text: 'OpenAlex "voice warmth reliance", 40 results, 3 opened.' });
    const decided = decideTrack(workspace, track.id, 'continue', 'Yes, focus on India.');
    assert.equal(decided.status, 'running');
    assert.equal(decided.prompt, null);
    const detail = getTrackDetail(workspace, track.id);
    assert.deepEqual(detail.links, [{ sourceId: paper.id, role: 'seed', note: null }]);
    assert.deepEqual(detail.events.map((event) => [event.actor, event.kind]),
      [['agent', 'decision'], ['agent', 'search'], ['student', 'decision']]);
    const folder = join(workspace, 'targets', '1-katie-seaborn', 'tracks');
    const [exported] = readdirSync(folder);
    assert.equal(exported, `${String(track.id)}-warmth-and-reliance.md`);
    const markdown = readFileSync(join(folder, exported), 'utf8');
    assert.match(markdown, /> relied on wrong advice from the warm voice/);
    assert.match(markdown, /student decision: Student chose to continue\. Yes, focus on India\./);
    const research = getResearch(workspace, targetId);
    assert.equal(research.clips.length, 1);
    assert.equal(research.tracks.length, 1);
    assert.equal(getSource(workspace, paper.id).id, paper.id);
    assert.equal(listIdeas(workspace).length, 1);
    removeIdea(workspace, idea.id);
    assert.equal(getTrackDetail(workspace, track.id).track.ideaId, null);
  });
});

void test('only files inside the workspace targets folder are served', async () => {
  await fixture((workspace) => {
    writeFileSync(join(workspace, 'secret.txt'), 'private');
    mkdirSync(join(workspace, 'targets'), { recursive: true });
    writeFileSync(join(workspace, 'targets', 'paper.txt'), 'text');
    assert.notEqual(resolveServedFile(workspace, 'targets/paper.txt'), null);
    for (const path of ['coresearch.sqlite', 'secret.txt', 'targets/../secret.txt', '/etc/passwd', 'targets/missing.pdf', '']) {
      assert.equal(resolveServedFile(workspace, path), null, path);
    }
    return Promise.resolve();
  });
});

void test('a version 2 database gains research tables and keeps its targets', async () => {
  await fixture((workspace, targetId) => {
    const db = new DatabaseSync(join(workspace, 'coresearch.sqlite'));
    try {
      db.exec(`DROP TABLE clips; DROP TABLE track_events; DROP TABLE track_sources; DROP TABLE tracks; DROP TABLE citations;
        DROP TABLE sources; DROP TABLE target_authors; DROP TABLE ideas; PRAGMA user_version = 2;`);
    } finally { db.close(); }
    assert.deepEqual(getResearch(workspace, targetId), { sources: [], tracks: [], clips: [], author: null });
    return Promise.resolve();
  });
});
