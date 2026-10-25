'use strict';
const fw = require('./fastwave.js');
const page = fw.loadPage(process.env.PAGE || require('path').resolve(__dirname, '../../../index.html'));
const rasS = new fw.Raster({ W: 1920, H: 1080, NC: 480, S: 512, T: 128, fadeEnds: 0.1, fadeEdges: 0.04, filterSpread: 5.5, tintL: page.WAVE.tintL, tintR: page.WAVE.tintR, preBlur: 1 });
const rasM = new fw.Raster({ W: 960, H: 540, NC: 240, S: 320, T: 96, fadeEnds: 0.1, fadeEdges: 0.04, filterSpread: 5.5, tintL: page.WAVE.tintL, tintR: page.WAVE.tintR, preBlur: 1 });
let t = Date.now(); const { sim, cam, mood } = fw.makeSim(page, 11, {}, {}, 16 / 9, true); console.log('warm', Date.now() - t);
const shade = fw.makeShade(mood);
t = Date.now(); for (let i = 0; i < 1200; i++) sim.step(); console.log('1200 steps', Date.now() - t);
const T = { splatS: 0, finishS: 0, statsS: 0, splatM: 0, finishM: 0 };
const origFinish = rasS.finish.bind(rasS); rasS.finish = () => { const a = Date.now(); origFinish(); T.finishS += Date.now() - a; };
const origFinishM = rasM.finish.bind(rasM); rasM.finish = () => { const a = Date.now(); origFinishM(); T.finishM += Date.now() - a; };
for (let i = 0; i < 6; i++) { for (let k = 0; k < 60; k++) sim.step(); let a = Date.now(); rasS.splat(sim.netCur, cam, shade); T.splatS += Date.now() - a; a = Date.now(); fw.frameStats(rasS); T.statsS += Date.now() - a; }
console.log('stills x6: splat(incl finish)', T.splatS, 'finish', T.finishS, 'stats', T.statsS);
const frames = [];
for (let i = 0; i < 60; i++) { for (let k = 0; k < 12; k++) sim.step(); const a = Date.now(); rasM.splat(sim.netCur, cam, shade); T.splatM += Date.now() - a; frames.push(Float64Array.from(rasM.B)); }
console.log('motion x60: splat(incl finish)', T.splatM, 'finish', T.finishM);
t = Date.now(); fw.motionStats(frames, 5, rasM); console.log('motionStats', Date.now() - t);
