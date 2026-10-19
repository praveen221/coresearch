import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locateQuote } from '../src/lib/quote.ts';

const pages = [
  'Introduction\nVoice assistants increasingly speak with warmth and first-person phrasing.',
  'Participants listened to a recording of a conversation and then\nreported how likely they would be to accept the offer.',
];

void test('a quotation is found on its page with surrounding context', () => {
  const found = locateQuote(pages, 'reported how likely they would be to accept the offer', true);
  assert.ok(found !== null);
  assert.equal(found.page, 2);
  assert.equal(found.quote, 'reported how likely they would be to accept the offer');
  assert.match(found.before, /recording of a conversation and then$/);
  assert.equal(found.after, '.');
});

void test('extraction artefacts do not hide an honest quotation', () => {
  const extracted = ['The ﬁndings show that self-\nattention models gener-\nalize and that “warmth” matters  greatly.'];
  assert.equal(locateQuote(extracted, 'The findings show that self-attention models generalize', true)?.page, 1);
  assert.notEqual(locateQuote(extracted, 'that "warmth" matters greatly', true), null);
  assert.notEqual(locateQuote(extracted, 'THE FINDINGS SHOW', true), null);
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
