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

## Ajastus
`.github/workflows/daily.yml` ajaa skriptin joka aamu GitHub Actionsissa. Kuvat voi ladata
Actions-välilehdeltä ajon kohdasta "Artifacts". Ajon voi käynnistää myös käsin (Run workflow).

## Uuden liigan lisääminen
Lisää rivi tiedostoon `leagues.json`.

## Vielä tekemättä
- Julkaisu Instagramiin (Instagram API, vaatii käyttöoikeustunnuksen)
