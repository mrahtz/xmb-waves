// usage: PAGE=page.html OUT=dir node menucheck.js -> opens the settings panel (H) and the fps overlay (F), saves screenshots,
// and reports console errors and the panel's sections and sliders
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../index.html')) + '?time=2026-08-15T12:00&seed=5');
  await p.waitForTimeout(2500);
  await p.keyboard.press('h'); await p.waitForTimeout(800);
  await p.screenshot({ path: (process.env.OUT || '.') + '/panel.png' });
  await p.keyboard.press('f'); await p.waitForTimeout(1500);
  await p.screenshot({ path: (process.env.OUT || '.') + '/fps.png' });
  const info = await p.evaluate(() => ({ panel: !!document.querySelector('details'), sections: document.querySelectorAll('details').length, open: document.querySelectorAll('details[open]').length, sliders: document.querySelectorAll('input[type=range]').length }));
  console.log('console errors:', errs.length, errs.slice(0, 5)); console.log('panel info:', JSON.stringify(info));
  await b.close();
})();
