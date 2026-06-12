// Generiše PWA ikone (PNG) i favicon (SVG) iz ugrađenog SVG logotipa.
// Pokretanje iz korena repoa: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const ART = `
  <path d="M256 470c-8-60-10-118 0-176" stroke="#7c5a3a" stroke-width="34" stroke-linecap="round" fill="none"/>
  <path d="M250 352c-30-28-58-46-84-60" stroke="#7c5a3a" stroke-width="22" stroke-linecap="round" fill="none"/>
  <path d="M262 332c34-26 64-42 88-54" stroke="#7c5a3a" stroke-width="22" stroke-linecap="round" fill="none"/>
  <circle cx="160" cy="244" r="86" fill="#4c9468"/>
  <circle cx="352" cy="230" r="92" fill="#3a7d52"/>
  <circle cx="256" cy="152" r="98" fill="#5fae7e"/>
  <path d="M256 130L170 242M256 130L342 226" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>
  <circle cx="256" cy="130" r="27" fill="#ffffff"/>
  <circle cx="170" cy="242" r="22" fill="#ffffff"/>
  <circle cx="342" cy="226" r="22" fill="#ffffff"/>
  <circle cx="256" cy="130" r="27" fill="none" stroke="#3a7d52" stroke-width="6"/>
  <circle cx="170" cy="242" r="22" fill="none" stroke="#3a7d52" stroke-width="6"/>
  <circle cx="342" cy="226" r="22" fill="none" stroke="#3a7d52" stroke-width="6"/>`;

const svg = ({ rx, pad }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rx}" fill="#f7f1e6"/>
  <g transform="translate(${(512 * pad) / 2} ${(512 * pad) / 2}) scale(${1 - pad})">${ART}</g>
</svg>`;

const regular = svg({ rx: 100, pad: 0.08 });
const maskable = svg({ rx: 0, pad: 0.24 }); // sadržaj u sigurnoj zoni (~80% kruga)
const favicon = svg({ rx: 100, pad: 0.04 });

await mkdir('client/public/icons', { recursive: true });
const out = (s, size, file) =>
  sharp(Buffer.from(s)).resize(size, size).png().toFile(`client/public/icons/${file}`);

await Promise.all([
  out(regular, 192, 'pwa-192.png'),
  out(regular, 512, 'pwa-512.png'),
  out(maskable, 512, 'pwa-maskable-512.png'),
  out(regular, 180, 'apple-touch-icon.png'),
  writeFile('client/public/favicon.svg', favicon, 'utf8'),
]);
console.log('Ikone generisane u client/public/icons/');
