// Julkaisee päivän karusellikuvat Facebook-sivulle yhtenä monikuvajulkaisuna.
//
// Ympäristömuuttujat:
//   FB_PAGE_ID       Facebook-sivun ID-numero (GitHubin salaisuus)
//   FB_PAGE_TOKEN    Järjestelmäkäyttäjän tai sivun käyttöoikeustunnus (GitHubin salaisuus).
//                    Jos tunnus on käyttäjän/järjestelmäkäyttäjän tunnus, skripti hakee sillä sivun oman tunnuksen.
//   IMAGE_BASE_URL   Julkinen osoite kuville (sama kuin Instagramissa)
//   DRY_RUN=1        Näyttää vain, mitä julkaistaisiin
//
// Käyttö: node publish_facebook.js output/2026-11-22
const fs = require('fs');
const path = require('path');

const PAGE = process.env.FB_PAGE_ID;
const TOKEN = process.env.FB_PAGE_TOKEN;
const BASE = (process.env.IMAGE_BASE_URL || '').replace(/\/?$/, '/');
const DRY = !!process.env.DRY_RUN;
const HOST = process.env.FB_API_HOST || 'https://graph.facebook.com';
const VERSION = 'v23.0';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, endpoint, params, token) {
  const url = `${HOST}/${VERSION}/${endpoint}`;
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === 'GET' ? await fetch(url + '?' + body) : await fetch(url, { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`Facebook API ${method} ${endpoint}: ${e.message || res.status}` +
      (e.error_user_msg ? ` (${e.error_user_msg})` : '') + (e.code ? ` [koodi ${e.code}]` : ''));
  }
  return json;
}

// Facebook hakee kuvan itse; joskus haku aikakatkaistaan. Yritetään silloin uudelleen.
async function retry(fn, label) {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= 4) throw e;
      console.log(`  ${label}: yritys ${attempt} epäonnistui (${e.message}), yritetään uudelleen...`);
      await sleep((+process.env.RETRY_MS || 10000) * attempt);
    }
  }
}

// Sivulle julkaistaan sivun omalla tunnuksella. Jos annettu tunnus on järjestelmäkäyttäjän tunnus,
// haetaan sillä sivun tunnus. Jos haku ei onnistu, oletetaan, että annettu tunnus on jo sivun tunnus.
async function pageToken() {
  try {
    const { access_token } = await api('GET', PAGE, { fields: 'access_token' }, TOKEN);
    if (access_token) return access_token;
  } catch (e) { console.log(`  (sivun tunnusta ei haettu: ${e.message}; käytetään annettua tunnusta)`); }
  return TOKEN;
}

// Instagramin kuvateksti ohjaa biossa olevaan linkkiin; Facebookissa linkki on klikattava, joten laitetaan se suoraan.
function facebookCaption(caption) {
  return caption.replace(/linkki biossa \(sporttiruudukot\.fi\)/i, 'https://sporttiruudukot.fi');
}

(async () => {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) throw new Error('Anna kuvakansio, esim. node publish_facebook.js output/2026-11-22');
  if (!DRY && (!PAGE || !TOKEN)) { console.log('FB_PAGE_ID tai FB_PAGE_TOKEN puuttuu, Facebook-julkaisu ohitetaan.'); return; }
  if (!/^https?:\/\//.test(BASE)) throw new Error('IMAGE_BASE_URL puuttuu');

  const slides = fs.readdirSync(dir).sort().filter(f => /^\d\d-.*\.jpg$/.test(f));
  const caption = facebookCaption(fs.readFileSync(path.join(dir, 'kuvateksti.txt'), 'utf8'));
  if (!slides.length) throw new Error('Kuvia ei löytynyt');

  console.log(`Facebook-julkaisu (${slides.length} kuvaa): ${slides.join(', ')}`);
  console.log(`Teksti:\n${caption}\n`);
  if (DRY) { console.log('DRY_RUN: mitään ei julkaistu.'); return; }

  const token = await pageToken();

  // Ensin kuvat ladataan sivulle julkaisemattomina, sitten ne liitetään yhteen julkaisuun.
  const ids = [];
  for (const f of slides) {
    const { id } = await retry(() => api('POST', `${PAGE}/photos`, { url: BASE + f, published: 'false' }, token), f);
    ids.push(id);
    console.log(`  ladattu ${f}`);
  }
  const params = { message: caption };
  ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  const post = await api('POST', `${PAGE}/feed`, params, token);
  console.log(`Facebook-julkaisu tehty (id ${post.id})`);
})().catch(e => { console.error('VIRHE: ' + e.message); process.exit(1); });
