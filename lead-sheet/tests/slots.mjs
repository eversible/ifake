import { newSong, slotList, setDivision, setSlot, getSlot, barChordText, parseChordBars, songFromText, songToText, serialiseSong, deserialiseSong, fillChords } from '../js/song.js';
import { parseChord, chordText } from '../js/chords.js';
const ok = (c, msg) => { if (!c) { console.log('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
const s = newSong({ bars: 2 }); const m = s.measures[0];
m.ch[0] = parseChord('C'); m.ch[3] = parseChord('G7');
ok(setDivision(m, 3, 2) === 0 && barChordText(m) === 'C . . [G7 .]', 'split beat 4 in two: ' + barChordText(m));
setSlot(m, 3, 1, parseChord('Db7'));
ok(barChordText(m) === 'C . . [G7 D♭7]', 'anticipation: ' + barChordText(m));
ok(setDivision(m, 3, 4) === 0 && barChordText(m) === 'C . . [G7 . D♭7 .]', '2 → 4 keeps positions: ' + barChordText(m));
ok(setDivision(m, 3, 3) === 0 && barChordText(m) === 'C . . [G7 D♭7 .]', '4 → 3 snaps the ½ to ⅓ or ⅔: ' + barChordText(m));
ok(setDivision(m, 3, 1) === 1 && barChordText(m) === 'C . . G7', '3 → 1 drops the extra chord: ' + barChordText(m));
ok(setDivision(m, 3, 't') === -1, 'no quarter triplet on the last beat');
m.ch[1] = parseChord('F'); m.ch[2] = parseChord('A-');
ok(setDivision(m, 1, 't') === 0 && barChordText(m) === 'C 2[F A- .] G7', 'quarter triplet over beats 2-3: ' + barChordText(m));
ok(JSON.stringify(slotList(m).map((x) => +x.pos.toFixed(3))) === '[0,1,1.667,2.333,3]', 'slot positions ' + JSON.stringify(slotList(m).map((x) => +x.pos.toFixed(3))));
ok(setDivision(m, 1, 1) === 0 && barChordText(m) === 'C F A- G7', 'triplet → plain beats puts A- back on 3: ' + barChordText(m));
// text round trip
const t = `Title: T\nKey: C\nTime: 4/4\nChords:\n| C . [F G] . | 2[D- E- F] [A7 . . Bb7] G7 | [C E-] . . 2[C D] |\nMelody:\n1:C5 | 1:D5 | 1:E5 |`;
let sx;
try { sx = songFromText(t); ok(false, 'bad group rejected'); } catch (e) { ok(/2\[a b c\]/.test(e.message), 'bad group message: ' + e.message); }
const t2 = t.replace(' 2[C D]', ' 2[. . .]');
sx = songFromText(t2);
const back = songToText(sx).split('\n').filter((l) => l.startsWith('|')).join(' ');
ok(back.includes('| C . [F G] . | 2[D- E- F] [A7 . . B♭7] G7 | [C E-] . . . |'), 'text round trip: ' + back);
const j = JSON.parse(JSON.stringify(serialiseSong(sx)));
const sy = deserialiseSong(j);
ok(songToText(sy) === songToText(sx), 'storage round trip');
ok(JSON.stringify(serialiseSong(sy)) === JSON.stringify(j), 'storage stable');
