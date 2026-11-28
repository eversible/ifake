// every symbol the grammar writes (root C, plus each chord-tone bass): load it onto the keys, name the keys,
// and check the name is the same chord (same text), or at least the same notes with the same bass
import { nameChord, nameTable, chordKeys } from '../js/recognise.js';
import { chordText, parseChord, chordIntervals, ivlSemis, notePC } from '../js/chords.js';
const m12 = (n) => ((n % 12) + 12) % 12, NM = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const pcs = (c) => new Set(chordIntervals(c).map((i) => m12(notePC(c.root) + ivlSemis(i))));
let n = 0, same = 0, sameNotes = 0, wrong = [], other = [];
const seen = new Set();
for (const [, e] of nameTable()) {
  for (const t0 of [e.t, e.alt].filter(Boolean)) { const base = chordText(parseChord('C' + t0));
  for (const sym of [base, ...[...pcs(parseChord(base))].filter((p) => p !== 0).slice(0, 3).map((p) => `${base}/${NM[p]}`)]) {
    if (seen.has(sym)) continue; seen.add(sym);
    let c; try { c = parseChord(sym); } catch (err) { continue; }
    const keys = chordKeys(c, 48); n++;
    const got = nameChord(keys, 0);
    if (!got) { wrong.push(`${sym}: unnamed (${keys})`); continue; }
    if (chordText(got) === chordText(c)) { same++; continue; }
    const a = pcs(c), b = pcs(got), five = m12(notePC(c.root) + 7), five2 = m12(notePC(got.root) + 7);
    const bassA = c.bass ? notePC(c.bass) : notePC(c.root), bassB = got.bass ? notePC(got.bass) : notePC(got.root);
    const ok = [...a].every((p) => b.has(p) || p === five) && [...b].every((p) => a.has(p) || p === five2) && bassA === bassB;
    if (ok) { sameNotes++; other.push(`${sym} → ${chordText(got)}`); } else wrong.push(`${sym} → ${chordText(got)} (${keys})`);
  }
  }
}
console.log(`symbols ${n} | named back the same ${same} | same notes, another name ${sameNotes} | wrong ${wrong.length}`);
console.log('wrong:', wrong.slice(0, 12).join('; '));
console.log('other names:', other.slice(0, 25).join('; '));
