import { songFromText, songToText, serialiseSong, deserialiseSong, playOrder, cellMap } from '../js/song.js';
import { DEMO_SONG_TEXT } from '../js/demo.js';
import { measureFull, playableNotes, melodyText } from '../js/melody.js';
const s = songFromText(DEMO_SONG_TEXT);
console.log('bars:', s.measures.length, '| pickup:', s.pickup, '| key fifths:', s.key.fifths, '| tempo:', s.tempo);
console.log('all bars full:', s.measures.every(measureFull));
console.log('marks:', JSON.stringify(s.marks));
const cm = cellMap(s); const order = playOrder(s);
const barsPlayed = []; for (const c of order) { const m = cm.ofCell[c]; if (barsPlayed[barsPlayed.length - 1] !== m) barsPlayed.push(m); }
console.log('bars played:', barsPlayed.join(' '));
console.log('notes:', playableNotes(s).length);
const t = songToText(s), s2 = songFromText(t);
console.log('text round trip identical:', songToText(s2) === t);
const j = JSON.stringify(serialiseSong(s)), s3 = deserialiseSong(JSON.parse(j));
console.log('storage round trip identical:', songToText(s3) === t, '| stored size', (j.length / 1024).toFixed(1), 'KB');
console.log(t.split('\n').slice(0, 9).join('\n'));
