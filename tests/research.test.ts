import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { resolveServedFile } from '../src/lib/files.ts';
import { addCategory, categorizeSource } from '../src/lib/categories.ts';
import {
  addManualSource, attachPdf, attachPdfBytes, getSource, isBotCheck, markFutureScanned, pageText, requestPaper, savePaper, setSourceStatus,
} from '../src/lib/library.ts';
import type { Work } from '../src/lib/openalex.ts';
import {
  addClip, addEvent, addIdea, addTrack, approveTrack, assessSource, closeBatch, decideTrack, getResearch, getTrackDetail, linkSource,
  listBatches, listIdeas, getOverview, removeClip, removeIdea, scoreTrack, setBrief, startBatch, updateSettings, updateTrack,
} from '../src/lib/research.ts';
import { clearsBar } from '../src/lib/research-schema.ts';
import { addSeed, listSeeds, seedStrength } from '../src/lib/seeds.ts';
import { addTarget } from '../src/lib/targets.ts';
import { pdf } from './pdf.ts';

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
    assert.equal(savePaper(workspace, targetId, { ...work, openalexId: 'W8', title: 'Another paper on the same landing page' }).source.url, null);
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

void test('clippings must quote the saved text; tracks need approval and grounded verdicts, and export a report', async () => {
  await fixture(async (workspace, targetId) => {
    const paper = savePaper(workspace, targetId, work).source;
    const file = join(workspace, 'upload.pdf');
    writeFileSync(file, pdf(['Introduction to warm voices.', 'Participants relied on wrong advice from the warm voice in 61% of trials.']));
    await attachPdf(workspace, paper.id, file);
    const idea = addIdea(workspace, { kind: 'question', text: 'Does warmth make wrong advice persuasive?' });
    const agentTrack = { targetId, origin: 'agent', title: 'Agent guess', question: 'Q?', rationale: 'Seen in abstracts.', researchQuestions: ['What changes?', 'Why and for whom?'], contribution: 'A validated measure.', prediction: 30, killCriterion: 'a prior study already measures it' };
    assert.throws(() => addTrack(workspace, { ...agentTrack, rationale: undefined }));
    assert.throws(() => addTrack(workspace, agentTrack), /student’s ideas first/);
    const track = addTrack(workspace, { targetId, origin: 'student', ideaId: idea.id, title: 'Warmth and reliance',
      question: 'Does a warm voice increase reliance on wrong advice?', rationale: 'The student’s own question.' });
    assert.equal(track.status, 'proposed');
    assert.throws(() => updateTrack(workspace, track.id, { status: 'running' }), /approves/);
    assert.throws(() => decideTrack(workspace, track.id, 'continue', null), /say where this track goes/);
    updateTrack(workspace, track.id, { researchQuestions: ['What changes?', 'Why and for whom?'], contribution: 'A validated measure.' });
    assert.equal(decideTrack(workspace, track.id, 'continue', null).status, 'running');
    updateSettings(workspace, { trackLimit: 2 });
    const first = addTrack(workspace, agentTrack);
    const second = addTrack(workspace, { ...agentTrack, title: 'Second guess' });
    assert.throws(() => addTrack(workspace, { ...agentTrack, title: 'Third guess' }), /one round/);
    assert.throws(() => approveTrack(workspace, first.id, { studentSaid: 'Yes.' }), /Katie Seaborn’s own papers/);
    linkSource(workspace, first.id, { sourceId: paper.id, role: 'seed' });
    assert.equal(approveTrack(workspace, first.id, { studentSaid: 'Yes, start the first one.' }).status, 'running');
    updateSettings(workspace, { trackLimit: 1 });
    linkSource(workspace, second.id, { sourceId: paper.id, role: 'seed' });
    assert.throws(() => approveTrack(workspace, second.id, { studentSaid: 'And the second.' }), /already running/);
    assert.throws(() => updateTrack(workspace, second.id, { status: 'dropped', stopReason: 'Withdrawn: too close to the first guess.' }), /killReason/);
    assert.equal(updateTrack(workspace, second.id, { status: 'dropped', stopReason: 'Withdrawn: too close to the first guess.', killReason: 'withdrawn' }).status, 'dropped');
    assert.equal(getResearch(workspace, targetId).running, 1);
    linkSource(workspace, track.id, { sourceId: paper.id, role: 'seed' });
    assert.throws(() => assessSource(workspace, track.id, { sourceId: paper.id, verdict: 'supports', assessment: 'Fine.' }), /Cut out/);
    assert.throws(() => addClip(workspace, { sourceId: paper.id, trackId: track.id, kind: 'finding',
      quote: 'Participants trusted the warm voice more than the cold one' }), /does not occur/);
    const clip = addClip(workspace, { sourceId: paper.id, trackId: track.id, kind: 'finding',
      quote: 'relied on wrong advice from the warm voice in 61% of trials', note: 'Direct evidence of misplaced reliance.' });
    assert.equal(clip.page, 2);
    const assessment = { sourceId: paper.id, verdict: 'answers', assessment: `Already shows the effect [c${String(clip.id)}].` };
    assert.throws(() => assessSource(workspace, track.id, assessment), /abstract is not enough/);
    setSourceStatus(workspace, paper.id, { status: 'full' });
    assert.throws(() => assessSource(workspace, track.id, { ...assessment, assessment: 'No citation.' }), /Cite at least one cutout/);
    assert.throws(() => assessSource(workspace, track.id, { ...assessment, assessment: 'Wrong [c999].' }), /Cite at least one cutout/);
    assessSource(workspace, track.id, assessment);
    assert.throws(() => updateTrack(workspace, track.id, { status: 'dropped' }), /stopReason/);
    assert.throws(() => updateTrack(workspace, track.id, { status: 'dropped', stopReason: 'Answered [c999].', killReason: 'answered' }), /not a cutout/);
    assert.throws(() => updateTrack(workspace, track.id, { status: 'strong', stopReason: 'Promising [c1].' }), /three assessed papers/);
    const dropped = updateTrack(workspace, track.id, { status: 'dropped', killReason: 'answered', stopReason: `Already answered [c${String(clip.id)}].`,
      summary: `The 61% reliance [c${String(clip.id)}] settles it.`, nextSteps: 'None; repeating it would not change the result.' });
    assert.equal(dropped.status, 'dropped');
    assert.throws(() => removeClip(workspace, clip.id), /cited in this track/);
    addEvent(workspace, track.id, { kind: 'search', text: 'OpenAlex "voice warmth reliance", 40 results, 3 opened.' });
    const detail = getTrackDetail(workspace, track.id);
    assert.equal(detail.links[0]?.verdict, 'answers');
    assert.deepEqual(detail.events.map((event) => [event.actor, event.kind]),
      [['agent', 'note'], ['student', 'decision'], ['agent', 'reading'], ['agent', 'decision'], ['agent', 'search']]);
    const folder = join(workspace, 'targets', '1-katie-seaborn', 'tracks');
    const markdown = readFileSync(join(folder, readdirSync(folder).find((name) => name.startsWith(`${String(track.id)}-`)) ?? ''), 'utf8');
    assert.match(markdown, /## Report/);
    assert.match(markdown, /Verdict: \*\*answers\*\*/);
    assert.match(markdown, /> relied on wrong advice from the warm voice in 61% of trials/);
    assert.equal(getSource(workspace, paper.id).id, paper.id);
    assert.equal(listIdeas(workspace).length, 1);
    removeIdea(workspace, idea.id);
    assert.equal(getTrackDetail(workspace, track.id).track.ideaId, null);
  });
});

void test('an agent track that would reread another track’s papers cannot start', async () => {
  await fixture((workspace, targetId) => {
    const papers = ['A', 'B', 'C'].map((suffix, index) => savePaper(workspace, targetId,
      { ...work, openalexId: `W${String(index + 10)}`, title: `Distinct paper ${suffix}` }).source);
    const base = { targetId, origin: 'agent', question: 'Q?', rationale: 'R.', researchQuestions: ['What changes?', 'Why and for whom?'], contribution: 'A validated measure.', prediction: 30, killCriterion: 'a prior study already measures it' };
    const first = addTrack(workspace, { ...base, title: 'First direction' });
    for (const paper of papers) linkSource(workspace, first.id, { sourceId: paper.id, role: 'seed' });
    approveTrack(workspace, first.id, { studentSaid: 'Start it.' });
    const similar = addTrack(workspace, { ...base, title: 'Similar direction' });
    for (const paper of papers.slice(0, 2)) linkSource(workspace, similar.id, { sourceId: paper.id, role: 'seed' });
    assert.throws(() => approveTrack(workspace, similar.id, { studentSaid: 'Start it.' }), /already read for track/);
    assert.throws(() => decideTrack(workspace, similar.id, 'continue', null), /already read for track/);
    const overview = getOverview(workspace, targetId);
    assert.ok(Array.isArray(overview) && overview.length === 2);
    return Promise.resolve();
  });
});

void test('a strong track needs three assessed papers, one read in full, before a research brief is accepted', async () => {
  await fixture(async (workspace, targetId) => {
    const track = addTrack(workspace, { targetId, origin: 'agent', title: 'Strong direction', question: 'Q?', rationale: 'R.' });
    assert.throws(() => approveTrack(workspace, track.id, { studentSaid: 'Run it.' }), /Before it starts, say where this track goes/);
    assert.throws(() => updateTrack(workspace, track.id, { researchQuestions: ['Only one?'] }), /at least two research questions/);
    updateTrack(workspace, track.id, { researchQuestions: ['What changes?', 'Why and for whom?', 'What fixes it?'], contribution: 'A framework.' });
    assert.throws(() => approveTrack(workspace, track.id, { studentSaid: 'Run it.' }), /killCriterion/);
    updateTrack(workspace, track.id, { prediction: 55, killCriterion: 'any study already tests it' });
    const clips: number[] = [];
    for (const [index, suffix] of ['A', 'B', 'C'].entries()) {
      const paper = savePaper(workspace, targetId, { ...work, openalexId: `W${String(index + 20)}`, title: `Evidence paper ${suffix}`,
        landingUrl: `https://doi.org/10.1000/${suffix}` }).source;
      const file = join(workspace, `${suffix}.pdf`);
      writeFileSync(file, pdf([`Finding ${suffix}: the measured effect was small but reliable across samples.`]));
      await attachPdf(workspace, paper.id, file);
      linkSource(workspace, track.id, { sourceId: paper.id, role: 'supporting' });
      if (index === 0) approveTrack(workspace, track.id, { studentSaid: 'Run it.' });
      const clip = addClip(workspace, { sourceId: paper.id, trackId: track.id, kind: 'finding', quote: `Finding ${suffix}: the measured effect was small` });
      clips.push(clip.id);
      setSourceStatus(workspace, paper.id, { status: index === 0 ? 'full' : 'partial' });
      assessSource(workspace, track.id, { sourceId: paper.id, verdict: 'supports', assessment: `Supports it [c${String(clip.id)}].` });
    }
    const refs = clips.map((id) => `[c${String(id)}]`).join('');
    assert.throws(() => setBrief(workspace, track.id, { brief: `## Question\nEarly ${refs}` }), /only for a track marked strong/);
    updateTrack(workspace, track.id, { status: 'strong', stopReason: `Survived the audit ${refs}.`, summary: `Open and worth answering ${refs}.` });
    assert.throws(() => setBrief(workspace, track.id, { brief: '## Question\nNo evidence.' }), /at least three cutouts/);
    assert.equal(setBrief(workspace, track.id, { brief: `## Question\n- Grounded ${refs}` }).brief, `## Question\n- Grounded ${refs}`);
    const folder = join(workspace, 'targets', '1-katie-seaborn');
    assert.ok(readdirSync(join(folder, 'tracks')).some((name) => name.endsWith('-brief.md')));
    updateTrack(workspace, track.id, { title: 'Renamed direction' });
    assert.deepEqual(readdirSync(join(folder, 'tracks')).filter((name) => name.startsWith(`${String(track.id)}-`)).sort(),
      [`${String(track.id)}-renamed-direction-brief.md`, `${String(track.id)}-renamed-direction.md`]);
    assert.match(readFileSync(join(folder, 'summary.md'), 'utf8'), /1 track explored\.\n\n## 1\. Renamed direction — strong/);
    const report = readFileSync(join(folder, 'tracks', `${String(track.id)}-renamed-direction.md`), 'utf8');
    assert.match(report, /## Where this goes\n\n1\. What changes\?\n2\. Why and for whom\?\n3\. What fixes it\?\n\nContribution: A framework\./);
    assert.match(readFileSync(join(folder, 'summary.md'), 'utf8'), /RQ3: What fixes it\?/);
  });
});

void test('a paper without an open copy can be requested from the student and then uploaded', async () => {
  await fixture(async (workspace, targetId) => {
    const paper = savePaper(workspace, targetId, work).source;
    assert.equal(requestPaper(workspace, paper.id, { reason: 'Closest prior study.' }).requestReason, 'Closest prior study.');
    await assert.rejects(attachPdfBytes(workspace, paper.id, new Uint8Array([1, 2, 3])), /not a PDF/);
    const uploaded = await attachPdfBytes(workspace, paper.id, new Uint8Array(pdf(['Uploaded by the student.'])));
    assert.equal(uploaded.pageCount, 1);
    assert.throws(() => requestPaper(workspace, paper.id, { reason: 'Again.' }), /already available/);
  });
});

void test('a registered document keeps its abstract, and saved pages drop the doctype and menus', async () => {
  await fixture((workspace, targetId) => {
    const document = addManualSource(workspace, targetId, { title: 'A thesis', url: 'https://example.org/thesis', abstract: 'What it found.' });
    assert.equal(getSource(workspace, document.id).abstract, 'What it found.');
    assert.equal(addManualSource(workspace, targetId, { title: 'A Thesis!', url: 'https://example.org/thesis-v2' }).id, document.id);
    const page = pageText('<!DOCTYPE html><html><head><title>Rules</title></head><body><nav>Menu Home</nav><main>Apply by June.</main></body></html>');
    assert.deepEqual(page, { title: 'Rules', text: 'Rules\nApply by June.' });
    assert.equal(isBotCheck('Please complete the CAPTCHA to verify you are human.'), true);
    assert.equal(isBotCheck('Client Challenge. JavaScript is disabled in your browser.'), true);
    assert.equal(isBotCheck(page.text), false);
    return Promise.resolve();
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
    assert.deepEqual(getResearch(workspace, targetId), { sources: [], tracks: [], clips: [], author: null, settings: { trackLimit: 2 }, running: 0,
      batches: [], seeds: [], categories: [] });
    return Promise.resolve();
  });
});

void test('seed strength favours recent, cited, lab-authored, and corroborated evidence', () => {
  const at = (year: number, citedBy: number, fromLab = false): { year: number; citedBy: number; fromLab: boolean } => ({ year, citedBy, fromLab });
  assert.ok(seedStrength('future-work', [at(2026, 0)], 2026) > seedStrength('future-work', [at(2019, 500)], 2026));
  assert.ok(seedStrength('future-work', [at(2024, 120)], 2026) > seedStrength('future-work', [at(2024, 0)], 2026));
  assert.ok(seedStrength('future-work', [at(2024, 0, true)], 2026) > seedStrength('future-work', [at(2024, 0)], 2026));
  assert.ok(seedStrength('conflict', [at(2025, 10), at(2024, 30)], 2026) > seedStrength('conflict', [at(2025, 10)], 2026));
  assert.ok(seedStrength('future-work', [at(2025, 200, true), at(2024, 10), at(2024, 10)], 2026)
    > seedStrength('future-work', [at(2025, 0, true), at(2024, 0), at(2024, 0)], 2026));
  assert.ok(seedStrength('stopped-track', [], 2026) < seedStrength('survivor', [], 2026, 15));
  assert.equal(seedStrength('survivor', [at(2026, 0, true)], 2026, 6), seedStrength('survivor', [], 2026, 6));
});

void test('a track clears the bar only when every criterion reaches two, so fit cannot buy a shallow idea', () => {
  const programme = { novelty: 2, depth: 2, labFit: 2, studentFit: 2, feasibility: 2 };
  assert.equal(clearsBar(programme), true);
  assert.equal(clearsBar({ ...programme, depth: 0, labFit: 3, studentFit: 3, feasibility: 3 }), false);
});

void test('batches carry what was learned: later guesses need seeds, and a batch closes only when every guess is concluded, explained, and scored', async () => {
  await fixture(async (workspace, targetId) => {
    const lab = savePaper(workspace, targetId, { ...work, openalexId: 'W30', title: 'Lab paper on voice', year: 2025,
      landingUrl: 'https://doi.org/10.1000/lab' }).source;
    assert.throws(() => markFutureScanned(workspace, lab.id, { note: 'none' }), /once its text is saved/);
    const file = join(workspace, 'lab.pdf');
    writeFileSync(file, pdf(['Participants trusted the voice in 58% of trials.', 'Future work should test whether these effects hold across languages and cultures.']));
    await attachPdf(workspace, lab.id, file);
    const future = addClip(workspace, { sourceId: lab.id, kind: 'future', quote: 'Future work should test whether these effects hold across languages' });
    assert.equal(future.trackId, null);
    assert.notEqual(markFutureScanned(workspace, lab.id, { note: '1 statement cut out' }).futureCheckedAt, null);
    const old = savePaper(workspace, targetId, { ...work, openalexId: 'W31', title: 'An older paper', year: 2015, authors: ['Someone Else'],
      landingUrl: 'https://doi.org/10.1000/old' }).source;
    writeFileSync(file, pdf(['Further studies are needed with more diverse samples.']));
    await attachPdf(workspace, old.id, file);
    const oldClip = addClip(workspace, { sourceId: old.id, kind: 'limitation', quote: 'Further studies are needed with more diverse samples' });
    assert.throws(() => addSeed(workspace, { targetId, kind: 'future-work', text: 'Diverse samples.', clipIds: [oldClip.id] }), /2022 or later/);
    assert.throws(() => addSeed(workspace, { targetId, kind: 'conflict', text: 'Opposite results.', clipIds: [future.id] }), /two papers/);
    assert.throws(() => addSeed(workspace, { targetId, kind: 'student', text: 'More voice.' }), /student’s own words/);
    const seed = addSeed(workspace, { targetId, kind: 'future-work', text: 'Test the effect across languages.', clipIds: [future.id] });
    assert.equal(seed.fromLab, true);
    const guess = { targetId, origin: 'agent', question: 'Q?', rationale: 'R.', researchQuestions: ['A?', 'B?'], contribution: 'A measure.',
      prediction: 40, killCriterion: 'a cross-language study exists' };
    const first = addTrack(workspace, { ...guess, title: 'First guess' });
    linkSource(workspace, first.id, { sourceId: lab.id, role: 'seed' });
    approveTrack(workspace, first.id, { studentSaid: 'Go.' });
    const batch = listBatches(workspace, targetId).at(0);
    assert.ok(batch !== undefined);
    assert.equal(batch.number, 1);
    assert.throws(() => updateTrack(workspace, first.id, { prediction: 90 }), /fixed once it starts/);
    assert.throws(() => closeBatch(workspace, batch.id, { lessons: 'Too early.' }), /Conclude tracks/);
    addEvent(workspace, first.id, { kind: 'probe', text: 'kill: a cross-language study exists.' });
    const finding = addClip(workspace, { sourceId: lab.id, trackId: first.id, kind: 'finding', quote: 'Participants trusted the voice in 58% of trials' });
    setSourceStatus(workspace, lab.id, { status: 'full' });
    assessSource(workspace, first.id, { sourceId: lab.id, verdict: 'answers', assessment: `Answered [c${String(finding.id)}].` });
    updateTrack(workspace, first.id, { status: 'dropped', stopReason: `Answered [c${String(finding.id)}].`, killReason: 'answered' });
    assert.throws(() => closeBatch(workspace, batch.id, { lessons: 'Answered.' }), /score tracks/);
    const rubric = { novelty: 0, depth: 2, labFit: 3, studentFit: 1, feasibility: 3, reviewer: 'independent reviewer' };
    assert.throws(() => scoreTrack(workspace, first.id, { ...rubric, rationale: 'No evidence cited.' }), /Cite the cutouts/);
    assert.equal(scoreTrack(workspace, first.id, { ...rubric, rationale: `Answered [c${String(finding.id)}].` }).score?.total, 9);
    const closed = closeBatch(workspace, batch.id, { lessons: 'Cross-language guesses were already tested.' });
    assert.deepEqual([closed.metrics.probeKills, closed.metrics.brier, closed.metrics.meanScore, closed.metrics.clearedBar], [1, 0.16, 9, 0]);
    assert.throws(() => addTrack(workspace, { ...guess, title: 'Too early' }), /Batch 1 is closed/);
    assert.equal(startBatch(workspace, targetId, { studentSaid: 'Start batch two with one guess.', size: 1 }).number, 2);
    const seeded = addTrack(workspace, { ...guess, title: 'Seeded guess' });
    linkSource(workspace, seeded.id, { sourceId: lab.id, role: 'seed' });
    assert.throws(() => approveTrack(workspace, seeded.id, { studentSaid: 'Go.' }), /seedIds/);
    updateTrack(workspace, seeded.id, { seedIds: [seed.id] });
    assert.equal(approveTrack(workspace, seeded.id, { studentSaid: 'Go.' }).status, 'running');
    assert.equal(listSeeds(workspace, targetId).find((item) => item.id === seed.id)?.status, 'used');
    const extra = addTrack(workspace, { ...guess, title: 'Over budget', seedIds: [seed.id] });
    linkSource(workspace, extra.id, { sourceId: lab.id, role: 'seed' });
    assert.throws(() => approveTrack(workspace, extra.id, { studentSaid: 'Go.' }), /approved for 1 guess,/);
  });
});

void test('the library is organised into categories with one level of subcategories', async () => {
  await fixture((workspace, targetId) => {
    const paper = savePaper(workspace, targetId, work).source;
    const lab = addCategory(workspace, { targetId, name: 'The lab', kind: 'lab' });
    const voice = addCategory(workspace, { targetId, name: 'Voice', kind: 'theme', parentId: lab.id });
    assert.equal(addCategory(workspace, { targetId, name: 'voice', kind: 'theme', parentId: lab.id }).id, voice.id);
    assert.throws(() => addCategory(workspace, { targetId, name: 'Too deep', kind: 'theme', parentId: voice.id }), /two levels/);
    assert.deepEqual(categorizeSource(workspace, paper.id, { categoryIds: [lab.id, voice.id] }).map((item) => item.name).sort(), ['The lab', 'Voice']);
    assert.deepEqual(categorizeSource(workspace, paper.id, { categoryIds: [voice.id] }).map((item) => item.id), [voice.id]);
    assert.deepEqual(getResearch(workspace, targetId).categories.find((item) => item.id === voice.id)?.sourceIds, [paper.id]);
    return Promise.resolve();
  });
});

void test('reading status never goes backwards, and notes from different tracks accumulate', async () => {
  await fixture(async (workspace, targetId) => {
    const paper = savePaper(workspace, targetId, work).source;
    const file = join(workspace, 'paper.pdf');
    writeFileSync(file, pdf(['A short paper.']));
    await attachPdf(workspace, paper.id, file);
    setSourceStatus(workspace, paper.id, { status: 'full', note: 'Read in full for track 1.' });
    const after = setSourceStatus(workspace, paper.id, { status: 'partial', note: 'Methods only for track 2.' });
    assert.deepEqual([after.status, after.statusNote], ['full', 'Read in full for track 1.; Methods only for track 2.']);
  });
});
