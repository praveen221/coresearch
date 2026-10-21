import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locateQuote, stripRunningLines } from '../src/lib/quote.ts';

const pages = [
  'Introduction\nVoice assistants increasingly speak with warmth and first-person phrasing.',
  'Participants listened to a recording of a conversation and then\nreported how likely they would be to accept the offer.',
];

void test('a quotation is found on its page with surrounding context', () => {
  const found = locateQuote(pages, 'reported how likely they would be to accept the offer', true);
  assert.ok(found !== null);
  assert.equal(found.page, 2);
  assert.equal(found.quote, 'reported how likely they would be to accept the offer');
  assert.match(found.before, /^Participants listened/);
  assert.equal(found.after, '.');
  assert.match(found.before, /and then\n$/);
});

void test('extraction artefacts do not hide an honest quotation', () => {
  const extracted = ['The ﬁndings show that self-\nattention models gener-\nalize and that “warmth” matters  greatly.'];
  assert.equal(locateQuote(extracted, 'The findings show that self-attention models generalize', true)?.page, 1);
  assert.notEqual(locateQuote(extracted, 'that "warmth" matters greatly', true), null);
  assert.notEqual(locateQuote(extracted, 'THE FINDINGS SHOW', true), null);
  const glyphs = ['We could not con￿rm that the ￿ow of o￿ers was ﬁxed.'];
  assert.equal(locateQuote(glyphs, 'could not confirm that the flow of offers', true)?.quote, 'could not confirm that the flow of offers');
  assert.equal(locateQuote(glyphs, 'the ﬂow of oﬀers was fixed', true)?.quote, 'the ﬂow of oﬀers was fixed');
  assert.equal(locateQuote(glyphs, 'offers was fixed', true)?.quote, 'oﬀers was ﬁxed'.normalize('NFKC'));
  const broken = ['than those in the non-\nanthropomorphic condition (M = 5.61)'];
  for (const quote of ['the non- anthropomorphic condition', 'the non-anthropomorphic condition', 'the nonanthropomorphic condition']) {
    assert.equal(locateQuote(broken, quote, true)?.quote, 'the non-anthropomorphic condition', quote);
  }
});

void test('a quotation continuing onto the next page is attributed to its first page', () => {
  const found = locateQuote(pages, 'first-person phrasing. Participants listened', true);
  assert.equal(found?.page, 1);
});

void test('paraphrases and invented words are rejected; web pages have no page numbers', () => {
  assert.equal(locateQuote(pages, 'participants heard a recording and rated the offer', true), null);
  assert.equal(locateQuote(pages, '   ', true), null);
  assert.equal(locateQuote([pages[0] ?? ''], 'speak with warmth', false)?.page, null);
});

void test('running headers and footers repeated across pages are removed so quotations can cross pages', () => {
  const bodies = ['Voices were synthesized with Xunfei.', 'Selection rates rose from 2.9% to', '61.7% with exaggerated intensity.', 'Limitations follow.'];
  const pages = bodies.map((body, index) => `${String(index + 1)} • Zhang and Chen et al.\n${body}\n, Vol. 1, No. 1, Article . Publication date: August 2025.`);
  const stripped = stripRunningLines(pages);
  assert.deepEqual(stripped[1], 'Selection rates rose from 2.9% to');
  assert.equal(locateQuote(stripped, 'rose from 2.9% to 61.7% with exaggerated intensity', true)?.page, 2);
  assert.equal(locateQuote(pages, 'rose from 2.9% to 61.7% with exaggerated intensity', true), null);
  assert.deepEqual(stripRunningLines(['Only page\nwith lines']), ['Only page\nwith lines']);
});
