import * as C from '../js/chords.js';
let fails = 0;
const show = (c) => C.chordText(c) + ' = ' + C.chordNotes(c).map(C.noteName).join(' ') + (c.bass ? ' / bass ' + C.noteName(c.bass) : '');
const eq = (label, got, exp) => { const ok = got === exp; if (!ok) fails++; console.log((ok ? '  ok  ' : '  FAIL') + ' ' + label.padEnd(26) + got + (ok ? '' : '   expected: ' + exp)); };
const N = (s) => C.chordNotes(C.parseChord(s)).map(C.noteName).join(' ');
console.log('iReal shorthands');
eq('C^7', N('C^7'), 'C E G B'); eq('C^', N('C^'), 'C E G B'); eq('C-7b5', N('C-7b5'), 'C E♭ G♭ B♭');
eq('Ch7', N('Ch7'), 'C E♭ G♭ B♭'); eq('Ch', N('Ch'), 'C E♭ G♭ B♭'); eq('C7b9#11', N('C7b9#11'), 'C E G B♭ D♭ F♯');
eq('C7sus', N('C7sus'), 'C F G B♭'); eq('C69', N('C69'), 'C E G A D'); eq('Cm6', N('Cm6'), 'C E♭ G A'); eq('Bb13#11', N('Bb13#11'), 'B♭ D F A♭ C E G');
eq('C7alt', N('C7alt'), 'C E G♭ B♭ D♭ D♯ A♭'); eq('Cadd9', N('Cadd9'), 'C E G D');
console.log('slash chords / N.C.');
eq('C/E', show(C.parseChord('C/E')), 'C/E = C E G / bass E'); eq('D-7/C', show(C.parseChord('D-7/C')), 'D-7/C = D F A C / bass C');
eq('C6/9 not slash', show(C.parseChord('C6/9')), 'C6/9 = C E G A D'); eq('N.C.', C.chordText(C.parseChord('N.C.')), 'N.C.');
console.log('canonical text round trip');
for (const s of ['C-7b5', 'Ch7', 'F#^9', 'Eb-^7', 'G7b9#11', 'A7sus4', 'Bb/D', 'C-+7', 'Dbo7', 'C13(♯11)/E', 'G7alt']) {
  const c = C.parseChord(s), t = C.chordText(c), back = C.chordText(C.parseChord(t));
  eq(`${s} -> ${t}`, back, t);
}
console.log('errors');
for (const s of ['C77', 'Cxyz', 'H7', 'C7(foo)', 'C7(b9', 'C--7']) { let r = 'no error'; try { C.parseChord(s); } catch (e) { r = e.message; } console.log('  ' + s.padEnd(10) + r); if (r === 'no error') fails++; }
console.log('toggles');
let c = C.parseChord('C');
c = C.toggleQual(c, 'min'); eq('C + min', C.chordText(c), 'C-');
c = C.toggleQual(c, 'dom7'); eq('+7', C.chordText(c), 'C-7');
c = C.toggleQual(c, 'dom9'); eq('9 replaces 7', C.chordText(c), 'C-9');
c = C.toggleQual(c, 'hdim'); eq('ø replaces -', C.chordText(c), 'Cø9');
c = C.toggleQual(c, 'dom9'); eq('9 off', C.chordText(c), 'Cø');
c = C.toggleQual(C.parseChord('G'), 'alt'); eq('alt adds 7', C.chordText(c), 'G7alt');
c = C.toggleExt(C.parseChord('G7'), { kind: 'acc', i: C.parseInterval('♭9') }); eq('G7 + ♭9', C.chordText(c), 'G7(♭9)');
c = C.toggleExt(c, { kind: 'acc', i: C.parseInterval('♭9') }); eq('♭9 off', C.chordText(c), 'G7');
c = C.toggleExt(C.parseChord('C7(♯5)'), { kind: 'acc', i: C.parseInterval('♭5') }); eq('♭5 replaces ♯5', C.chordText(c), 'C7(♭5)');
c = C.toggleExt(C.parseChord('C7(sus4)'), { kind: 'sus', i: C.parseInterval('2') }); eq('sus2 replaces sus4', C.chordText(c), 'C7(sus2)');
console.log('transpose / enharmonic');
eq('C/E +1', C.chordText(C.transposeChord(C.parseChord('C/E'), 1)), 'D♭/F'); eq('B-7 +1', C.chordText(C.transposeChord(C.parseChord('B-7'), 1)), 'C-7');
eq('F♯ +0', C.chordText(C.transposeChord(C.parseChord('F#7'), 0)), 'G♭7'); eq('enh C♯', C.noteName(C.enharmonic(C.parseNote('C#'))), 'D♭');
eq('enh F♭', C.noteName(C.enharmonic(C.parseNote('Fb'))), 'E'); eq('midi C4', String(C.noteMidi(C.parseNote('C'), 4)), '60');
console.log(fails ? `${fails} FAILED` : 'all passed');
