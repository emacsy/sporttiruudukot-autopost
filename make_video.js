// Tekee generate.js:n pystykuvista TikTok-videon (1080 x 1920, MP4).
// Järjestys: tiktok-kansi.jpg, tarina-<liiga>.jpg kuten leagues.json, tiktok-pelaa.jpg.
// Kuvien välissä lyhyt ristikuva. Ääniraita on hiljainen: musiikin voi lisätä TikTokissa.
// Vaatii ffmpegin (GitHub Actionsin ubuntu-latestissa valmiina).
// Käyttö: node make_video.js output/2026-11-21   -> output/2026-11-21/tiktok.mp4
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const LEAGUES = JSON.parse(fs.readFileSync(path.join(__dirname, 'leagues.json'), 'utf8'));
const COVER = 2.5, SLIDE = 3, END = 3, FADE = 0.4;   // sekunteja

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) throw new Error('Anna kuvakansio, esim. node make_video.js output/2026-11-21');

const slides = [['tiktok-kansi.jpg', COVER],
  ...LEAGUES.map(l => [`tarina-${l.id}.jpg`, SLIDE]).filter(([f]) => fs.existsSync(path.join(dir, f))),
  ['tiktok-pelaa.jpg', END]];
for (const [f] of slides) if (!fs.existsSync(path.join(dir, f))) throw new Error(`Kuva puuttuu: ${f} (aja ensin generate.js)`);

const args = ['-y', '-loglevel', 'error'];
slides.forEach(([f, d]) => args.push('-loop', '1', '-t', String(d + FADE), '-i', path.join(dir, f)));
const total = slides.reduce((s, [, d]) => s + d, 0) + FADE;
args.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

// jokainen kuva 1080x1920, 30 fps; sitten ristikuvat peräkkäin
const parts = slides.map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0D1A28,setsar=1,fps=30,format=yuv420p[v${i}]`);
let prev = 'v0', t = 0;
for (let i = 1; i < slides.length; i++) {
  t += slides[i - 1][1];
  const out = i === slides.length - 1 ? 'vout' : `x${i}`;
  parts.push(`[${prev}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${t.toFixed(2)}[${out}]`);
  prev = out;
}
const file = path.join(dir, 'tiktok.mp4');
args.push('-filter_complex', parts.join(';'), '-map', '[vout]', '-map', `${slides.length}:a`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '128k', '-shortest', file);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log(`Video valmis: ${file} (${(fs.statSync(file).size / 1e6).toFixed(1)} Mt, ${total.toFixed(1)} s, ${slides.length} kuvaa)`);
