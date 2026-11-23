import { parseChord, chordNotes, noteName } from '../js/chords.js';
import fs from 'fs';
const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean);
fs.writeFileSync(process.argv[3], lines.map((s) => { let r; try { r = chordNotes(parseChord(s)).map(noteName).join(' '); } catch (e) { r = 'ERROR'; } return s + '\t' + r; }).join('\n') + '\n');
