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
  extract('formatFbOdds') + '\n' +
  extract('footballOddsAreWater') + '\n' +
  extract('footballParlayFactor') + '\n' +
  'return footballParlayFactor;'
);
const footballParlayFactor = loaded();

test('1.17 decimal stays 1.17 and 0.83 water becomes 1.83', () => {
  const decimal = footballParlayFactor('1.17', '主客和 主勝');
  const water = footballParlayFactor('0.83', '讓球 主勝 +0');
  assert.equal(decimal.value, 1.17);
  assert.equal(water.value, 1.83);
  assert.equal(footballParlayFactor('1.17', 'HAD主').value, 1.17);
  assert.equal(footballParlayFactor('0.83', '入球 大 2.5').value.toFixed(2), '1.83');
  assert.equal(footballParlayFactor('1.83', '讓球 客勝 +0/+0.5').value, 1.83);
  assert.equal(footballParlayFactor('1.42', '主客和 主勝').value, 1.42);
  assert.equal(footballParlayFactor('0.93', '讓球 主勝 +0/+0.5').value.toFixed(2), '1.93');
});
