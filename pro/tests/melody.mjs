import * as M from '../js/melody.js';
let fails = 0;
const ok = (label, got, exp) => { const g = typeof got === 'string' ? got : JSON.stringify(got); const pass = g === exp; fails += !pass; console.log((pass ? 'ok   ' : 'FAIL ') + label.padEnd(34) + g + (pass ? '' : '\n      expected ' + exp)); };
const song = () => ({ time: { num: 4, den: 4 }, key: { fifths: -2 }, measures: [M.emptyMeasure(4 * M.TPQ, 4), M.emptyMeasure(4 * M.TPQ, 4)] });
const P = M.parsePitch;
let s = song(), c = { m: 0, pos: 0 }, r;
ok('empty bar', M.melodyText(s, 0, 1), '1:r');
r = M.enter(s, c, P('Bb4'), { b: 4, d: 0 }); c = r.cursor;
ok('quarter into empty bar', M.melodyText(s, 0, 1), '4:Bb4 4:r 2:r');
r = M.enter(s, c, P('D5'), { b: 8, d: 1 }); c = r.cursor;
ok('dotted eighth next', M.melodyText(s, 0, 1), '4:Bb4 8.:D5 16:r 2:r');
r = M.enter(s, c, P('F5'), { b: 2, d: 1 }); c = r.cursor;
ok('3 beats from beat 1.75 (tied, on grid)', M.melodyText(s, 0, 2), '4:Bb4 8.:D5 16:F5~ 2:F5~ | 8.:F5 16:r 4:r 2:r');
ok('cursor after the tie', c, '{"m":1,"pos":7560}');
c = { m: 1, pos: M.TPQ };
r = M.enter(s, c, P('G5'), { b: 8, d: 0 }, 3); c = r.cursor;
ok('triplet starts on beat 2', M.melodyText(s, 1, 2), '8.:F5 16:r 3[8:G5 8:r 8:r] 2:r');
r = M.enter(s, c, P('A5'), { b: 8, d: 0 }); c = r.cursor; r = M.enter(s, c, P('C6'), { b: 8, d: 0 }); c = r.cursor;
ok('triplet filled', M.melodyText(s, 1, 2), '8.:F5 16:r 3[8:G5 8:A5 8:C6] 2:r');
r = M.enter(s, c, null, { b: 4, d: 0 }); c = r.cursor;
ok('rest entry', M.melodyText(s, 1, 2), '8.:F5 16:r 3[8:G5 8:A5 8:C6] 4:r 4:r');
r = M.enter(s, { m: 1, pos: M.TPQ * 0.75 }, P('Eb5'), { b: 4, d: 0 });
ok('overlapping a tuplet removes it', M.melodyText(s, 1, 2), '8.:F5 4:Eb5 16:r 4:r 4:r');
M.toRest(s, { m: 1, i: 0 });
ok('delete tied-to note clears the tie', M.melodyText(s, 0, 2), '4:Bb4 8.:D5 16:F5~ 2:F5 | 8.:r 4:Eb5 16:r 4:r 4:r');
// quintuplet and sextuplet
s = song(); c = { m: 0, pos: 0 };
for (const p of ['C5', 'D5', 'E5', 'F5', 'G5']) { r = M.enter(s, c, P(p), { b: 16, d: 0 }, 5); c = r.cursor; }
ok('quintuplet', M.melodyText(s, 0, 1), '5[16:C5 16:D5 16:E5 16:F5 16:G5] 4:r 2:r');
// text round trip with every feature
const txt = '16:r 16:F4 8:A4 | 4.:G4 8:Bb4 3[8:D5 8:E5 8:G5] 4:Bb5~ | 8:Bb5 8:A5 2.:C#5 | 5[16:Eb5 16:D5 16:C5 16:Bb4 16:A4] 4:C5 8.:Eb5 16:F5 4:A5';
s = { time: { num: 4, den: 4 }, measures: [{ len: M.TPQ, ev: [], ch: [null] }] };
M.setMelody(s, M.parseMelody(txt, s), 0);
ok('round trip', M.melodyText(s), txt);
let err = ''; try { M.setMelody(s, M.parseMelody('4:C5 4:D5', s), 1); } catch (e) { err = e.message; }
ok('wrong length bar', err, 'bar 2 has 2 beats of notes; it needs 4');
const pn = M.playableNotes(s).map((n) => `${n.midi}:${n.ticks / M.TPQ}`).join(' ');
ok('ties merged for playback', pn.split(' ').slice(0, 6).join(' '), '65:0.25 69:0.5 67:1.5 70:0.5 74:0.3333333333333333 76:0.3333333333333333');
ok('spell Gb in Bb major', JSON.stringify(M.spellMidi(66, -2)), '{"l":4,"a":-1,"o":4}');
ok('spell F# in D major', JSON.stringify(M.spellMidi(66, 2)), '{"l":3,"a":1,"o":4}');
console.log(fails ? fails + ' failed' : 'all passed');
