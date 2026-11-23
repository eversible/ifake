import * as C from '../js/chords.js';
import { voiceChord } from '../js/voicing.js';
const N = (s) => { try { return C.chordText(C.parseChord(s)) + ' = ' + C.chordNotes(C.parseChord(s)).map(C.noteName).join(' '); } catch (e) { return 'ERROR ' + e.message; } };
for (const s of ['C96', 'C7susb9', 'C9sus4', 'C5', 'C2', 'C–7', 'C−7', 'G7sus', 'Csus♭2', 'C7(sus♭2)']) console.log(s.padEnd(10), N(s));
console.log('enh C ->', C.noteName(C.enharmonic(C.parseNote('C'))), '| enh B ->', C.noteName(C.enharmonic(C.parseNote('B'))), '| enh B♯ ->', C.noteName(C.enharmonic(C.parseNote('B#'))));
console.log('Δ key on C ->', C.chordText(C.toggleQual(C.parseChord('C'), 'maj')), '| on C9 ->', C.chordText(C.toggleQual(C.parseChord('C9'), 'maj')));
console.log('shell C ->', JSON.stringify(voiceChord(C.parseChord('C'), 'shell')), '| shell C-7 ->', JSON.stringify(voiceChord(C.parseChord('C-7'), 'shell')));
console.log('all omitted ->', JSON.stringify(voiceChord(C.parseChord('C(omit1, omit3, omit5)'), 'smooth', [60, 64])));
