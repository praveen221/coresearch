import assert from 'node:assert/strict';
import { test } from 'node:test';
import { limitMessage, toWork } from '../src/lib/openalex.ts';

void test('OpenAlex records become works with a rebuilt abstract, short ids, and PDF candidates', () => {
  const work = toWork({
    id: 'https://openalex.org/W123',
    doi: 'https://doi.org/10.48550/arxiv.2401.01234',
    display_name: ' Deceptive by design ',
    publication_year: 2025,
    authorships: [{ author: { display_name: 'Katie Seaborn' } }, { author: { display_name: null } }],
    primary_location: { landing_page_url: 'https://arxiv.org/abs/2401.01234', source: { display_name: 'arXiv' } },
    best_oa_location: { pdf_url: 'https://example.org/paper.pdf' },
    locations: [{ pdf_url: 'https://example.org/paper.pdf' }, null],
    referenced_works: ['https://openalex.org/W9'],
    abstract_inverted_index: { voice: [1], Humanlike: [0], agents: [2] },
    cited_by_count: 4,
  });
  assert.deepEqual(work, {
    openalexId: 'W123', doi: '10.48550/arxiv.2401.01234', title: 'Deceptive by design', year: 2025, date: null, type: null,
    venue: 'arXiv', authors: ['Katie Seaborn'], abstract: 'Humanlike voice agents', references: ['W9'],
    pdfUrls: ['https://example.org/paper.pdf', 'https://arxiv.org/pdf/2401.01234'],
    landingUrl: 'https://arxiv.org/abs/2401.01234', citedBy: 4,
  });
});

void test('records without abstracts or open copies stay explicit', () => {
  const work = toWork({ id: 'https://openalex.org/W5', display_name: null, abstract_inverted_index: null });
  assert.equal(work.title, 'Untitled');
  assert.equal(work.abstract, null);
  assert.deepEqual(work.pdfUrls, []);
  assert.throws(() => toWork({ display_name: 'No id' }));
});

void test('a spent daily allowance says when it resets and how to continue', () => {
  assert.match(limitMessage('10415'), /resets in about 3 h\..*OPENALEX_API_KEY.*paper:document/);
  assert.doesNotMatch(limitMessage(null), /resets/);
});
