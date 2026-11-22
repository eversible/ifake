import * as C from '../js/chords.js';
let c = C.parseChord('C'); const t = (q) => { c = C.toggleQual(c, q); return `${C.chordText(c)}${c.auto7 ? ' (7 implied)' : ''}`; };
const steps = [['maj','CΔ7 (7 implied)'], ['maj','C'], ['hdim','Cø7 (7 implied)'], ['dom7','Cø7'], ['dom7','Cø7 (7 implied)'], ['dom7','Cø7'], ['hdim','C7'],
  ['dom7','C'], ['maj','CΔ7 (7 implied)'], ['alt','CΔ7alt (7 implied)'], ['maj','C7alt (7 implied)'], ['alt','C'],
  ['hdim','Cø7 (7 implied)'], ['dom9','Cø9'], ['hdim','C9'], ['dom9','C'], ['hdim','Cø7 (7 implied)'], ['min','C-']];
let fails = 0;
for (const [q, exp] of steps) { const got = t(q); if (got !== exp) fails++; console.log((got === exp ? 'ok  ' : 'FAIL') + ' ' + q.padEnd(5) + ' -> ' + got + (got === exp ? '' : '   expected ' + exp)); }
console.log(fails ? fails + ' failed' : 'all passed');
