// usage: node tools/mkstate.js -> settles the net from the flat start with the current src/sim.js (heavy damping first,
// then warmDecays decay times at its own damping), and writes the result into src/sim.js as the stored starting state
// (the START line). Run it after changing any net constant, then rebuild index.html (python3 tools/build.py). Until then
// the page settles the net itself at start-up, which takes a few seconds.
const fs = require('fs'), path = require('path');
const file = path.resolve(__dirname, '../src/sim.js');
let src = fs.readFileSync(file, 'utf8');
const XMBW_SIM = new Function(src + '; return XMBW_SIM;')();
const M = XMBW_SIM(), sim = M.createSim(1, true);
sim.warm(sim.warmSteps);
const line = /^  const START = .*;$/m;
if (!line.test(src)) throw new Error('START line not found in src/sim.js');
src = src.replace(line, () => '  const START = ' + JSON.stringify(sim.state()) + ';');
fs.writeFileSync(file, src);
console.log('stored starting state written (%d bytes)', JSON.stringify(sim.state()).length);
