# Sporttiruudukot autopost

Hakee päivän ruudukot sporttiruudukot.fi:stä ja tekee niistä Instagram-kuvat.

## Käyttö omalla koneella
```
npm install
npx playwright install chromium
npm run generate
```

Kuvat tulevat kansioon `output/VVVV-KK-PP/`:
- `01-kansi.png`, `02-liiga.png`, ..., `NN-pelaa.png`: karuselli (1080 x 1350)
- `tarina-<liiga>.png`: tarinat (1080 x 1920)
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

