#!/usr/bin/env node
// Deterministic renders through the page's mode=score interface, saved as PNG.
// Needs Playwright with Chromium (npm i playwright; npx playwright install chromium).
//
//   node tools/render.js out.png '{"time":"2026-10-15T12:00:00","theme":0,"seed":1,"frames":300,"w":1280,"h":720}'
//   node tools/render.js jobs.json          # a JSON list of [outPath, options] pairs, rendered in one browser
//
// Options are those of the URL in section 9 of docs/SPEC.md (time, theme, seed, frames, w, h, layers).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const args = process.argv.slice(2);
  let jobs;
  if (args.length === 1 && args[0].endsWith('.json')) jobs = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  else if (args.length === 2) jobs = [[args[0], JSON.parse(args[1])]];
  else { console.error('usage: render.js out.png \'{json options}\'  |  render.js jobs.json'); process.exit(1); }
  const page = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?mode=score';
  const browser = await chromium.launch();
  const p = await browser.newPage();
  p.on('pageerror', e => console.error('page error:', e.message));
  await p.goto(page);
  await p.evaluate(() => window.XMBW.ready);
  for (const [out, opts] of jobs) {
    const r = await p.evaluate(o => { const r = window.XMBW.render(o); return { w: r.width, h: r.height, d: Array.from(r.data) }; }, opts);
    fs.writeFileSync(out, png(r.w, r.h, new Uint8Array(r.d)));
    console.log(out, r.w + 'x' + r.h);
  }
  await browser.close();
})();
