// 1) every set of notes, with every note in the bass: any name given must play exactly those notes
//    (a 7th chord or 6/9 may add its perfect 5th), with the bass right
// 2) every symbol the grammar writes from a core + tensions: its notes, voiced, get a name that plays them
import { nameChord, nameTable } from '../js/recognise.js';
import { chordText, parseChord, chordIntervals, ivlSemis, notePC } from '../js/chords.js';
const m12 = (n) => ((n % 12) + 12) % 12;
const pcsAbs = (c) => new Set(chordIntervals(c).map((i) => m12(notePC(c.root) + ivlSemis(i))));
let named = 0, unnamed = 0, bad = [], bySize = {};
for (let mask = 1; mask < 4096; mask++) {
  const pcs = []; for (let b = 0; b < 12; b++) if (mask & (1 << b)) pcs.push(b);
  if (pcs.length < 2) continue;
  for (const bass of pcs) {
    const midis = [48 + bass, ...pcs.filter((p) => p !== bass).map((p) => 60 + p)];
    const c = nameChord(midis, 0);
    const k = pcs.length; bySize[k] = bySize[k] || [0, 0];
    if (!c) { unnamed++; bySize[k][1]++; continue; }
    named++; bySize[k][0]++;
    const got = pcsAbs(c), want = new Set(pcs), five = m12(notePC(c.root) + 7);
    const extra = [...got].filter((p) => !want.has(p)), missing = [...want].filter((p) => !got.has(p) && !(c.bass && p === notePC(c.bass)));
    const fiveOk = extra.length === 0 || (extra.length === 1 && extra[0] === five);
    const bassOk = c.bass ? notePC(c.bass) === bass : notePC(c.root) === bass;
    if (!fiveOk || missing.length || !bassOk) bad.push(`${pcs.join(',')} bass ${bass}: ${chordText(c)} extra ${extra} missing ${missing}`);
  }
}
console.log('named', named, 'unnamed', unnamed, '| wrong names:', bad.length);
console.log(bad.slice(0, 15).join('\n'));
console.log('by number of notes [named, unnamed]:', JSON.stringify(bySize));
// 2) round trip from the grammar
let symbols = 0, misses = [], sameRootOther = 0;
for (const [key, e] of nameTable()) {
  for (const t of [e.t, e.alt].filter(Boolean)) {
    symbols++;
    const c0 = parseChord('C' + t), notes = [...pcsAbs(c0)].sort((a, b) => a - b).map((p) => 60 + p);
    const c = nameChord(notes, 0);
    const five = c && m12(notePC(c.root) + 7);
    const ok = c && [...pcsAbs(c0)].every((p) => pcsAbs(c).has(p)) && [...pcsAbs(c)].every((p) => pcsAbs(c0).has(p) || p === five);
    if (ok && chordText(c) !== 'C' + t && !c.bass) sameRootOther++;
    if (!ok) misses.push(`C${t} → ${c ? chordText(c) : '—'}`);
  }
}
console.log('table symbols checked:', symbols, '| not named back:', misses.length, '| named another way with the same notes:', sameRootOther); console.log(misses.slice(0, 10).join('\n'));
process.exitCode = bad.length || misses.length ? 1 : 0;
