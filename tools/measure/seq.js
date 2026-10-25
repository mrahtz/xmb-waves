// usage: node seq.js outdir '{"time":..,"seed":..,"w":..,"h":..}' startFrame count step
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [out, optsJ, start, count, step] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../index.html')) + '?mode=score'); await p.evaluate(() => window.XMBW.ready);
  for (let i = 0; i < +count; i++) {
    const o = { ...JSON.parse(optsJ), frames: +start + i * +step };
    const url = await p.evaluate(o => { const r = window.XMBW.render(o);
      const c = document.createElement('canvas'); c.width = r.width; c.height = r.height;
      c.getContext('2d').putImageData(new ImageData(r.data, r.width, r.height), 0, 0); return c.toDataURL('image/png'); }, o);
    fs.writeFileSync(`${out}/${String(i).padStart(4, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  await b.close();
})();
