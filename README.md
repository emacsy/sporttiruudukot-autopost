# Sporttiruudukot autopost

Hakee päivän ruudukot sporttiruudukot.fi:stä ja tekee niistä Instagram-kuvat.

## Käyttö omalla koneella
```
npm install
npx playwright install chromium
npm run generate
```

Kuvat tulevat kansioon `output/VVVV-KK-PP/`:
- `01-kansi.jpg`, `02-liiga.jpg`, ..., `NN-pelaa.jpg`: karuselli (1080 x 1350)
- `tarina-<liiga>.jpg`: tarinat (1080 x 1920)
- `kuvateksti.txt`: karusellin kuvateksti
- `data.json`: haetut ruudukot

## Ajastus ja julkaisu
`.github/workflows/daily.yml` ajaa joka aamu GitHub Actionsissa:
1. `generate.js` tekee kuvat.
2. Kuvat tallennetaan `kuvat`-haaraan, josta ne saavat julkisen osoitteen (vaatii julkisen repositorion).
3. `publish.js` julkaisee karusellin ja tarinat Instagramiin.

Tarvittavat salaisuudet (Settings → Secrets and variables → Actions): `IG_ACCESS_TOKEN`, `IG_USER_ID`.

Ajon voi käynnistää käsin: Actions → Päivän ruudukot → Run workflow. Silloin voi valita, julkaistaanko
Instagramiin ja julkaistaanko tarinat. Kuvat voi ladata ajon kohdasta "Artifacts".

## Uuden liigan lisääminen
Lisää rivi tiedostoon `leagues.json`.


## TikTok

Joka aamu tehdään myös pystyvideo (`make_video.js`, ~24 s, 1080×1920): kansi → jokaisen lajin ruudukko → "Pelaa". Video lähetetään TikTokiin (`publish_tiktok.js`).

**Tilat** (GitHub → Settings → Secrets and variables → Actions → *Variables*):

| Muuttuja | Arvo | Mitä tapahtuu |
|---|---|---|
| `TIKTOK_ENABLED` | `true` | TikTok-vaihe päälle |
| `TIKTOK_MODE` | `inbox` (oletus) | Video tulee TikTok-sovelluksen ilmoituksiin luonnokseksi. Lisää biisi ja julkaise (~30 s/päivä). Toimii heti. |
| | `direct` | Julkaisee itsestään. Ennen TikTokin auditointia vain yksityisenä. |
| `TIKTOK_PRIVACY` | `PUBLIC_TO_EVERYONE` | Vasta kun TikTok on auditoinut sovelluksen (direct-tila) |

**Kertaluontoinen asennus**

1. https://developers.tiktok.com → kirjaudu → *Manage apps* → *Connect an app* (tyyppi: Web).
2. Täytä tiedot: nimi Sporttiruudukot, ikoni, kategoria Entertainment, Terms/Privacy-URL:t (esim. sporttiruudukot.fi-sivut), web/desktop URL `https://sporttiruudukot.fi/`.
3. *Add products*: **Login Kit** ja **Content Posting API**. Login Kitin Redirect URI: `https://sporttiruudukot.fi/`. Content Posting API:ssa **Direct Post** päälle, jos haluat myöhemmin automaattisen julkaisun.
4. Scopet: `user.info.basic`, `video.upload`, `video.publish`. Lähetä sovellus tarkistukseen (*Submit for review*). Kuvaa käyttö lyhyesti ja liitä demovideo (näyttötallenne: kirjautuminen + video ilmoituksissa).
5. Kun sovellus on hyväksytty: `node tiktok_auth.js <client_key>` → avaa linkki → hyväksy → kopioi osoite, johon selain ohjautui → `node tiktok_auth.js <client_key> <client_secret> "<osoite>"`.
6. GitHub secrets: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`. Variable `TIKTOK_ENABLED=true`.
7. Testaa: Actions → Päivän ruudukot → Run workflow (publish pois, tiktok päällä).

Refresh token kestää noin vuoden; aja vaihe 5 uudelleen, kun työnkulku varoittaa vanhenemisesta. TikTok-virhe ei kaada Instagram-julkaisua.

Videon voi tehdä myös käsin: `node generate.js && node make_video.js output/<pvm>`.
