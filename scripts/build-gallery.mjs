/** プロジェクトルートから実行する: node scripts/build-gallery.mjs */
/** スクリーンショットを埋め込んだ画面ギャラリーを生成する */
import { readFileSync, writeFileSync } from "node:fs";

const DIR = "/tmp/shots-web";
const img = (name) =>
  `data:image/jpeg;base64,${readFileSync(`${DIR}/${name}.jpg`).toString("base64")}`;

const GROUPS = [
  {
    id: "buy",
    label: "さがす・買う",
    note: "ゲストでも閲覧でき、購入にはログインが必要。",
    device: "mobile",
    screens: [
      ["m-home", "ホーム", "カテゴリ導線・新着・注目。下部タブバーで主要導線に届く"],
      ["m-search", "検索結果", "2列グリッド。取引中/SOLD はサムネイル左上にバッジ"],
      [
        "m-search-filter",
        "絞り込み",
        "スマホはボトムシート。カテゴリ・価格帯・サイズ・地域を重ねて指定",
      ],
      ["m-item", "商品詳細", "画像スライダー、スペック表、出品者の評価。下部に固定の購入バー"],
      ["m-profile", "出品者プロフィール", "評価の平均★と一覧、出品中の商品"],
      ["m-favorites", "お気に入り", "ハートを押した商品がここに集まる"],
    ],
  },
  {
    id: "sell",
    label: "売る",
    note: "画像は最大10枚。下書き保存に対応。",
    device: "mobile",
    screens: [
      [
        "m-sell",
        "出品フォーム",
        "カテゴリで項目が切り替わる。価格入力で手数料と受取額の目安を表示",
      ],
      ["m-listings", "出品した商品", "下書き/公開中/取引中/売却済/取下げ/非公開をタブで切替"],
    ],
  },
  {
    id: "deal",
    label: "取引する",
    note: "購入申込 → 決済 → 発送 → 受取 → 相互評価。",
    device: "mobile",
    screens: [
      ["m-purchase", "購入確認", "決済ページへ進む前に受渡方法と金額を確認"],
      ["m-transaction", "取引画面(進行中)", "タイムラインと「次にやること」だけを大きく出す"],
      ["m-transaction-done", "取引画面(完了)", "全ステップにチェックが入り、記録が残る"],
      ["m-review", "評価入力", "★1〜5とコメント。双方が入れるまで相手には見えない"],
      ["m-messages", "メッセージ一覧", "未読バッジ付き。商品ごとに1スレッドへ集約"],
      ["m-thread", "メッセージ", "購入前の質問から取引連絡まで同じスレッドで続く"],
      ["m-purchases", "購入した取引", "進行中/完了/キャンセルで絞り込み"],
    ],
  },
  {
    id: "account",
    label: "アカウント",
    note: "メール確認必須。ソーシャルログインは Google。",
    device: "mobile",
    screens: [
      ["m-login", "ログイン", "Google ログインとメール/パスワードを併置"],
      ["m-signup", "会員登録", "表示名・メール・パスワードのみの最小構成"],
      ["m-mypage", "マイページ", "メール未確認のときは上部で案内"],
      ["m-settings", "設定", "メール変更・パスワード変更・通知設定・退会"],
    ],
  },
  {
    id: "desktop",
    label: "PC 表示",
    note: "同じ画面がレスポンシブで展開する。全30画面・5つの幅で横スクロールなしを確認済み。",
    device: "desktop",
    screens: [
      ["d-home", "ホーム", "ヘッダーに検索バーとナビゲーションが展開"],
      ["d-search", "検索結果", "左サイドバーに絞り込み、右に4列グリッド"],
      ["d-item", "商品詳細", "画像と購入エリアを左右に分割"],
      ["d-profile", "出品者プロフィール", "評価と出品中の商品を一望"],
      ["d-sell", "出品フォーム", "1画面の縦スクロール構成は維持"],
    ],
  },
  {
    id: "admin",
    label: "運営(管理画面)",
    note: "管理者ロールのみアクセス可。一般ユーザーには 404 を返す。",
    device: "desktop",
    screens: [
      ["d-admin", "ダッシュボード", "会員・出品・取引・GMV と直近30日の推移"],
      ["d-admin-users", "利用者管理", "検索・状態絞り込み。停止すると出品も連動して非表示に"],
      ["d-admin-listings", "出品管理", "非表示化と解除。取引中・売却済は操作できない"],
      ["d-admin-transactions", "取引管理", "Stripe の決済 ID を照合用に表示。キャンセル操作"],
      ["d-admin-reports", "通報管理", "理由・詳細を確認し、対応済みとして記録"],
      ["d-admin-brands", "ブランド管理", "追加・改名・有効/無効。削除はしない"],
    ],
  },
];

const FACTS = [
  ["画面", "30"],
  ["実装機能", "FR-01〜14"],
  ["ユニットテスト", "134"],
  ["横スクロール", "0"],
];

function screenCard(group, [file, title, note]) {
  const mobile = group.device === "mobile";
  return `
    <li class="shot ${mobile ? "is-mobile" : "is-desktop"}">
      <button class="frame" aria-label="${title} を拡大">
        <span class="bezel">
          <img src="${img(file + "--card")}" alt="${title} の画面" loading="lazy" decoding="async">
        </span>
        <span class="zoom" aria-hidden>全体を見る</span>
      </button>
      <h3>${title}</h3>
      <p>${note}</p>
      <template class="full">${img(file)}</template>
    </li>`;
}

const sections = GROUPS.map(
  (group) => `
  <section id="${group.id}" class="group">
    <header class="group-head">
      <h2>${group.label}</h2>
      <p>${group.note}</p>
      <span class="chip">${group.device === "mobile" ? "375 × 812" : "1280 幅"}</span>
    </header>
    <ul class="shots ${group.device}">
      ${group.screens.map((s) => screenCard(group, s)).join("")}
    </ul>
  </section>`,
).join("");

const nav = GROUPS.map((g) => `<a href="#${g.id}">${g.label}</a>`).join("");

const html = `<title>CycleX 画面ギャラリー</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root{
    --ground:#F5F8F7; --surface:#FFFFFF; --raised:#FBFDFC;
    --ink:#16201D; --muted:#5D6866; --line:#E0E8E4;
    --accent:#0E7C6B; --accent-ink:#0A5C50; --accent-wash:#E6F1EE;
    --shadow:0 1px 2px rgba(16,32,28,.05), 0 12px 28px -18px rgba(16,32,28,.35);
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --ground:#101614; --surface:#19201E; --raised:#1F2725;
      --ink:#E7EDEA; --muted:#93A09B; --line:#2A3431;
      --accent:#3FB8A2; --accent-ink:#7EDCC9; --accent-wash:#1B2F2A;
      --shadow:0 1px 2px rgba(0,0,0,.4), 0 14px 32px -20px rgba(0,0,0,.9);
    }
  }
  :root[data-theme="dark"]{
    --ground:#101614; --surface:#19201E; --raised:#1F2725;
    --ink:#E7EDEA; --muted:#93A09B; --line:#2A3431;
    --accent:#3FB8A2; --accent-ink:#7EDCC9; --accent-wash:#1B2F2A;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 14px 32px -20px rgba(0,0,0,.9);
  }

  *{box-sizing:border-box}
  body{
    margin:0; background:var(--ground); color:var(--ink);
    font-family:"Zen Kaku Gothic New",-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;
    font-size:15px; line-height:1.8; -webkit-font-smoothing:antialiased;
  }
  .mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
  .wrap{max-width:1160px; margin:0 auto; padding:0 20px 96px}

  /* ---------- hero ---------- */
  header.hero{padding:52px 0 28px}
  .eyebrow{
    font-family:"IBM Plex Mono",monospace; font-size:11.5px; letter-spacing:.18em;
    text-transform:uppercase; color:var(--accent); margin:0 0 14px;
  }
  h1{font-size:clamp(30px,6vw,44px); line-height:1.2; margin:0 0 12px; font-weight:700; text-wrap:balance}
  .lede{margin:0; color:var(--muted); max-width:40em}
  .facts{
    display:flex; flex-wrap:wrap; gap:0; margin:28px 0 0; padding:0; list-style:none;
    border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden;
  }
  .facts li{flex:1 1 130px; padding:12px 16px; border-right:1px solid var(--line)}
  .facts li:last-child{border-right:none}
  .facts dt{font-size:11px; color:var(--muted); letter-spacing:.04em}
  .facts dd{
    margin:2px 0 0; font-family:"IBM Plex Mono",monospace; font-size:19px;
    font-weight:500; font-variant-numeric:tabular-nums;
  }

  /* ---------- nav ---------- */
  nav.jump{
    position:sticky; top:0; z-index:20; display:flex; gap:6px; overflow-x:auto;
    padding:12px 0; margin-bottom:8px; background:var(--ground);
    border-bottom:1px solid var(--line); scrollbar-width:none;
  }
  nav.jump::-webkit-scrollbar{display:none}
  nav.jump a{
    flex:none; font-size:12.5px; text-decoration:none; color:var(--muted);
    border:1px solid var(--line); background:var(--surface);
    border-radius:999px; padding:6px 14px; white-space:nowrap;
  }
  nav.jump a:hover,nav.jump a:focus-visible{color:var(--accent-ink); border-color:var(--accent)}

  /* ---------- groups ---------- */
  .group{padding-top:48px; scroll-margin-top:64px}
  .group-head{display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 14px; margin-bottom:22px}
  .group-head h2{margin:0; font-size:21px; font-weight:700; letter-spacing:.01em}
  .group-head p{margin:0; flex:1 1 320px; color:var(--muted); font-size:13.5px}
  .chip{
    font-family:"IBM Plex Mono",monospace; font-size:11px; color:var(--accent-ink);
    background:var(--accent-wash); border-radius:999px; padding:3px 10px; white-space:nowrap;
  }

  .shots{display:grid; gap:28px 20px; margin:0; padding:0; list-style:none}
  .shots.mobile{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
  .shots.desktop{grid-template-columns:1fr}
  @media(min-width:900px){ .shots.desktop{grid-template-columns:repeat(2,1fr)} }

  .shot h3{margin:12px 0 3px; font-size:14px; font-weight:700}
  .shot p{margin:0; font-size:12.5px; line-height:1.7; color:var(--muted)}

  .frame{
    display:block; width:100%; padding:0; border:0; background:none; cursor:zoom-in;
    border-radius:14px;
  }
  .frame:focus-visible{outline:2px solid var(--accent); outline-offset:4px}
  .bezel{
    display:block; overflow:hidden; background:var(--raised);
    border:1px solid var(--line); box-shadow:var(--shadow);
    transition:transform .18s ease, box-shadow .18s ease;
  }
  .is-mobile .bezel{border-radius:20px; padding:5px}
  .is-mobile .bezel img{border-radius:15px}
  .is-desktop .bezel{border-radius:12px; padding:4px}
  .is-desktop .bezel img{border-radius:8px}
  .bezel img{display:block; width:100%; height:auto}
  .frame{position:relative}
  .zoom{
    position:absolute; right:10px; bottom:10px; opacity:0; transition:opacity .18s ease;
    font-family:"IBM Plex Mono",monospace; font-size:10.5px; letter-spacing:.04em;
    background:var(--surface); color:var(--accent-ink); border:1px solid var(--line);
    border-radius:999px; padding:3px 10px; pointer-events:none;
  }
  .frame:hover .zoom, .frame:focus-visible .zoom{opacity:1}
  .frame:hover .bezel{transform:translateY(-3px); box-shadow:0 1px 2px rgba(16,32,28,.06), 0 22px 40px -22px rgba(16,32,28,.5)}
  @media (prefers-reduced-motion: reduce){ .bezel{transition:none} .frame:hover .bezel{transform:none} }

  /* ---------- lightbox ---------- */
  dialog.viewer{
    border:0; padding:0; max-width:min(96vw,1280px); max-height:92dvh;
    background:var(--surface); color:var(--ink); border-radius:14px; overflow:hidden;
  }
  dialog.viewer::backdrop{background:rgba(10,16,14,.82)}
  .viewer-bar{
    display:flex; align-items:center; gap:12px; padding:10px 14px;
    border-bottom:1px solid var(--line); background:var(--surface);
    position:sticky; top:0;
  }
  .viewer-bar strong{font-size:14px}
  .viewer-bar .mono{font-size:11px; color:var(--muted)}
  .viewer-bar button{
    margin-left:auto; min-height:36px; padding:0 14px; border:1px solid var(--line);
    background:var(--raised); color:var(--ink); border-radius:8px; cursor:pointer; font:inherit; font-size:13px;
  }
  .viewer-body{overflow:auto; max-height:calc(92dvh - 57px); background:var(--ground)}
  .viewer-body img{display:block; width:100%; height:auto}
  @media(min-width:700px){ .viewer-body.is-mobile img{width:420px; margin:20px auto} }

  footer.end{
    margin-top:72px; padding-top:22px; border-top:1px solid var(--line);
    color:var(--muted); font-size:12.5px;
  }
  footer.end code{font-family:"IBM Plex Mono",monospace; font-size:11.5px}
</style>

<div class="wrap">
  <header class="hero">
    <p class="eyebrow">Screen Gallery / MVP</p>
    <h1>CycleX 画面ギャラリー</h1>
    <p class="lede">
      自転車・パーツに特化した C2C マーケットプレイスの実装済み画面です。
      すべてスマホ幅を基準に設計し、PC はレスポンシブで展開します。画面をタップすると全体を拡大表示します。
    </p>
    <ul class="facts">
      ${FACTS.map(([label, value]) => `<li><dl><dt>${label}</dt><dd>${value}</dd></dl></li>`).join("")}
    </ul>
  </header>

  <nav class="jump" aria-label="セクション">${nav}</nav>

  ${sections}

  <footer class="end">
    掲載しているのは開発環境の実画面です。商品写真はサンプルとして自動生成したもので、
    実在の商品ではありません。ブランチ <code>claude/bicycle-c2c-mvp-chct00</code>
  </footer>
</div>

<dialog class="viewer">
  <div class="viewer-bar">
    <strong id="viewer-title"></strong>
    <span class="mono" id="viewer-size"></span>
    <button type="button" id="viewer-close">閉じる</button>
  </div>
  <div class="viewer-body" id="viewer-body"></div>
</dialog>

<script>
  const dialog = document.querySelector("dialog.viewer");
  const body = document.getElementById("viewer-body");
  const titleEl = document.getElementById("viewer-title");
  const sizeEl = document.getElementById("viewer-size");

  document.querySelectorAll(".frame").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".shot");
      const isMobile = card.classList.contains("is-mobile");
      const source = button.querySelector("img");

      titleEl.textContent = card.querySelector("h3").textContent;
      sizeEl.textContent = isMobile ? "375 × 812" : "1280 幅";
      body.className = "viewer-body" + (isMobile ? " is-mobile" : "");
      body.innerHTML = "";

      const full = new Image();
      full.src = card.querySelector("template.full").innerHTML.trim();
      full.alt = source.alt;
      body.appendChild(full);
      body.scrollTop = 0;

      if (typeof dialog.showModal === "function") dialog.showModal();
    });
  });

  document.getElementById("viewer-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    // 画像の外側(背景)をクリックしたら閉じる
    if (event.target === dialog) dialog.close();
  });
</script>
`;

writeFileSync("/tmp/cyclex-gallery.html", html);
console.log("written:", (Buffer.byteLength(html) / 1024 / 1024).toFixed(2) + "MB");
