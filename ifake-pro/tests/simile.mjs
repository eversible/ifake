// repeat signs (node tests/simile.mjs): text in/out, what plays, tidying
import { songFromText, songToText, playedMeasures, tidySims, slotList } from '../js/song.js';
import { chordText } from '../js/chords.js';
let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', msg); };
const text = `Title: Sim\nTime: 4/4\nChords:\n| D-7 . G7 . | % | C7 . % . | F7 . . . |\n| B♭7 . . . | E♭7 . . . | %% | . . . . | A7 . . . |`;
const song = songFromText(text);
ok(JSON.stringify(song.marks) === '{"1":{"sim":"bar"},"2":{"sim":"half"},"6":{"sim":"two"}}', 'marks read: ' + JSON.stringify(song.marks));
const played = playedMeasures(song).map((m) => slotList(m).map((x) => (x.chord ? chordText(x.chord) : '.')).join(' '));
ok(played[1] === 'D-7 . G7 .', 'bar 2 plays bar 1: ' + played[1]);
ok(played[2] === 'C7 . C7 .', 'half bar plays the first half: ' + played[2]);
ok(played[6] === 'B♭7 . . .' && played[7] === 'E♭7 . . .', 'two bars play the two before: ' + played[6] + ' | ' + played[7]);
const back = songToText(song);
const again = songFromText(back);
ok(JSON.stringify(again.marks) === JSON.stringify(song.marks), 'text round trip keeps the signs');
console.log(back.split('\n').filter((l) => l.startsWith('|')).join('\n'));
// a chord written under a sign takes it off
song.measures[1].ch[2] = again.measures[0].ch[0];
tidySims(song);
ok(!(song.marks[1] || {}).sim, 'a chord under the sign removes it');
// held chord: bar 1 "C7 . . ." then % → restrikes C7
const s2 = songFromText(`Title: x\nTime: 4/4\nChords:\n| C7 . . . | . . . . | % |`);
const p2 = playedMeasures(s2).map((m) => slotList(m).map((x) => (x.chord ? chordText(x.chord) : '.')).join(' '));
ok(p2[2] === 'C7 . . .', 'a sign after a held chord restrikes it: ' + p2[2]);
console.log(fails ? `${fails} failed` : 'all passed');
process.exitCode = fails ? 1 : 0;
