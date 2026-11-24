// repeat signs and beat slashes (node tests/simile.mjs): text in/out, what plays, tidying
import { songFromText, songToText, playedMeasures, tidySims, syncSlashes, slotList, serialiseSong, deserialiseSong } from '../js/song.js';
import { chordText, parseChord } from '../js/chords.js';
let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', msg); };
const bar = (meas) => slotList(meas).map((x) => (x.chord ? (x.chord.rep ? '/' : chordText(x.chord)) : '.')).join(' ');
const playedBar = (meas) => slotList(meas).map((x) => (x.chord ? chordText(x.chord) : '.')).join(' ');
const text = `Title: Sim\nTime: 4/4\nChords:\n| D-7 . G7 . | % | C7 / / / | F7 . . . |\n| B♭7 . . . | E♭7 . . . | %% | . . . . | A7 . . . |`;
const song = songFromText(text);
ok(JSON.stringify(song.marks) === '{"1":{"sim":"bar"},"6":{"sim":"two"}}', 'marks read: ' + JSON.stringify(song.marks));
ok(bar(song.measures[2]) === 'C7 / / /', 'beat slashes read: ' + bar(song.measures[2]));
const played = playedMeasures(song).map(playedBar);
ok(played[1] === 'D-7 . G7 .', 'bar 2 plays bar 1: ' + played[1]);
ok(played[2] === 'C7 C7 C7 C7', 'slashes play the chord before: ' + played[2]);
ok(played[6] === 'B♭7 . . .' && played[7] === 'E♭7 . . .', 'two bars play the two before: ' + played[6] + ' | ' + played[7]);
const back = songToText(song), again = songFromText(back);
ok(JSON.stringify(again.marks) === JSON.stringify(song.marks) && bar(again.measures[2]) === 'C7 / / /', 'text round trip keeps signs and slashes');
const stored = deserialiseSong(JSON.parse(JSON.stringify(serialiseSong(song))));
ok(bar(stored.measures[2]) === 'C7 / / /', 'saved and loaded: ' + bar(stored.measures[2]));
// typed "C7 / /" in 4/4: C7 for two beats, then two slashes
const t2 = songFromText(`Title: x\nTime: 4/4\nChords:\n| C7 / / | Dm7 / G7 / |`);
ok(bar(t2.measures[0]) === 'C7 . / /' && bar(t2.measures[1]) === 'D-7 / G7 /', 'C7 / / and Dm7 / G7 /: ' + bar(t2.measures[0]) + ' | ' + bar(t2.measures[1]));
// the chord before changes: the slashes follow; a slash changed by hand becomes a chord
t2.measures[0].ch[0] = parseChord('E7'); syncSlashes(t2);
ok(playedBar(t2.measures[0]) === 'E7 . E7 E7', 'slashes follow the chord before: ' + playedBar(t2.measures[0]));
t2.measures[0].ch[2] = Object.assign(parseChord('A7'), { rep: true, repOf: 'E7' }); syncSlashes(t2);
ok(bar(t2.measures[0]) === 'E7 . A7 /' && playedBar(t2.measures[0]) === 'E7 . A7 A7', 'a slash changed by hand becomes a chord: ' + bar(t2.measures[0]));
// a chord written under a sign takes it off
song.measures[1].ch[2] = parseChord('G7'); tidySims(song);
ok(!(song.marks[1] || {}).sim, 'a chord under the sign removes it');
// a sign after a held chord restrikes it
const s2 = songFromText(`Title: x\nTime: 4/4\nChords:\n| C7 . . . | . . . . | % |`);
ok(playedBar(playedMeasures(s2)[2]) === 'C7 . . .', 'a sign after a held chord restrikes it');
console.log(fails ? `${fails} failed` : 'all passed');
process.exitCode = fails ? 1 : 0;
