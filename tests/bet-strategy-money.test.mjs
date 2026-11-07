import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
  extract('escapeHtml') + '\n' +
  extract('betStrategyMoney') + '\n' +
  extract('betStrategySignedMoney') + '\n' +
  extract('betStrategyHasAmount') + '\n' +
  extract('betStrategyPnlClass') + '\n' +
  extract('betStrategySettleHtml') + '\n' +
  extract('betStrategyLinesHtml') + '\n' +
  'return { betStrategyMoney, betStrategySignedMoney, betStrategyHasAmount, betStrategyLinesHtml };'
);
const {
  betStrategyMoney,
  betStrategySignedMoney,
  betStrategyHasAmount,
  betStrategyLinesHtml,
} = loaded();

/** Numeric format locked to the previous helper: $ plus String(number). */
function legacyMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return '$' + String(n);
}

function legacySigned(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const body = legacyMoney(Math.abs(n));
  if (n > 0) return '+' + body;
  if (n < 0) return '\u2212' + body;
  return body;
}

function meetings() {
  const dir = new URL('../data/meetings/', import.meta.url);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8')));
}

function betsOf(meeting) {
  const races = meeting.betStrategy && meeting.betStrategy.races;
  if (!races) return [];
  return Object.values(races).flatMap((block) => (block && block.bets) || []);
}

test('unset stake amounts stay blank and real numbers keep the old format', () => {
  assert.equal(betStrategyMoney(null), '');
  assert.equal(betStrategyMoney(undefined), '');
  assert.equal(betStrategyMoney(''), '');
  assert.equal(betStrategyMoney({}.stake), '');
  for (const amount of [0, 0.0, -0, 10, 10.5, 26, 100, 1650, 0.5, '0', '10']) {
    assert.equal(betStrategyMoney(amount), legacyMoney(amount));
  }
  assert.equal(betStrategySignedMoney(0), '$0');
  assert.equal(betStrategySignedMoney(-30), '\u2212$30');
  assert.equal(betStrategySignedMoney(16), '+$16');
  assert.equal(betStrategyHasAmount(null), false);
  assert.equal(betStrategyHasAmount(''), false);
  assert.equal(betStrategyHasAmount(undefined), false);
  assert.equal(betStrategyHasAmount(0), true);
  assert.equal(betStrategyHasAmount(0.0), true);
});

test('a null stake is omitted and a genuine zero stake is still $0', () => {
  const html = betStrategyLinesHtml({
    bets: [
      { method: '獨贏', detail: '空', stake: null },
      { method: '位置', detail: '零', stake: 0, return: 0, pnl: 0 },
      { method: '連贏', detail: '十', stake: 10, return: 26, pnl: 16 },
    ],
  });
  assert.match(html, /獨贏 · 空</);
  assert.equal(html.includes('獨贏 · 空 · $'), false);
  assert.match(html, /位置 · 零 · \$0/);
  assert.match(html, /回 \$0 · 盈虧 \$0/);
  assert.match(html, /連贏 · 十 · \$10/);
  assert.match(html, /回 \$26 · 盈虧 \+\$16/);
});

test('published numeric stakes, returns, and totals are unchanged', () => {
  const amountKeys = ['stake', 'return', 'pnl', 'raceTotal', 'racePnl', 'raceReturn', 'unit', 'dayTotal', 'dayReturn', 'dayPnl'];
  let numeric = 0;
  for (const meeting of meetings()) {
    if (meeting.id === '2026-11-08-st') continue;
    const strategy = meeting.betStrategy;
    if (!strategy) continue;
    const nodes = [strategy, ...Object.values(strategy.races || {}), ...betsOf(meeting)];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      for (const key of amountKeys) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        const amount = node[key];
        if (typeof amount === 'number') {
          numeric += 1;
          assert.equal(betStrategyMoney(amount), legacyMoney(amount), meeting.id + ' ' + key);
          assert.equal(betStrategySignedMoney(amount), legacySigned(amount), meeting.id + ' ' + key);
        }
      }
    }
  }
  assert.ok(numeric > 0);
});

test('2026-11-04 still shows genuine zero returns beside real stakes', () => {
  const meeting = meetings().find((item) => item.id === '2026-11-04-hv');
  const lines = betStrategyLinesHtml(meeting.betStrategy.races['1']);
  assert.match(lines, /連贏 \(Q\) · 1 膽拖 7,10,12 · \$30/);
  assert.match(lines, /回 \$0 · 盈虧 \u2212\$30/);
  assert.match(lines, /位置 \(P\) · #7 · \$10/);
  assert.match(lines, /回 \$26 · 盈虧 \+\$16/);
});

test('2026-11-08 pending lines show methods and no amounts', () => {
  const meeting = meetings().find((item) => item.id === '2026-11-08-st');
  const races = meeting.betStrategy.races;
  const blocks = Object.values(races);
  const bets = blocks.flatMap((block) => block.bets);
  assert.equal(bets.length, 33);
  for (const block of blocks) {
    assert.equal(block.raceTotal, null);
    assert.equal(block.unit, null);
    for (const bet of block.bets) {
      assert.equal(bet.stake, null);
      assert.equal(bet.units, null);
    }
  }
  assert.equal(meeting.betStrategy.unit, null);
  assert.equal(meeting.betStrategy.dayTotal, null);
  assert.equal(meeting.betStrategy.pendingAmounts, true);
  const html = blocks.map((block) => betStrategyLinesHtml(block)).join('');
  const lines = html.match(/<li /g) || [];
  assert.equal(lines.length, 33);
  assert.equal(html.includes('$'), false);
  assert.match(html, /四連環 · 2 &gt; 10, 4, 6, 7, 3/);
  assert.match(html, /四連環 · 4 &gt; 8, 14, 7, 11, 3/);
  assert.equal((html.match(/四連環\/四重彩/g) || []).length, 9);
  assert.equal((html.match(/四連環 ·/g) || []).length, 2);
});
