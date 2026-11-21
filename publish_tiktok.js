// Lähettää päivän videon (make_video.js) TikTokiin Content Posting API:lla.
//
// Tilat (TIKTOK_MODE):
//   inbox  (oletus) Video menee TikTok-sovelluksen ilmoituksiin luonnokseksi. Avaat sen puhelimella,
//                   lisäät biisin ja painat Julkaise. Toimii heti ilman TikTokin auditointia.
//   direct          Julkaisee suoraan. Ennen kuin TikTok on auditoinut sovelluksen, julkaisu on
//                   pakko tehdä yksityisenä (SELF_ONLY). Auditoinnin jälkeen TIKTOK_PRIVACY=PUBLIC_TO_EVERYONE.
//
// Ympäristömuuttujat (GitHub secrets):
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN (saat tiktok_auth.js:llä)
//   TIKTOK_MODE=inbox|direct, TIKTOK_PRIVACY (vain direct)
//
// Käyttö: node publish_tiktok.js output/2026-11-21
const fs = require('fs');
const path = require('path');

const API = 'https://open.tiktokapis.com';
const { TIKTOK_CLIENT_KEY: KEY, TIKTOK_CLIENT_SECRET: SECRET, TIKTOK_REFRESH_TOKEN: REFRESH } = process.env;
const MODE = (process.env.TIKTOK_MODE || 'inbox').toLowerCase();
const PRIVACY = process.env.TIKTOK_PRIVACY || 'SELF_ONLY';

const dir = process.argv[2];
if (!dir) throw new Error('Anna kansio, esim. node publish_tiktok.js output/2026-11-21');
if (!KEY || !SECRET || !REFRESH) throw new Error('TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET ja TIKTOK_REFRESH_TOKEN puuttuvat');
const video = path.join(dir, 'tiktok.mp4');
if (!fs.existsSync(video)) throw new Error(`Videota ei löydy: ${video} (aja ensin make_video.js)`);

async function accessToken() {
  const res = await fetch(`${API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: KEY, client_secret: SECRET, grant_type: 'refresh_token', refresh_token: REFRESH }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('Tokenin uusinta epäonnistui: ' + JSON.stringify(j));
  if (j.refresh_token && j.refresh_token !== REFRESH)
    console.log('::warning::TikTok antoi uuden refresh tokenin. Päivitä TIKTOK_REFRESH_TOKEN-secret (näkyy alla maskattuna, saat sen ajamalla tiktok_auth.js uudelleen).');
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

(async () => {
  const token = await accessToken();
  const size = fs.statSync(video).size;
  // Alle 64 Mt menee yhtenä palana (päivän video on ~2-4 Mt)
  const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 };

  let init;
  if (MODE === 'direct') {
    const creator = await api(token, '/v2/post/publish/creator_info/query/');
    const options = creator.privacy_level_options || [];
    if (!options.includes(PRIVACY))
      throw new Error(`Näkyvyys ${PRIVACY} ei ole sallittu. Sallitut: ${options.join(', ')} (auditoimaton sovellus = vain SELF_ONLY)`);
    const capFile = path.join(dir, 'tiktok-kuvateksti.txt');
    const title = (fs.existsSync(capFile) ? fs.readFileSync(capFile, 'utf8') : 'Päivän ruudukot sporttiruudukot.fi').trim().slice(0, 2200);
    init = await api(token, '/v2/post/publish/video/init/', {
      post_info: {
        title, privacy_level: PRIVACY,
        disable_comment: !!creator.comment_disabled, disable_duet: !!creator.duet_disabled, disable_stitch: !!creator.stitch_disabled,
        video_cover_timestamp_ms: 500,
      },
      source_info,
    });
  } else {
    init = await api(token, '/v2/post/publish/inbox/video/init/', { source_info });
  }

  const up = await fetch(init.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Content-Range': `bytes 0-${size - 1}/${size}` },
    body: fs.readFileSync(video),
  });
  if (!up.ok) throw new Error(`Videon lähetys epäonnistui (${up.status}): ${await up.text()}`);
  console.log(`Video lähetetty (${(size / 1e6).toFixed(1)} Mt), publish_id ${init.publish_id}`);

  // Odotetaan että TikTok käsittelee videon (max ~3 min)
  const done = MODE === 'direct' ? 'PUBLISH_COMPLETE' : 'SEND_TO_USER_INBOX';
  for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const s = await api(token, '/v2/post/publish/status/fetch/', { publish_id: init.publish_id });
    if (s.status === 'FAILED') throw new Error('TikTok hylkäsi videon: ' + (s.fail_reason || JSON.stringify(s)));
    if (s.status === done || s.status === 'PUBLISH_COMPLETE') {
      console.log(MODE === 'direct'
        ? `Julkaistu TikTokiin (${PRIVACY}).`
        : 'Valmis: video odottaa TikTok-sovelluksen ilmoituksissa. Lisää biisi ja julkaise.');
      return;
    }
    console.log('Tila:', s.status);
  }
  console.log('::warning::TikTok käsittelee videota vielä. Tarkista sovelluksesta hetken päästä.');
})().catch(e => { console.error(e.message); process.exit(1); });
