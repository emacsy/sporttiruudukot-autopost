// Kertakäyttöinen apuri: hakee TikTokin refresh tokenin, joka laitetaan GitHubiin TIKTOK_REFRESH_TOKEN-secretiksi.
// Token on voimassa noin vuoden. Aja tämä uudelleen, kun se vanhenee.
//
// 1) node tiktok_auth.js <client_key>
//    -> tulostaa kirjautumislinkin. Avaa se, kirjaudu sporttiruudukoiden TikTok-tilillä ja hyväksy.
// 2) Selain ohjautuu osoitteeseen https://sporttiruudukot.fi/?code=...&state=...
//    Kopioi koko osoite selaimen osoiteriviltä.
// 3) node tiktok_auth.js <client_key> <client_secret> "<kopioitu osoite>"
//    -> tulostaa refresh tokenin.
const REDIRECT = process.env.TIKTOK_REDIRECT_URI || 'https://sporttiruudukot.fi/';
const SCOPES = process.env.TIKTOK_SCOPES || 'user.info.basic,video.upload';  // lisää video.publish, kun Direct Post on hyväksytty
const [key, secret, url] = process.argv.slice(2);

if (!key) { console.log('Käyttö: node tiktok_auth.js <client_key> [<client_secret> "<paluuosoite>"]'); process.exit(1); }

if (!secret) {
  const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
  u.search = new URLSearchParams({ client_key: key, scope: SCOPES, response_type: 'code', redirect_uri: REDIRECT, state: 'sporttiruudukot' });
  console.log('Avaa tämä linkki selaimessa ja hyväksy:\n\n' + u.toString() + '\n');
  console.log('Kopioi sen jälkeen osoite, johon selain ohjautui, ja aja:\nnode tiktok_auth.js ' + key + ' <client_secret> "<osoite>"');
  process.exit(0);
}

const code = url && url.includes('code=') ? new URL(url).searchParams.get('code') : url;
if (!code) { console.error('Osoitteesta ei löytynyt code-parametria.'); process.exit(1); }

fetch('https://open.tiktokapis.com/v2/oauth/token/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_key: key, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: REDIRECT }),
}).then(r => r.json()).then(j => {
  if (!j.refresh_token) { console.error('Epäonnistui:', JSON.stringify(j)); process.exit(1); }
  console.log('Oikeudet:', j.scope);
  console.log(`Voimassa ${Math.round(j.refresh_expires_in / 86400)} päivää.\n`);
  console.log('Laita tämä GitHubiin secretiksi TIKTOK_REFRESH_TOKEN:\n\n' + j.refresh_token + '\n');
});
