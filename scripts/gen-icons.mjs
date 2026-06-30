import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public/icons");

// オンラインミーティングでメモをとるコンセプト:
// 緑の角丸背景 + ドキュメント(議事録) + マイク
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- 背景 -->
  <rect width="128" height="128" rx="28" fill="#5bb25f"/>

  <!-- モニター外枠(中央) -->
  <rect x="22" y="14" width="84" height="62" rx="8" fill="white"/>
  <!-- 画面(暗い背景でビデオ通話らしく) -->
  <rect x="29" y="21" width="70" height="48" rx="4" fill="#1a3320"/>
  <!-- 人物: 頭 -->
  <circle cx="64" cy="38" r="12" fill="white"/>
  <!-- 人物: 肩 -->
  <path d="M31 69 Q32 55 64 55 Q96 55 97 69" fill="white"/>
  <!-- モニタースタンド -->
  <rect x="60" y="76" width="8" height="7" rx="1" fill="white"/>
  <rect x="48" y="82" width="32" height="5" rx="2.5" fill="white"/>

  <!-- 鉛筆バッジ(右下オーバーレイ) -->
  <circle cx="98" cy="96" r="24" fill="#2d7a32"/>
  <g transform="translate(98, 96) rotate(-45)">
    <rect x="-3.5" y="-14" width="7" height="22" rx="2.5" fill="white"/>
    <rect x="-3.5" y="-14" width="7" height="5.5" rx="2.5" fill="#ffcdd2"/>
    <rect x="-3.5" y="-8.5" width="7" height="3" fill="#b0bec5"/>
    <polygon points="-3.5,8 3.5,8 0,15" fill="#ffe0b2"/>
    <line x1="0" y1="14" x2="0" y2="16" stroke="rgba(60,40,30,0.7)" stroke-width="1.5" stroke-linecap="round"/>
  </g>
</svg>`;

await mkdir(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon${size}.png`));
  console.log(`✓ icon${size}.png`);
}

console.log("Done →", outDir);
