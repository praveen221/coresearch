import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { attachCvBytes, cvPages } from '../src/lib/cv.ts';
import { resolveServedFile } from '../src/lib/files.ts';
import { guessRegion, importList, parseCsv, previewList, sheetExportUrl } from '../src/lib/import.ts';
import { attachPdf, savePaper } from '../src/lib/library.ts';
import type { Work } from '../src/lib/openalex.ts';
import { configureFitKinds, listFitKinds, setFitWeight } from '../src/lib/fit.ts';
import { defaultFitKinds, fitTotal } from '../src/lib/fit-schema.ts';
import {
  citeCollaborator, editPitch, getFit, getPitch, listOutreach, savePitch, scoreFit, setPitchStatus, sharedContacts, targetOutreach,
} from '../src/lib/outreach.ts';
import { updateProfile } from '../src/lib/profile.ts';
import { addClip } from '../src/lib/research.ts';
import { addTarget, getTarget, updateTarget } from '../src/lib/targets.ts';
import { pdf } from './pdf.ts';

function fixture(run: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'coresearch-outreach-'));
  return run(workspace).finally(() => { rmSync(workspace, { recursive: true, force: true }); });
}

const list = [
  'PhD Faculty Tracker,,,,',
  'University,Professor,Personal / Lab Website,Primary Research Angle,Official Source',
  'Example University,Alex Rivera,https://rivera.example.io/,"Trust, media, and AI",https://cs.example.edu/people/rivera',
  ',Second Person,,Voice agents,',
  'University of Oxford,Third Person,https://www.oii.ox.ac.uk/people/third,"Bias, ""quoted""",',
  ',,,,',
  'Somewhere,,,,',
].join('\r\n');

void test('lists import from CSV or a Google Sheets link, fill the university down, and keep the student’s columns as notes', async () => {
  assert.deepEqual(parseCsv('a,"b, c"\r\n"d ""e""",f\n"multi\nline",g\n,'), [['a', 'b, c'], ['d "e"', 'f'], ['multi\nline', 'g'], ['', '']]);
  assert.equal(sheetExportUrl('https://docs.google.com/spreadsheets/d/AbC_1-x/edit?gid=42#gid=42'),
    'https://docs.google.com/spreadsheets/d/AbC_1-x/export?format=csv&gid=42');
  assert.equal(sheetExportUrl('https://docs.google.com/spreadsheets/d/AbC/edit#gid=7'), 'https://docs.google.com/spreadsheets/d/AbC/export?format=csv&gid=7');
  assert.equal(sheetExportUrl('https://example.com/sheet.csv'), null);
  assert.equal(guessRegion(['https://people.example.edu/x'], null), 'us');
  assert.equal(guessRegion(['https://www.cs.ox.ac.uk/x'], null), 'uk');
  assert.equal(guessRegion(['https://www.uni-bremen.de/x'], null), 'europe');
  assert.equal(guessRegion([], 'University of Cambridge'), 'uk');
  assert.equal(guessRegion([], null, 'United States'), 'us');
  await fixture((workspace) => {
    addTarget({ professor: 'Prof. Alex Rivera', labKind: 'university', university: 'Example University' }, workspace);
    const preview = previewList(workspace, list);
    assert.deepEqual(preview.columns, { professor: 'Professor', university: 'University',
      links: ['Personal / Lab Website', 'Official Source'], notes: ['Primary Research Angle'] });
    assert.deepEqual(preview.rows.map((row) => [row.professor, row.university, row.region, row.existingId]), [
      ['Alex Rivera', 'Example University', 'us', 1], ['Second Person', 'Example University', null, null],
      ['Third Person', 'University of Oxford', 'uk', null],
    ]);
    assert.deepEqual(preview.rows[2]?.notes, { 'Primary Research Angle': 'Bias, "quoted"' });
    assert.deepEqual(preview.skipped, [{ row: 7, reason: 'No professor named.' }]);
    const result = importList(workspace, { rows: preview.rows.map((row) => ({ row: row.row, professor: row.professor, university: row.university,
      links: row.links, region: row.region, notes: row.notes })) });
    assert.deepEqual(result.created.map((target) => [target.professor, target.pathway]), [['Second Person', 'pitch'], ['Third Person', 'proposal']]);
    assert.deepEqual(result.skipped, [{ professor: 'Alex Rivera', reason: 'Already a target (1).' }]);
    assert.equal(importList(workspace, { rows: [{ row: 3, professor: 'Third Person', university: null, links: [], region: null, notes: {} }] })
      .skipped[0]?.reason, 'Already a target (3).');
    assert.throws(() => previewList(workspace, 'a,b\n1,2'), /No header row/);
    return Promise.resolve();
  });
});

const paper: Work = {
  openalexId: 'W10', doi: '10.1000/pitch', title: 'Exposing manipulation in conversation', year: 2026, date: '2026-01-01', type: 'article',
  venue: 'Example Venue', authors: ['Jane Doe', 'Ann Collaborator'], abstract: 'An abstract.', references: [], pdfUrls: [],
  landingUrl: 'https://doi.org/10.1000/pitch', citedBy: 0,
};

void test('a pitch connects quoted CV evidence with the professor’s own cutouts, stays short, and is sent only by the student', async () => {
  await fixture(async (workspace) => {
    const professor = addTarget({ professor: 'Jane Doe', labKind: 'university', university: 'Example University', region: 'us' }, workspace);
    const proposal = addTarget({ professor: 'John Roe', labKind: 'university', university: 'University of Cambridge', region: 'uk' }, workspace);
    assert.equal(getTarget(proposal.id, workspace).pathway, 'proposal');
    const own = savePaper(workspace, professor.id, paper).source;
    const other = savePaper(workspace, professor.id, { ...paper, openalexId: 'W11', doi: '10.1000/other', title: 'Unrelated work',
      authors: ['Someone Else'], landingUrl: 'https://doi.org/10.1000/other' }).source;
    const file = join(workspace, 'paper.pdf');
    writeFileSync(file, pdf(['Users detected fewer manipulative tactics when the model concealed its intent.']));
    await attachPdf(workspace, own.id, file);
    await attachPdf(workspace, other.id, file);
    const clip = addClip(workspace, { sourceId: own.id, kind: 'finding', quote: 'Users detected fewer manipulative tactics' });
    const foreign = addClip(workspace, { sourceId: other.id, kind: 'finding', quote: 'Users detected fewer manipulative tactics' });
    const draft = {
      targetId: professor.id,
      connections: [
        { cvQuote: 'annotated manipulation tactics in LLM responses', clipId: clip.id, note: 'She annotated the tactics they measure.' },
        { cvQuote: 'coded strategies participants used to resist', clipId: clip.id, note: 'Her resistance codes extend their detection result.' },
      ],
      question: 'Does showing a tactic as it happens build lasting resistance?',
      questionCheck: 'Two searches found detection studies but no test of lasting resistance.',
      subject: 'Exposing manipulation: a question about your 2026 study',
      body: 'Dear Professor Doe, I read your study on detecting manipulative tactics.',
    };
    assert.throws(() => savePitch(workspace, draft), /No CV yet/);
    writeFileSync(file, pdf(['Annotated manipulation tactics in LLM responses.', 'Qualitatively coded strategies participants used to resist manipulation.']));
    const profile = await attachCvBytes(workspace, new Uint8Array(readFileSync(file)));
    assert.equal(profile.cv?.pageCount, 2);
    assert.equal(cvPages(workspace).length, 2);
    assert.ok(resolveServedFile(workspace, 'profile/cv.pdf') !== null);
    assert.equal(resolveServedFile(workspace, 'coresearch.sqlite'), null);
    assert.throws(() => savePitch(workspace, { ...draft, targetId: proposal.id }), /proposal path/);
    assert.throws(() => savePitch(workspace, { ...draft, connections: [draft.connections[0], { ...draft.connections[1], cvQuote: 'won a Nobel prize for persuasion' }] }),
      /not in the CV/);
    assert.throws(() => savePitch(workspace, { ...draft, connections: [draft.connections[0], { ...draft.connections[1], clipId: foreign.id }] }),
      /not from Jane Doe’s own papers/);
    assert.throws(() => savePitch(workspace, { ...draft, body: Array.from({ length: 230 }, () => 'word').join(' ') }), /under 220 words; this one has 230/);
    updateTarget(professor.id, { pitchHold: 'The programme bans AI-drafted application materials.' }, workspace);
    assert.throws(() => savePitch(workspace, draft), /on hold: The programme bans/);
    updateTarget(professor.id, { pitchHold: null }, workspace);
    const saved = savePitch(workspace, draft);
    assert.deepEqual([saved.status, saved.connections[0]?.cvPage, saved.words], ['draft', 1, 11]);
    assert.equal(editPitch(workspace, professor.id, { body: 'Dear Professor Doe, a shorter note.' }).body, 'Dear Professor Doe, a shorter note.');
    assert.equal(setPitchStatus(workspace, professor.id, { status: 'sent' }).status, 'sent');
    assert.throws(() => savePitch(workspace, draft), /has been sent/);
    assert.equal(getPitch(workspace, proposal.id), null);
    assert.throws(() => updateTarget(professor.id, { openings: { status: 'yes' } }, workspace), /Cite the cutout/);
    assert.throws(() => updateTarget(proposal.id, { deadline: { date: '2026-12-01', clipId: clip.id } }, workspace), /not from this professor/);
    assert.deepEqual(updateTarget(professor.id, { openings: { status: 'yes', clipId: clip.id }, deadline: { date: '2026-12-01', clipId: clip.id } },
      workspace).deadline, { date: '2026-12-01', clipId: clip.id });
    updateProfile({ collaborators: { add: ['Ann  Collaborator', 'Someone Else', 'Jane Doe', 'A. Doe'] } }, workspace);
    assert.throws(() => citeCollaborator(workspace, { name: 'Nobody Here', cvQuote: 'annotated manipulation tactics in LLM responses', note: 'x' }),
      /not among the profile’s collaborators/);
    citeCollaborator(workspace, { name: 'Ann  Collaborator', cvQuote: 'annotated manipulation tactics in LLM responses', note: 'Her advisor' });
    const [contact] = sharedContacts(workspace, professor.id);
    assert.deepEqual([contact?.collaborator, contact?.match, contact?.note, contact?.cv?.page, contact?.papers.map((item) => [item.sourceId,
      item.collaboratorAs, item.professorAs, item.match])], ['Ann  Collaborator', 'name', 'Her advisor', 1, [[own.id, 'Ann Collaborator', 'Jane Doe', 'name']]]);
    assert.equal(sharedContacts(workspace, professor.id).length, 1);
    const fit = { targetId: professor.id, reviewer: 'Test reviewer', facets: {
      topic: { score: 3, finding: 'Detection of manipulative tactics.', reason: 'Her annotation work matches.',
        evidence: [{ cvQuote: 'annotated manipulation tactics in LLM responses', clipId: clip.id, note: 'Same construct.' }] },
      funding: { score: 1, finding: 'No recent grant found.', reason: 'Ask about funding.' },
    } };
    assert.throws(() => scoreFit(workspace, { ...fit, facets: { topic: { ...fit.facets.topic, evidence: [{ cvQuote: null, clipId: clip.id, note: 'x' }] } } }),
      /Topic: back a score of 3 with an exact quote from the CV/);
    assert.throws(() => scoreFit(workspace, { ...fit, facets: { topic: { ...fit.facets.topic, evidence: [{ cvQuote: 'annotated manipulation tactics in LLM responses',
      clipId: foreign.id, note: 'x' }] } } }), /not from Jane Doe’s own papers or this target’s saved pages/);
    assert.deepEqual(Object.keys(scoreFit(workspace, fit)), ['topic', 'funding']);
    assert.equal(getFit(workspace, professor.id)['topic']?.evidence[0]?.cv?.page, 1);
    assert.deepEqual(getTarget(professor.id, workspace).fit, { topic: 3, funding: 1 });
    assert.deepEqual(listFitKinds(workspace).map((kind) => kind.key), defaultFitKinds.map((kind) => kind.key));
    assert.deepEqual(fitTotal({ topic: 3, funding: 1 }, listFitKinds(workspace)), { score: 4, max: 21, checked: 2, counted: 7 });
    assert.deepEqual(fitTotal({ topic: 3, funding: 1 }, setFitWeight(workspace, { key: 'topic', weight: 2 })), { score: 7, max: 24, checked: 2, counted: 7 });
    assert.throws(() => setFitWeight(workspace, { key: 'nothing', weight: 1 }), /No kind of fit called/);
    assert.throws(() => scoreFit(workspace, { ...fit, facets: { compute: { score: 1, finding: 'A cluster.', reason: 'Fine.' } } }),
      /“compute” is not a configured kind of fit/);
    const compute = { key: 'compute', label: 'Compute', question: 'Can the lab run large models?', anchors: '0 none; 3 a cluster.',
      evidence: 'work', weight: 1 } as const;
    assert.throws(() => configureFitKinds(workspace, { kinds: [compute, compute] }), /Use each key once/);
    configureFitKinds(workspace, { kinds: [compute] });
    assert.deepEqual(Object.keys(scoreFit(workspace, { ...fit, facets: { compute: { score: 1, finding: 'A cluster.', reason: 'Fine.' } } })),
      ['compute', 'funding', 'topic']);
    assert.deepEqual(fitTotal(getTarget(professor.id, workspace).fit, listFitKinds(workspace)), { score: 1, max: 3, checked: 1, counted: 1 });
    configureFitKinds(workspace, { kinds: defaultFitKinds });
    assert.deepEqual(targetOutreach(workspace, professor.id).clips.map((item) => item.id), [clip.id]);
    const person = { name: 'Ann Collaborator', detail: 'PhD 2024; now a research scientist', url: 'https://example.org/ann' };
    const alumni = { score: 2, finding: 'Alumni went to industry.', reason: 'She wants an industry path.',
      evidence: [{ cvQuote: null, clipId: clip.id, entries: [person], note: 'The people page.' }] };
    assert.throws(() => scoreFit(workspace, { ...fit, facets: { alumni: { ...alumni, evidence: [{ cvQuote: 'annotated manipulation tactics in LLM responses',
      clipId: null, entries: [person], note: 'x' }] } } }), /Back named entries with the cutout that names them/);
    assert.throws(() => scoreFit(workspace, { ...fit, facets: { alumni: { ...alumni, evidence: [{ cvQuote: null, clipId: clip.id,
      entries: [{ ...person, url: 'javascript:void(0)' }], note: 'x' }] } } }));
    assert.deepEqual(scoreFit(workspace, { ...fit, facets: { alumni } })['alumni']?.evidence[0]?.entries, [person]);
    assert.deepEqual(getFit(workspace, professor.id)['topic']?.evidence[0]?.entries, []);
    savePaper(workspace, professor.id, { ...paper, openalexId: 'W12', doi: '10.1000/preprint', title: 'A preprint', year: 2025,
      venue: 'arXiv (Cornell University)', authors: ['Jane Doe'], landingUrl: 'https://arxiv.org/abs/2501.00001' });
    savePaper(workspace, professor.id, { ...paper, openalexId: 'W13', doi: '10.1000/swapped', title: 'Family name first', year: 2024,
      authors: ['Doe Jane'], landingUrl: 'https://doi.org/10.1000/swapped' });
    assert.deepEqual(targetOutreach(workspace, professor.id).venues.map((venue) => [venue.venue, venue.preprint, venue.papers.map((item) => item.title)]),
      [['Example Venue', false, ['Exposing manipulation in conversation', 'Family name first']], ['arXiv (Cornell University)', true, ['A preprint']]]);
    const rows = listOutreach(workspace);
    assert.deepEqual(rows.map((row) => [row.professor, row.pathway, row.pitch, row.hold, row.openings, row.deadline, row.contacts.length, row.fit]),
      [['Jane Doe', 'pitch', 'sent', null, 'yes', '2026-12-01', 1, { compute: 1, topic: 3, funding: 1, alumni: 2 }],
        ['John Roe', 'proposal', null, null, 'unknown', null, 0, {}]]);
  });
});
