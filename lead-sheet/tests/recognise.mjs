// chord naming from piano notes, including inversions (node tests/recognise.mjs)
import { nameChord, chordKeys } from '../js/recognise.js';
import { chordText, parseChord } from '../js/chords.js';
let fails = 0;
const t = (midis, want, fifths = 0) => {
  const c = nameChord(midis, fifths), got = c ? chordText(c) : '—';
  const ok = got === want; if (!ok) fails++;
  console.log(ok ? 'ok  ' : 'FAIL', midis.join(' ').padEnd(22), '→', got, ok ? '' : `(want ${want})`);
};
t([57, 60, 64], 'A-');                 // A C E
t([52, 57, 60], 'A-/E');               // E A C
t([48, 52, 57], 'A-/C');               // C E A
t([40, 57, 60, 64, 69], 'A-/E');       // spread + doubled
t([48, 52, 55], 'C');
t([52, 55, 60], 'C/E');
t([55, 60, 64], 'C/G');
t([48, 52, 55, 57], 'C6');             // root position wins over A-7/C
t([57, 60, 64, 67], 'A-7');
t([52, 55, 58, 60], 'C7/E');
t([58, 60, 64, 67], 'C7/B♭');
t([59, 62, 65, 67], 'G7/B');
t([48, 52, 58], 'C7');                 // no 5th
t([50, 53, 57, 60, 64], 'D-9');
t([60, 64, 68], 'C+');                 // augmented: root position
t([48, 51, 54, 57], 'Co7');
t([60, 63, 68], 'A♭/C', -4);           // in A♭: spelled with flats
t([48, 52, 55, 58, 61], 'C7(♭9)');
t([48, 49], '—');
console.log('keys A-/E from C3:', chordKeys(parseChord('A-/E'), 48).join(','), '| C7/B♭:', chordKeys(parseChord('C7/B♭'), 48).join(','), '| G7:', chordKeys(parseChord('G7'), 48).join(','));
console.log(fails ? `${fails} failed` : 'all passed');
process.exitCode = fails ? 1 : 0;
