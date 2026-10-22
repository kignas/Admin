import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
test('payout UI calls the backend reconciliation endpoint', () => {
  const s = read('manage-settlements.js');
  assert.match(s, /\/admin\/payout-requests\/\$\{encodeURIComponent\(id\)\}\/reconciliation/);
  assert.match(s, /canMarkPaid !== true/);
  assert.match(s, /required: isPaid/);
  assert.match(s, /body\.bankUtr = input/);
});
test('support UI displays complaint photos and message attachments using HTTPS links only', () => {
  const s = read('manage-support.js');
  assert.match(s, /t\.photos/);
  assert.match(s, /msg\.attachments/);
  assert.match(s, /u\.protocol === 'https:'/);
});
test('review UI displays item ratings and review evidence from backend response', () => {
  const s = read('manage-reviews.js');
  assert.match(s, /x\.itemRatings/);
  assert.match(s, /x\.photos/);
  assert.match(s, /x\.riderScore/);
});
