// Lähettää päivän ruudukot TikTokiin Content Posting API:lla.
//
// Muoto (TIKTOK_FORMAT):
//   photo (oletus) Kuvakaruselli: samat 1080x1350-kuvat kuin Instagramissa (01-kansi, lajit, pelaa).
//                  TikTok hakee kuvat itse osoitteesta https://sporttiruudukot.fi/somekuvat/<pvm>/...
//                  (vahvistettu domain; sivuston Worker hakee ne autopost-repon kuvat-haarasta).
//   video          make_video.js:n tekemä tiktok.mp4
//   both           molemmat
//
// Tila (TIKTOK_MODE):
//   inbox  (oletus) Postaus menee TikTok-sovelluksen ilmoituksiin luonnokseksi: lisää biisi ja julkaise.
//   direct          Julkaisee suoraan (vaatii video.publish-scopen ja TikTokin auditoinnin, muuten vain SELF_ONLY).
//
// Ympäristömuuttujat: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN,
//   TIKTOK_FORMAT, TIKTOK_MODE, TIKTOK_PRIVACY (vain direct), TIKTOK_IMAGE_BASE (valinnainen)
//
// Käyttö: node publish_tiktok.js output/2026-11-21
const fs = require('fs');
const path = require('path');

const API = 'https://open.tiktokapis.com';
const { TIKTOK_CLIENT_KEY: KEY, TIKTOK_CLIENT_SECRET: SECRET, TIKTOK_REFRESH_TOKEN: REFRESH } = process.env;
const FORMAT = (process.env.TIKTOK_FORMAT || 'photo').toLowerCase();
const MODE = (process.env.TIKTOK_MODE || 'inbox').toLowerCase();
const PRIVACY = process.env.TIKTOK_PRIVACY || 'SELF_ONLY';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) throw new Error('Anna kansio, esim. node publish_tiktok.js output/2026-11-21');
if (!KEY || !SECRET || !REFRESH) throw new Error('TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET ja TIKTOK_REFRESH_TOKEN puuttuvat');
const day = path.basename(path.resolve(dir));
const IMAGE_BASE = (process.env.TIKTOK_IMAGE_BASE || 'https://sporttiruudukot.fi/somekuvat/').replace(/\/?$/, '/') + day + '/';

const capFile = path.join(dir, 'tiktok-kuvateksti.txt');
const caption = (fs.existsSync(capFile) ? fs.readFileSync(capFile, 'utf8') : 'Päivän ruudukot – sporttiruudukot.fi').trim();
const dateFi = day.split('-').reverse().map(Number).join('.');

async function accessToken() {
  const res = await fetch(`${API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: KEY, client_secret: SECRET, grant_type: 'refresh_token', refresh_token: REFRESH }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('Tokenin uusinta epäonnistui: ' + JSON.stringify(j));
  const days = Math.round((j.refresh_expires_in || 0) / 86400);
  if (days && days < 30) console.log(`::warning::TikTokin refresh token vanhenee ${days} päivän päästä. Aja tiktok_auth.js uudelleen.`);
  return j.access_token;
}

async function api(token, endpoint, body) {
  const res = await fetch(API + endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body || {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j.error && j.error.code && j.error.code !== 'ok'))
    throw new Error(`${endpoint} epäonnistui (${res.status}): ${JSON.stringify(j.error || j)}`);
  return j.data;
}

async function directPostInfo(token) {
  const creator = await api(token, '/v2/post/publish/creator_info/query/');
  const options = creator.privacy_level_options || [];
  if (!options.includes(PRIVACY))
    throw new Error(`Näkyvyys ${PRIVACY} ei ole sallittu. Sallitut: ${options.join(', ')} (auditoimaton sovellus = vain SELF_ONLY)`);
  return { privacy_level: PRIVACY, disable_comment: !!creator.comment_disabled };
}

async function waitFor(token, publishId, label) {
  for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const s = await api(token, '/v2/post/publish/status/fetch/', { publish_id: publishId });
    if (s.status === 'FAILED') throw new Error(`TikTok hylkäsi postauksen (${label}): ` + (s.fail_reason || JSON.stringify(s)));
    if (s.status === 'SEND_TO_USER_INBOX' || s.status === 'PUBLISH_COMPLETE') {
      console.log(`${label}: ${MODE === 'direct' ? `julkaistu (${PRIVACY})` : 'valmis TikTokin ilmoituksissa. Lisää biisi ja julkaise.'}`);
      return;
    }
    if (i % 4 === 0) console.log(`${label}: ${s.status}`);
  }
  console.log(`::warning::${label}: TikTok käsittelee vielä. Tarkista sovelluksesta hetken päästä (luonnos tulee yleensä perille silti).`);
}

async function postPhotos(token) {
  // samat karusellikuvat kuin Instagramissa: 01-kansi.jpg, 02-liiga.jpg ... NN-pelaa.jpg
  const files = fs.readdirSync(dir).filter(f => /^\d\d-.+\.jpg$/.test(f)).sort().slice(0, 35);
  if (!files.length) throw new Error('Karusellikuvia ei löydy (aja ensin generate.js)');
  const urls = files.map(f => IMAGE_BASE + f);
  // varmistetaan että kuvat näkyvät julkisesti ennen kuin TikTok yrittää hakea ne
  const check = await fetch(urls[0], { method: 'GET' });
  if (!check.ok) throw new Error(`Kuva ei aukea: ${urls[0]} (${check.status}). Onko sivuston /somekuvat/-reitti julkaistu?`);

  const post_info = { title: `Päivän ruudukot ${dateFi} – montako saat oikein?`.slice(0, 90), description: caption.slice(0, 4000) };
  if (MODE === 'direct') Object.assign(post_info, await directPostInfo(token), { auto_add_music: true });
  const init = await api(token, '/v2/post/publish/content/init/', {
    media_type: 'PHOTO',
    post_mode: MODE === 'direct' ? 'DIRECT_POST' : 'MEDIA_UPLOAD',
    post_info,
    source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: urls },
  });
  console.log(`Karuselli lähetetty (${files.length} kuvaa), publish_id ${init.publish_id}`);
  await waitFor(token, init.publish_id, 'Karuselli');
}

async function postVideo(token) {
  const video = path.join(dir, 'tiktok.mp4');
  if (!fs.existsSync(video)) throw new Error(`Videota ei löydy: ${video} (aja ensin make_video.js)`);
  const size = fs.statSync(video).size;
  const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 };
  const init = MODE === 'direct'
    ? await api(token, '/v2/post/publish/video/init/', {
        post_info: { title: caption.slice(0, 2200), video_cover_timestamp_ms: 500, ...(await directPostInfo(token)) },
        source_info })
    : await api(token, '/v2/post/publish/inbox/video/init/', { source_info });
  const up = await fetch(init.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Content-Range': `bytes 0-${size - 1}/${size}` },
    body: fs.readFileSync(video),
  });
  if (!up.ok) throw new Error(`Videon lähetys epäonnistui (${up.status}): ${await up.text()}`);
  console.log(`Video lähetetty (${(size / 1e6).toFixed(1)} Mt), publish_id ${init.publish_id}`);
  await waitFor(token, init.publish_id, 'Video');
}

(async () => {
  if (!['photo', 'video', 'both'].includes(FORMAT)) throw new Error('TIKTOK_FORMAT pitää olla photo, video tai both');
  const token = await accessToken();
  let failed = 0;
  for (const [name, fn] of [['photo', postPhotos], ['video', postVideo]]) {
    if (FORMAT !== name && FORMAT !== 'both') continue;
    try { await fn(token); } catch (e) { console.error(`::error::${e.message}`); failed++; }
  }
  if (failed) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });
