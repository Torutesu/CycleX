/**
 * 開発用のダミー商品画像を生成し、Storage へアップロードして出品に紐づける。
 *
 *   node scripts/seed-images.mjs [紐づける件数]
 *
 * 写真素材の制作は業務対象外(別紙1 3.(6))のため、あくまで画面確認用の
 * プレースホルダーをコードで生成する。本番では利用しない。
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env.mjs";

const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 120);

// .env.local を読み、接続先がローカルでなければ止める(scripts/lib/env.mjs)
const env = loadEnv();

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** カテゴリごとの色味(実物の雰囲気に寄せる) */
const PALETTES = {
  road: ["#1B2A41", "#C1272D", "#0E7C6B", "#F2A007", "#2E4057"],
  cross: ["#3A5A40", "#588157", "#344E41", "#6B705C"],
  mtb: ["#22333B", "#5E503F", "#A9714B", "#0A5C50"],
  city: ["#4A5859", "#8D99AE", "#BC6C25", "#606C38"],
  minivelo: ["#D62828", "#F77F00", "#003049", "#457B9D"],
  ebike: ["#1D3557", "#2A9D8F", "#264653", "#3D405B"],
  parts: ["#343A40", "#495057", "#212529", "#6C757D"],
  other: ["#5C6663", "#7D8A87"],
};

/** カテゴリごとのシルエット(簡略化した SVG) */
function silhouette(category, accent) {
  const wheel = (cx) =>
    `<circle cx="${cx}" cy="330" r="72" fill="none" stroke="${accent}" stroke-width="9"/>
     <circle cx="${cx}" cy="330" r="58" fill="none" stroke="${accent}" stroke-width="2" opacity=".45"/>
     <circle cx="${cx}" cy="330" r="10" fill="${accent}"/>`;

  if (category === "parts") {
    // パーツはギア/チェーンリング風の図案
    const teeth = Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2;
      const x1 = 256 + Math.cos(a) * 118;
      const y1 = 256 + Math.sin(a) * 118;
      const x2 = 256 + Math.cos(a) * 132;
      const y2 = 256 + Math.sin(a) * 132;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>`;
    }).join("");
    return `${teeth}
      <circle cx="256" cy="256" r="118" fill="none" stroke="${accent}" stroke-width="12"/>
      <circle cx="256" cy="256" r="42" fill="none" stroke="${accent}" stroke-width="10"/>
      ${Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        return `<line x1="256" y1="256" x2="${(256 + Math.cos(a) * 112).toFixed(1)}" y2="${(256 + Math.sin(a) * 112).toFixed(1)}" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>`;
      }).join("")}`;
  }

  // 車体: ダイヤモンドフレーム + ハンドル形状をカテゴリで変える
  const bars =
    category === "road"
      ? `<path d="M352 218 q26 -6 30 16 q4 22 -18 26" fill="none" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>`
      : `<path d="M330 214 h56" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>`;

  const extra =
    category === "ebike"
      ? `<rect x="222" y="250" width="70" height="40" rx="8" fill="${accent}" opacity=".8"/>`
      : category === "minivelo"
        ? ""
        : "";

  const wheelPositions = category === "minivelo" ? [150, 372] : [140, 380];
  const radius = category === "minivelo" ? 52 : 72;

  const smallWheel = (cx) =>
    `<circle cx="${cx}" cy="${330 + (72 - radius)}" r="${radius}" fill="none" stroke="${accent}" stroke-width="9"/>
     <circle cx="${cx}" cy="${330 + (72 - radius)}" r="${radius - 14}" fill="none" stroke="${accent}" stroke-width="2" opacity=".45"/>
     <circle cx="${cx}" cy="${330 + (72 - radius)}" r="9" fill="${accent}"/>`;

  return `
    ${category === "minivelo" ? wheelPositions.map(smallWheel).join("") : wheelPositions.map(wheel).join("")}
    <path d="M150 330 L246 330 L300 218 L352 218 M246 330 L300 218 M246 330 L330 250 M330 250 L380 330 M300 218 L330 250"
          fill="none" stroke="${accent}" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M300 218 v-24" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>
    <ellipse cx="298" cy="188" rx="26" ry="9" fill="${accent}"/>
    ${bars}
    ${extra}
    <circle cx="246" cy="330" r="17" fill="none" stroke="${accent}" stroke-width="8"/>`;
}

function pageHtml(category, palette, label) {
  const base = palette[Math.floor(Math.random() * palette.length)];
  const light = Math.random() > 0.5;
  const bg = light
    ? `linear-gradient(150deg, #F2F5F4 0%, #E4EBE8 100%)`
    : `linear-gradient(150deg, ${base} 0%, #12181B 100%)`;
  const accent = light ? base : "#F5F7F6";
  const textColor = light ? "#1E2422" : "#F5F7F6";

  return `<!doctype html><html><body style="margin:0;width:512px;height:512px;background:${bg};
    display:flex;align-items:center;justify-content:center;position:relative;
    font-family:system-ui,-apple-system,'Hiragino Sans',sans-serif;">
    <svg width="512" height="512" viewBox="0 0 512 512">${silhouette(category, accent)}</svg>
    <span style="position:absolute;left:22px;bottom:18px;color:${textColor};opacity:.62;
      font-size:12px;letter-spacing:.08em;">${label}</span>
    <span style="position:absolute;right:22px;top:18px;color:${textColor};opacity:.35;
      font-size:11px;letter-spacing:.16em;">CycleX SAMPLE</span>
  </body></html>`;
}

const CATEGORY_LABELS = {
  road: "ROAD",
  cross: "CROSS",
  mtb: "MTB",
  city: "CITY",
  minivelo: "MINIVELO",
  ebike: "E-BIKE",
  parts: "PARTS",
  other: "OTHER",
};

// --replace を付けると、既にある画像も貼り直す。
// カテゴリを変えたあとは画像の見出しが食い違うため、そのときに使う。
const REPLACE = process.argv.includes("--replace");

const { data: listings } = await db
  .from("listings")
  .select("id, seller_id, category, listing_images(id)")
  .in("status", ["published", "trading", "sold"])
  .order("published_at", { ascending: false })
  .limit(COUNT * 2);

const targets = (listings ?? [])
  .filter((l) => REPLACE || (l.listing_images ?? []).length === 0)
  .slice(0, COUNT);

if (REPLACE && targets.length > 0) {
  const ids = targets.map((l) => l.id);
  for (let i = 0; i < ids.length; i += 100) {
    await db
      .from("listing_images")
      .delete()
      .in("listing_id", ids.slice(i, i + 100));
  }
}

if (targets.length === 0) {
  console.log("画像を付ける対象がありません。");
  process.exit(0);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });

let done = 0;
for (const listing of targets) {
  const category = listing.category in PALETTES ? listing.category : "other";
  // 1〜3枚を割り当てて、スライダーの動作も確認できるようにする
  const imageCount = 1 + Math.floor(Math.random() * 3);
  const rows = [];

  for (let i = 0; i < imageCount; i += 1) {
    await page.setContent(pageHtml(category, PALETTES[category], CATEGORY_LABELS[category]));
    const buffer = await page.screenshot({ type: "jpeg", quality: 82 });
    const path = `${listing.seller_id}/${crypto.randomUUID()}.jpg`;

    const { error } = await db.storage
      .from("listing-images")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: false });

    if (error) {
      console.error("アップロード失敗:", error.message);
      continue;
    }
    rows.push({ listing_id: listing.id, path, position: i });
  }

  if (rows.length > 0) {
    await db.from("listing_images").insert(rows);
  }
  done += 1;
  process.stdout.write(`\r${done}/${targets.length} 件`);
}

await browser.close();
console.log(`\n${done} 件の商品に画像を設定しました。`);
