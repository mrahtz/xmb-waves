// usage: PAGE=page.html node shot.js '[["out.png", {render options}], ...]'  -> PNGs via window.XMBW.render (score mode);
// PAGE defaults to the repository's index.html
const { chromium } = require('playwright');
const fs = require('fs'); const zlib = require('zlib');
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('console', m => console.log('console:', m.text())); p.on('pageerror', e => console.log('pageerror:', e.message));
  const jobs = JSON.parse(process.argv[2]);
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../index.html')) + '?mode=score');
  await p.evaluate(() => window.XMBW.ready);
  for (const [out, opts] of jobs) {
    const t0 = Date.now();
    const r = await p.evaluate(o => { const r = window.XMBW.render(o); return { w: r.width, h: r.height, d: Array.from(r.data) }; }, opts);
    fs.writeFileSync(out, png(r.w, r.h, new Uint8Array(r.d)));
    console.log(out, Date.now() - t0, 'ms');
  }
  await b.close();
})();
