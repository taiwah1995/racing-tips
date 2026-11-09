import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

function extract(name) {
  const token = 'function ' + name + '(';
  const start = src.indexOf(token);
  if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const loaded = new Function(
  extract('getCurrentMonthKey') + '\n' +
  extract('footballDateMonth') + '\n' +
  extract('footballHktMonthKey') + '\n' +
  extract('footballShiftMonthKey') + '\n' +
  extract('footballCumLineParts') + '\n' +
  extract('footballRangeProfitLabel') + '\n' +
  'return { footballDateMonth, footballHktMonthKey, footballShiftMonthKey, footballCumLineParts, footballRangeProfitLabel };'
);
const {
  footballDateMonth,
  footballHktMonthKey,
  footballShiftMonthKey,
  footballCumLineParts,
  footballRangeProfitLabel,
} = loaded();

test('ledger day month is the YYYY-MM prefix', () => {
  assert.equal(footballDateMonth('2026-11-06'), '2026-11');
  assert.equal(footballDateMonth('2026-10-31'), '2026-10');
  assert.equal(footballDateMonth(''), '');
  assert.equal(footballDateMonth('2026-11'), '');
});

test('Hong Kong calendar month, including the UTC evening before midnight', () => {
  const stillOctober = new Date('2026-10-31T15:30:00Z');
  const justNovember = new Date('2026-10-31T16:30:00Z');
  assert.equal(footballHktMonthKey(stillOctober), '2026-10');
  assert.equal(footballHktMonthKey(justNovember), '2026-11');
  assert.equal(footballHktMonthKey(new Date('2026-11-07T01:47:00Z')), '2026-11');
});

test('previous month wraps the year', () => {
  assert.equal(footballShiftMonthKey('2026-11', -1), '2026-10');
  assert.equal(footballShiftMonthKey('2026-01', -1), '2025-12');
  assert.equal(footballShiftMonthKey('2026-12', 1), '2027-01');
  assert.equal(footballShiftMonthKey('bad', -1), '');
});

test('全部 hides a single day line; a chosen month keeps it', () => {
  const one = [{ item: '11月6日' }];
  assert.deepEqual(footballCumLineParts(one, ''), []);
  assert.deepEqual(footballCumLineParts(one, '2026-11'), one);
  assert.equal(footballCumLineParts([one[0], one[0]], '').length, 2);
});

test('累計總結 filter is separate from the racing month select', () => {
  assert.match(src, /let footballCumRange = 'this'/);
  assert.match(src, /id="fb-month-filter"/);
  assert.match(src, /label: '全部'/);
  assert.match(src, /label: '本月'/);
  assert.match(src, /label: '上月'/);
  assert.equal(src.includes('上半月'), false);
  assert.equal(src.includes('下半月'), false);
  assert.match(src, /const APP_DATA_VERSION = 'football141'/);
  assert.match(src, /累計盈虧/);
  assert.equal(footballRangeProfitLabel('this'), '本月盈虧');
  assert.equal(footballRangeProfitLabel('prev'), '上月盈虧');
  assert.equal(footballRangeProfitLabel('all'), '盈虧');
  assert.equal(footballRangeProfitLabel('2026-09'), '區間盈虧');
  const paint = src.slice(src.indexOf('function paintFootball'), src.indexOf('function bindFootballOnce'));
  assert.match(paint, /'當日總結'/);
  assert.equal(paint.includes('fb-month-filter'), false);
  assert.match(paint, /footballCumulativePanelHtml/);
});
