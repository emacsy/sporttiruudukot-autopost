// Hakee päivän ruudukot sporttiruudukot.fi:stä ja piirtää niistä Instagram-kuvat.
// Käyttö: node generate.js   (kaikki leagues.json-tiedoston liigat)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LEAGUES = JSON.parse(fs.readFileSync(path.join(__dirname, 'leagues.json'), 'utf8'));
const OUT = path.join(__dirname, 'output');
const FONTS = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Barlow:wght@500;600&family=Barlow+Condensed:wght@600;700&display=block';

async function scrape(page, league) {
  await page.goto(league.url, { waitUntil: 'load' });
  await page.waitForSelector('#board .hd');
  return page.evaluate(() => {
    const read = el => {
      const badge = el.querySelector('.badge');
      if (badge) {
        const st = badge.getAttribute('style');
        const v = k => (st.match(new RegExp(k + ':([^;]+)')) || [])[1];
        return { team: true, abbr: badge.textContent.trim(), c1: v('--c1'), c2: v('--c2'), c3: v('--c3'),
                 label: el.querySelector('.nm').childNodes[0].textContent.trim() };
      }
      return { team: false, label: el.querySelector('.stat b').textContent.trim(),
               sub: (el.querySelector('.stat small') || {}).textContent || '' };
    };
    const hds = [...document.querySelectorAll('#board .hd')];
    return {
      dateText: document.getElementById('date').textContent.trim(),   // esim. "#16 · 21.11.2026"
      cols: hds.filter(h => !h.classList.contains('row')).map(read),
      rows: hds.filter(h => h.classList.contains('row')).map(read),
    };
  });
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const BASE_CSS = `
*{box-sizing:border-box;margin:0}
body{background:#0D1A28;color:#E5EDF5;font-family:Barlow,sans-serif;overflow:hidden}
.page{position:relative;width:var(--w);height:var(--h);padding:var(--pad);display:flex;flex-direction:column}
.page:after{content:"";position:absolute;left:0;right:0;bottom:0;height:18px;background:#C8102E}
.disp{font-family:"Big Shoulders Display",sans-serif;font-weight:900;text-transform:uppercase;line-height:.9}
.cond{font-family:"Barlow Condensed",sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.muted{color:#8B9DB0}
.red{color:#FF4B5C}
.mini{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.mini i{display:block;aspect-ratio:1;border-radius:12px;background:#23364A}
.mini i.on{background:#C8102E}
`;

function header(h) {
  if (h.team) return `<div class="hd"><div class="badge" style="background:${h.c1};color:${h.c3};border-bottom:10px solid ${h.c2}">${esc(h.abbr)}</div><div class="nm cond">${esc(h.label)}</div></div>`;
  const long = Math.max(...h.label.split(/[\s\u00ad-]+/).map(w => w.length)) > 9 || h.label.length > 18;
  return `<div class="hd"><div class="stat"><b class="disp${long ? ' long' : ''}">${esc(h.label)}</b>${h.sub ? `<small class="cond muted">${esc(h.sub)}</small>` : ''}</div></div>`;
}

function leagueHtml(league, g, story) {
  const cells = [];
  cells.push(`<div class="corner disp">?</div>`);
  g.cols.forEach(c => cells.push(header(c)));
  g.rows.forEach(r => { cells.push(header(r)); for (let i = 0; i < 3; i++) cells.push(`<div class="cell">+</div>`); });
  return `<style>
  ${story ? '.page{justify-content:center}' : ''}
  .top{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:${story ? 80 : 44}px}
  .title{font-size:${league.name.length > 14 ? (story ? 96 : 88) : (story ? 112 : 104)}px}
  .date{font-size:34px;margin-top:14px}
  .board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:${story ? 230 : 200}px repeat(3,minmax(0,1fr));gap:16px;flex:${story ? '0 0 1000px' : '1'};max-height:${story ? 1000 : 900}px}
  .hd{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;min-width:0;min-height:0}
  .badge{width:118px;height:118px;border-radius:24px;display:flex;align-items:center;justify-content:center;font:900 40px "Big Shoulders Display",sans-serif;letter-spacing:.02em}
  .nm{font-size:30px}
  .stat{border:3px dashed #3A4C60;border-radius:22px;width:100%;height:100%;overflow:hidden;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:14px;background:#13263A}
  .stat b{font-size:38px;line-height:1;hyphens:manual}
  .stat b.long{font-size:30px}
  .stat small{font-size:22px;letter-spacing:.02em;text-transform:none}
  .cell{border-radius:22px;background:#1A2F45;display:flex;align-items:center;justify-content:center;font-size:64px;color:#3A4C60;font-weight:600}
  .corner{display:flex;align-items:center;justify-content:center;font-size:110px;color:#C8102E}
  .foot{margin-top:${story ? 90 : 40}px;display:flex;justify-content:space-between;align-items:center;gap:30px;white-space:nowrap}
  .cta{font-size:32px;line-height:1.25}
  .url{font-size:${league.url.length > 36 ? 34 : 40}px}
  </style>
  <div class="top"><div><div class="disp title">${esc(league.name)}</div><div class="cond date muted">Päivän ruudukko ${esc(g.dateText)}</div></div>
  <div class="mini" style="width:120px"><i></i><i></i><i></i><i></i><i class="on"></i><i></i><i></i><i></i><i></i></div></div>
  <div class="board">${cells.join('')}</div>
  <div class="foot"><div class="cond cta">Keksi pelaaja, joka sopii<br>rivin ja sarakkeen ehtoon</div><div class="cond url red">${esc(league.url.replace('https://', '').replace(/\/$/, ''))}</div></div>`;
}

function coverHtml(dateStr, leagues) {
  return `<style>
  .wrap{flex:1;display:flex;flex-direction:column;justify-content:center}
  .big{font-size:${leagues.length > 4 ? 180 : 210}px}
  .d{font-size:56px;margin:30px 0 ${leagues.length > 4 ? 50 : 70}px}
  .list{display:flex;flex-wrap:wrap;gap:18px}
  .chip{font-size:${leagues.length > 4 ? 34 : 40}px;padding:14px 28px;border-radius:999px;background:#1A2F45}
  .sw{font-size:40px;margin-top:40px}
  </style>
  <div class="mini" style="width:220px;gap:16px;margin-bottom:60px"><i></i><i></i><i></i><i></i><i class="on"></i><i></i><i></i><i></i><i></i></div>
  <div class="wrap"><div class="disp big">Päivän<br>ruudukot</div><div class="cond d red">${esc(dateStr)}</div>
  <div class="list">${leagues.map(l => `<span class="chip cond">${esc(l.name)}</span>`).join('')}</div></div>
  <div class="cond sw muted">Pyyhkäise &rarr;</div>`;
}

function ctaHtml() {
  return `<style>
  .wrap{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:flex-start}
  .q{font-size:150px}
  .s{font-size:46px;margin:40px 0 80px;line-height:1.3;text-transform:none;letter-spacing:0;font-weight:600}
  .btn{font-size:60px;background:#C8102E;color:#fff;padding:28px 48px;border-radius:24px}
  </style>
  <div class="wrap"><div class="disp q">Montako<br>saat<br>oikein?</div>
  <div class="cond s muted">Uudet ruudukot joka yö keskiyöllä.<br>Ilmainen, ei kirjautumista.</div>
  <div class="cond btn">sporttiruudukot.fi</div></div>`;
}

async function shot(page, body, file, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}">
    <style>${BASE_CSS}</style></head><body><div class="page" style="--w:${w}px;--h:${h}px;--pad:${Math.round(w * 0.075)}px">${body}</div></body></html>`,
    { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
  console.log('  ' + path.relative(__dirname, file));
}

(async () => {
  const now = new Date();
  const leagues = LEAGUES;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const grids = [];
  for (const l of leagues) { console.log('Haetaan ' + l.url); grids.push(await scrape(page, l)); }

  const dateStr = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric' }).format(now);
  const dir = path.join(OUT, new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(now));
  fs.mkdirSync(dir, { recursive: true });

  console.log('Piirretään kuvat:');
  const W = 1080, H = 1350, SH = 1920;
  await shot(page, coverHtml(dateStr, leagues), path.join(dir, '01-kansi.jpg'), W, H);
  for (let i = 0; i < leagues.length; i++)
    await shot(page, leagueHtml(leagues[i], grids[i], false), path.join(dir, `${String(i + 2).padStart(2, '0')}-${leagues[i].id}.jpg`), W, H);
  await shot(page, ctaHtml(), path.join(dir, `${String(leagues.length + 2).padStart(2, '0')}-pelaa.jpg`), W, H);
  for (let i = 0; i < leagues.length; i++)
    await shot(page, leagueHtml(leagues[i], grids[i], true), path.join(dir, `tarina-${leagues[i].id}.jpg`), W, SH);

  const caption = [
    `Päivän ruudukot ${dateStr} ovat täällä. Pyyhkäise ja löydä oma lajisi.`,
    '',
    leagues.map(l => l.name).join(', ') + '. Keksi pelaaja, joka sopii sekä rivin että sarakkeen ehtoon.',
    '',
    'Pelaa ilmaiseksi: linkki biossa (sporttiruudukot.fi)',
    '',
    '#urheiluvisa #tietovisa ' + leagues.map(l => '#' + (l.tag || l.id)).join(' '),
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'kuvateksti.txt'), caption);
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(leagues.map((l, i) => ({ ...l, ...grids[i] })), null, 2));
  console.log('Valmis: ' + path.relative(__dirname, dir));
  await browser.close();
})();
