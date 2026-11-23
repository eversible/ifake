import { unrollBars } from '../js/form.js';
const cases = [
  ['no repeats', 4, {}, '0 1 2 3'],
  ['|: 0 1 :| 2', 3, { 0: { start: true }, 1: { end: 2 } }, '0 1 0 1 2'],
  ['repeat to start (no |:)', 3, { 1: { end: 2 } }, '0 1 0 1 2'],
  ['x3', 3, { 0: { start: true }, 1: { end: 3 } }, '0 1 0 1 0 1 2'],
  ['1st/2nd endings', 5, { 0: { start: true }, 2: { ending: 1, end: 2 }, 3: { ending: 2 } }, '0 1 2 0 1 3 4'],
  ['multi-bar endings', 7, { 0: { start: true }, 2: { ending: 1 }, 3: { ending: 1, end: 2 }, 4: { ending: 2 }, 5: { ending: 2 } }, '0 1 2 3 0 1 4 5 6'],
  ['three endings', 6, { 0: { start: true }, 1: { ending: 1, end: 2 }, 2: { ending: 2, end: 2 }, 3: { ending: 3 } }, '0 1 0 2 0 3 4 5'],
  ['two sections', 6, { 0: { start: true }, 1: { end: 2 }, 2: { start: true }, 3: { ending: 1, end: 2 }, 4: { ending: 2 } }, '0 1 0 1 2 3 2 4 5'],
];
let f = 0;
for (const [name, n, marks, exp] of cases) { const got = unrollBars(n, marks).join(' '); const ok = got === exp; f += !ok; console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(26) + got + (ok ? '' : '   expected ' + exp)); }
console.log(f ? f + ' failed' : 'all passed');
