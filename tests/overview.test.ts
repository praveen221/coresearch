import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { attachCvBytes } from '../src/lib/cv.ts';
import { createExport, listExports } from '../src/lib/export.ts';
import { attachPdf, savePaper } from '../src/lib/library.ts';
import type { Work } from '../src/lib/openalex.ts';
import { savePitch, scoreFit } from '../src/lib/outreach.ts';
import { getOverview } from '../src/lib/overview.ts';
import { addClip } from '../src/lib/research.ts';
import { addTarget, updateTarget } from '../src/lib/targets.ts';
import { pdf } from './pdf.ts';

const paper: Work = {
  openalexId: 'W20', doi: '10.1000/overview', title: 'Detecting persuasion <in> chat', year: 2026, date: '2026-01-01', type: 'article',
  venue: 'Example Venue', authors: ['Jane Doe'], abstract: 'An abstract.', references: [], pdfUrls: [], landingUrl: 'https://doi.org/10.1000/overview',
  citedBy: 0,
};

void test('the overview gives each professor a path, a stage, and a dated next step; an export carries it to anyone', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'coresearch-overview-'));
  try {
    const pitched = addTarget({ professor: 'Jane Doe', labKind: 'university', university: 'Example University', region: 'us',
      notes: { 'Final list': 'yes' } }, workspace);
    const proposal = addTarget({ professor: 'John Roe', labKind: 'university', university: 'University of Cambridge', region: 'uk' }, workspace);
    const empty = getOverview(workspace);
    assert.deepEqual([empty.proposals.map((item) => item.professor), empty.pitches.map((item) => item.professor)], [['John Roe'], ['Jane Doe']]);
    assert.deepEqual(empty.steps.map((step) => [step.professor, step.text.slice(0, 22)]), [[null, 'Upload your CV, so pit'],
      [null, 'Ask your agent to rank'], ['Jane Doe', 'Ask your agent to draf'], ['John Roe', 'Ask your agent to star']]);
    assert.deepEqual(empty.proposals[0]?.stages.map((stage) => stage.state), ['done', 'todo', 'todo', 'todo', 'todo', 'todo']);
    const file = join(workspace, 'paper.pdf');
    writeFileSync(file, pdf(['Users detected fewer manipulative tactics when the model concealed its intent.']));
    const source = savePaper(workspace, pitched.id, paper).source;
    const attached = await attachPdf(workspace, source.id, file);
    const clip = addClip(workspace, { sourceId: source.id, kind: 'finding', quote: 'Users detected fewer manipulative tactics' });
    writeFileSync(file, pdf(['Annotated manipulation tactics in LLM responses.', 'Coded strategies participants used to resist.']));
    await attachCvBytes(workspace, new Uint8Array(readFileSync(file)));
    updateTarget(pitched.id, { deadline: { date: '2099-12-31', clipId: clip.id } }, workspace);
    scoreFit(workspace, { targetId: pitched.id, reviewer: 'Test', facets: { topic: { score: 3, finding: 'Detection.', reason: 'Same construct.',
      evidence: [{ cvQuote: 'Annotated manipulation tactics in LLM responses', clipId: clip.id, note: 'Same tactics.' }] } } });
    savePitch(workspace, { targetId: pitched.id, subject: 'A question', body: 'Dear Professor Doe, a short note.', question: 'Does it last?',
      questionCheck: 'Two searches found nothing.', connections: [
        { cvQuote: 'Annotated manipulation tactics in LLM responses', clipId: clip.id, note: 'She annotated them.' },
        { cvQuote: 'Coded strategies participants used to resist', clipId: clip.id, note: 'She coded resistance.' }] });
    const overview = getOverview(workspace);
    const [item] = overview.pitches;
    assert.deepEqual([item?.status, item?.sendBy, item?.rank, item?.fit?.score, item?.stages.map((stage) => stage.state)],
      ['draft', '2099-12-03', 1, 3, ['done', 'done', 'done', 'todo', 'todo', 'todo']]);
    assert.deepEqual([overview.steps[0]?.professor, overview.steps[0]?.date, overview.steps[0]?.text], ['Jane Doe', '2099-12-03',
      'Review your pitch, put it in your own words, and send it']);
    assert.equal(item?.next, 'Review the draft, put it in your own words, and send it by 3 Dec 2099.');
    const record = createExport(workspace, { pitches: false, texts: true });
    assert.deepEqual(record.files.map((entry) => entry.name), ['report.html', 'coresearch.sqlite', 'data.json', 'README.txt']);
    assert.deepEqual([existsSync(join(workspace, record.folder, attached.textPath ?? '')), existsSync(join(workspace, record.folder, attached.filePath ?? ''))],
      [true, false]);
    const html = readFileSync(join(workspace, record.folder, 'report.html'), 'utf8');
    assert.match(html, /Detecting persuasion &lt;in&gt; chat/);
    assert.match(html, /<mark>Users detected fewer manipulative tactics<\/mark>/);
    assert.doesNotMatch(html, /Dear Professor Doe/);
    const copy = new DatabaseSync(join(workspace, record.folder, 'coresearch.sqlite'));
    try {
      assert.equal(copy.prepare('SELECT count(*) AS count FROM pitches').get()?.['count'], 0);
      assert.equal(copy.prepare('SELECT cv_text FROM profile').get()?.['cv_text'], null);
    } finally { copy.close(); }
    assert.equal(existsSync(join(workspace, record.folder, 'cv.pdf')), false);
    assert.deepEqual([listExports(workspace)[0]?.folder, listExports(workspace)[0]?.files.map((entry) => entry.name)],
      [record.folder, ['report.html', 'coresearch.sqlite', 'data.json', 'README.txt']]);
    assert.equal(proposal.pathway, 'proposal');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
