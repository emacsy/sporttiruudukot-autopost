// Julkaisee generate.js:n tekemät kuvat Instagramiin.
//
// Ympäristömuuttujat:
//   IG_ACCESS_TOKEN  Instagramin käyttöoikeustunnus (GitHubin salaisuus)
//   IG_USER_ID       Instagram-tilin ID-numero (GitHubin salaisuus)
//   IMAGE_BASE_URL   Julkinen osoite, josta Instagram hakee kuvat, esim.
//                    https://raw.githubusercontent.com/emacsy/sporttiruudukot-autopost/<commit>/2026-11-21/
//   DRY_RUN=1        Näyttää vain, mitä julkaistaisiin
//   SKIP_STORIES=1   Julkaisee vain karusellin
//
// Käyttö: node publish.js output/2026-11-21
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.IG_ACCESS_TOKEN;
const USER = process.env.IG_USER_ID;
const BASE = (process.env.IMAGE_BASE_URL || '').replace(/\/?$/, '/');
const DRY = !!process.env.DRY_RUN;
const VERSION = 'v23.0';
// Instagram-kirjautumisella tehdyt tunnukset (alkavat "IG") käyttävät graph.instagram.com:ia,
// Facebook-/järjestelmäkäyttäjän tunnukset graph.facebook.com:ia.
const HOST = process.env.IG_API_HOST || (TOKEN && TOKEN.startsWith('IG') ? 'https://graph.instagram.com' : 'https://graph.facebook.com');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, endpoint, params = {}) {
  const url = new URL(`${HOST}/${VERSION}/${endpoint}`);
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = method === 'GET'
    ? await fetch(url + '?' + body)
    : await fetch(url, { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    const err = new Error(`Instagram API ${method} ${endpoint}: ${e.message || res.status}` +
      (e.error_user_msg ? ` (${e.error_user_msg})` : '') + (e.code ? ` [koodi ${e.code}]` : ''));
    err.code = e.code;
    throw err;
  }
  return json;
}

// Instagram käsittelee kuvan ennen julkaisua; odotetaan, kunnes se on valmis.
async function waitReady(id) {
  for (let i = 0; i < 30; i++) {
    const { status_code } = await api('GET', id, { fields: 'status_code' });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Mediaa ${id} ei voitu käsitellä (${status_code})`);
    await sleep(3000);
  }
  throw new Error(`Media ${id} ei valmistunut ajoissa`);
}

// Varmistetaan, että kuva on julkisesti saatavilla ennen kuin Instagram yrittää hakea sen.
async function checkPublic(url) {
  for (let i = 0; i < 10; i++) {
    const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (res && res.ok) return;
    await sleep(3000);
  }
  throw new Error(`Kuva ei ole julkisesti saatavilla: ${url}\nOnko repositorio julkinen?`);
}

// Instagram hakee kuvan itse; joskus haku aikakatkaistaan. Yritetään silloin uudelleen.
async function createMedia(params) {
  for (let attempt = 1; ; attempt++) {
    try { return await api('POST', `${USER}/media`, params); }
    catch (e) {
      if (attempt >= 4) throw e;
      console.log(`  yritys ${attempt} epäonnistui (${e.message}), yritetään uudelleen...`);
      await sleep(10000 * attempt);
    }
  }
}

// Metan tilapäiset virheet: 4/17/32/613 = pyyntörajoitus, 1/2 = tilapäinen palveluvirhe.
const TRANSIENT = new Set([1, 2, 4, 17, 32, 613]);
// Uudelleenyrityksiin käytettävä odotusaika yhteensä koko ajon aikana, ettei workflow'n
// 20 minuutin aikaraja ylity, jos rajoitus jatkuu pitkään.
let retryBudgetMs = 8 * 60 * 1000;

async function publish(creationId) {
  await waitReady(creationId);
  for (let attempt = 1; ; attempt++) {
    try {
      const { id } = await api('POST', `${USER}/media_publish`, { creation_id: creationId });
      return id;
    } catch (e) {
      // Instagram julkaisee joskus virheestä huolimatta. Tarkistetaan ennen uutta yritystä,
      // ettei samaa julkaisua tule kahdesti.
      const status = await api('GET', creationId, { fields: 'status_code' }).then(r => r.status_code).catch(() => null);
      if (status === 'PUBLISHED') { console.log(`  julkaistu virheestä huolimatta (${e.message})`); return creationId; }
      const wait = 60000 * attempt;
      if (!TRANSIENT.has(e.code) || attempt >= 4 || wait > retryBudgetMs) throw e;
      retryBudgetMs -= wait;
      console.log(`  julkaisu epäonnistui (${e.message}), yritetään uudelleen ${wait / 1000} s kuluttua...`);
      await sleep(wait);
    }
  }
}

(async () => {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) throw new Error('Anna kuvakansio, esim. node publish.js output/2026-11-21');
  if (!DRY && (!TOKEN || !USER)) throw new Error('IG_ACCESS_TOKEN tai IG_USER_ID puuttuu');
  if (!/^https?:\/\//.test(BASE)) throw new Error('IMAGE_BASE_URL puuttuu tai ei ala https://');

  const files = fs.readdirSync(dir).sort();
  const slides = files.filter(f => /^\d\d-.*\.jpg$/.test(f));
  const stories = process.env.SKIP_STORIES ? [] : files.filter(f => /^tarina-.*\.jpg$/.test(f));
  const caption = fs.readFileSync(path.join(dir, 'kuvateksti.txt'), 'utf8');
  if (slides.length < 2 || slides.length > 20) throw new Error(`Karusellissa pitää olla 2–20 kuvaa, nyt ${slides.length}`);

  console.log(`Karuselli (${slides.length} kuvaa): ${slides.join(', ')}`);
  console.log(`Tarinat (${stories.length}): ${stories.join(', ') || '-'}`);
  console.log(`Kuvateksti:\n${caption}\n`);
  if (DRY) { console.log('DRY_RUN: mitään ei julkaistu. Kuvien osoitteet:'); [...slides, ...stories].forEach(f => console.log('  ' + BASE + f)); return; }

  for (const f of [...slides, ...stories]) await checkPublic(BASE + f);

  let failed = 0;

  // Karuselli: ensin jokainen kuva omaksi osakseen, sitten niistä yksi julkaisu.
  // Karusellin virhe ei estä tarinoita; ajo merkitään silti lopuksi epäonnistuneeksi.
  try {
    const children = [];
    for (const f of slides) {
      const { id } = await createMedia({ image_url: BASE + f, is_carousel_item: 'true' });
      children.push(id);
      console.log(`  ladattu ${f}`);
    }
    for (const id of children) await waitReady(id);
    const carousel = await api('POST', `${USER}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
    const postId = await publish(carousel.id);
    console.log(`Karuselli julkaistu (id ${postId})`);
  } catch (e) { failed++; console.error(`Karusellin julkaisu epäonnistui: ${e.message}`); }

  // Tarinat yksi kerrallaan. Yksittäisen tarinan virhe ei kaada muita.
  for (const f of stories) {
    try {
      const { id } = await createMedia({ image_url: BASE + f, media_type: 'STORIES' });
      await publish(id);
      console.log(`Tarina julkaistu: ${f}`);
    } catch (e) { failed++; console.error(`Tarinan ${f} julkaisu epäonnistui: ${e.message}`); }
  }
  if (failed) process.exitCode = 1;
})().catch(e => { console.error('VIRHE: ' + e.message); process.exit(1); });
