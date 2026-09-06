/**
 * デモ用の車種カタログ。
 *
 * ブランドと車種を無関係に組み合わせると「Pinarello の Madone(ミニベロ)」
 * のような実在しない出品になり、見た人がすぐ作り物だと分かってしまう。
 * 実際に売られている組み合わせと、その相場の幅を持たせる。
 *
 * price は新品同様のときの目安(円)。状態と年式で下げて使う。
 * since はその車種が出た年の目安。
 */

/** @type {{category: string, brand: string, model: string, price: [number, number], since?: number, sizes?: string[], component?: string}[]} */
export const BIKES = [
  // ---- ロードバイク ----
  {
    category: "road",
    brand: "Trek",
    model: "Domane AL 2",
    price: [70000, 110000],
    since: 2020,
    component: "shimano_claris",
  },
  {
    category: "road",
    brand: "Trek",
    model: "Émonda ALR 5",
    price: [130000, 210000],
    since: 2017,
    component: "shimano_105",
  },
  {
    category: "road",
    brand: "Trek",
    model: "Madone SL 6",
    price: [330000, 520000],
    since: 2019,
    component: "shimano_ultegra",
  },
  {
    category: "road",
    brand: "Giant",
    model: "CONTEND AR 3",
    price: [70000, 110000],
    since: 2019,
    component: "shimano_sora",
  },
  {
    category: "road",
    brand: "Giant",
    model: "TCR ADVANCED 2",
    price: [180000, 290000],
    since: 2016,
    component: "shimano_105",
  },
  {
    category: "road",
    brand: "Giant",
    model: "DEFY ADVANCED 3",
    price: [150000, 240000],
    since: 2017,
    component: "shimano_tiagra",
  },
  {
    category: "road",
    brand: "Specialized",
    model: "ALLEZ ELITE",
    price: [90000, 150000],
    since: 2016,
    component: "shimano_tiagra",
  },
  {
    category: "road",
    brand: "Specialized",
    model: "TARMAC SL7 COMP",
    price: [340000, 560000],
    since: 2020,
    component: "shimano_ultegra",
  },
  {
    category: "road",
    brand: "Specialized",
    model: "ROUBAIX SPORT",
    price: [200000, 320000],
    since: 2017,
    component: "shimano_105",
  },
  {
    category: "road",
    brand: "Cannondale",
    model: "CAAD13 105",
    price: [160000, 250000],
    since: 2019,
    component: "shimano_105",
  },
  {
    category: "road",
    brand: "Cannondale",
    model: "SYNAPSE CARBON 2",
    price: [260000, 400000],
    since: 2018,
    component: "shimano_ultegra",
  },
  {
    category: "road",
    brand: "Bianchi",
    model: "VIA NIRONE 7",
    price: [80000, 140000],
    since: 2013,
    component: "shimano_sora",
  },
  {
    category: "road",
    brand: "Bianchi",
    model: "OLTRE XR4",
    price: [380000, 700000],
    since: 2016,
    component: "shimano_dura_ace",
  },
  {
    category: "road",
    brand: "Merida",
    model: "SCULTURA 400",
    price: [110000, 170000],
    since: 2016,
    component: "shimano_105",
  },
  {
    category: "road",
    brand: "Merida",
    model: "REACTO 4000",
    price: [190000, 300000],
    since: 2017,
    component: "shimano_105",
  },
  {
    category: "road",
    brand: "Scott",
    model: "SPEEDSTER 20",
    price: [90000, 150000],
    since: 2015,
    component: "shimano_tiagra",
  },
  {
    category: "road",
    brand: "Scott",
    model: "ADDICT RC 30",
    price: [300000, 480000],
    since: 2018,
    component: "shimano_ultegra",
  },
  {
    category: "road",
    brand: "Pinarello",
    model: "PRINCE",
    price: [350000, 620000],
    since: 2018,
    component: "shimano_ultegra",
  },
  {
    category: "road",
    brand: "Pinarello",
    model: "DOGMA F",
    price: [700000, 1200000],
    since: 2021,
    component: "shimano_dura_ace",
  },
  {
    category: "road",
    brand: "Colnago",
    model: "V3 DISC",
    price: [400000, 700000],
    since: 2020,
    component: "shimano_ultegra",
  },
  {
    category: "road",
    brand: "Cervélo",
    model: "CALEDONIA 105",
    price: [330000, 520000],
    since: 2020,
    component: "shimano_105",
  },
  {
    category: "road",
    brand: "Cervélo",
    model: "S5",
    price: [650000, 1100000],
    since: 2019,
    component: "shimano_dura_ace",
  },
  {
    category: "road",
    brand: "Canyon",
    model: "Endurace CF 7",
    price: [230000, 350000],
    since: 2019,
    component: "shimano_105",
  },
  {
    category: "road",
    brand: "Canyon",
    model: "Ultimate CF SL 8",
    price: [300000, 460000],
    since: 2019,
    component: "shimano_ultegra",
  },
  {
    category: "road",
    brand: "BMC",
    model: "Teammachine SLR Five",
    price: [340000, 540000],
    since: 2018,
    component: "shimano_105",
  },
  {
    category: "road",
    brand: "ANCHOR",
    model: "RL6 DROP",
    price: [110000, 180000],
    since: 2016,
    component: "shimano_105",
  },
  {
    category: "road",
    brand: "ANCHOR",
    model: "RS9s",
    price: [420000, 700000],
    since: 2018,
    component: "shimano_dura_ace",
  },
  {
    category: "road",
    brand: "FUJI",
    model: "NAOMI",
    price: [70000, 120000],
    since: 2015,
    component: "shimano_claris",
  },
  {
    category: "road",
    brand: "GIOS",
    model: "AIRONE",
    price: [110000, 180000],
    since: 2014,
    component: "shimano_tiagra",
  },
  {
    category: "road",
    brand: "LOUIS GARNEAU",
    model: "LGS-CR",
    price: [70000, 120000],
    since: 2014,
    component: "shimano_claris",
  },

  // ---- クロスバイク ----
  {
    category: "cross",
    brand: "GIOS",
    model: "MISTRAL",
    price: [35000, 62000],
    since: 2012,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "Giant",
    model: "ESCAPE R3",
    price: [30000, 55000],
    since: 2012,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "Giant",
    model: "GRAVIER",
    price: [45000, 75000],
    since: 2016,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "Trek",
    model: "FX 2 DISC",
    price: [45000, 78000],
    since: 2019,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "Trek",
    model: "FX 3 DISC",
    price: [65000, 105000],
    since: 2019,
    component: "shimano_sora",
  },
  {
    category: "cross",
    brand: "Specialized",
    model: "SIRRUS X 2.0",
    price: [55000, 90000],
    since: 2019,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "Cannondale",
    model: "QUICK 4",
    price: [50000, 85000],
    since: 2016,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "Bianchi",
    model: "ROMA 3",
    price: [50000, 88000],
    since: 2013,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "Merida",
    model: "CROSSWAY 100-R",
    price: [40000, 70000],
    since: 2015,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "KhodaaBloom",
    model: "RAIL DISC",
    price: [55000, 95000],
    since: 2018,
    component: "shimano_sora",
  },
  {
    category: "cross",
    brand: "NESTO",
    model: "VACANZE 2",
    price: [30000, 52000],
    since: 2016,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "FUJI",
    model: "PALETTE",
    price: [40000, 68000],
    since: 2014,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "LOUIS GARNEAU",
    model: "SETTER 8.0",
    price: [38000, 65000],
    since: 2015,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "BRIDGESTONE",
    model: "CYLVA F24",
    price: [35000, 60000],
    since: 2015,
    component: "shimano_claris",
  },
  {
    category: "cross",
    brand: "RALEIGH",
    model: "RFC RADFORD CLASSIC",
    price: [55000, 92000],
    since: 2014,
    component: "shimano_sora",
  },

  // ---- マウンテンバイク ----
  {
    category: "mtb",
    brand: "Trek",
    model: "MARLIN 6",
    price: [55000, 90000],
    since: 2016,
    component: "shimano_claris",
  },
  {
    category: "mtb",
    brand: "Trek",
    model: "ROSCOE 7",
    price: [120000, 200000],
    since: 2018,
    component: "shimano_sora",
  },
  {
    category: "mtb",
    brand: "Giant",
    model: "TALON 3",
    price: [50000, 82000],
    since: 2016,
    component: "shimano_claris",
  },
  {
    category: "mtb",
    brand: "Specialized",
    model: "ROCKHOPPER",
    price: [60000, 100000],
    since: 2014,
    component: "shimano_claris",
  },
  {
    category: "mtb",
    brand: "Specialized",
    model: "STUMPJUMPER ALLOY",
    price: [250000, 420000],
    since: 2018,
    component: "sram_rival",
  },
  {
    category: "mtb",
    brand: "Cannondale",
    model: "TRAIL 6",
    price: [55000, 92000],
    since: 2017,
    component: "shimano_claris",
  },
  {
    category: "mtb",
    brand: "Merida",
    model: "BIG.SEVEN 20",
    price: [50000, 85000],
    since: 2016,
    component: "shimano_claris",
  },
  {
    category: "mtb",
    brand: "Scott",
    model: "ASPECT 950",
    price: [55000, 95000],
    since: 2016,
    component: "shimano_claris",
  },
  {
    category: "mtb",
    brand: "Canyon",
    model: "Neuron 6",
    price: [220000, 350000],
    since: 2019,
    component: "sram_rival",
  },
  {
    category: "mtb",
    brand: "BMC",
    model: "Twostroke 01 FIVE",
    price: [230000, 380000],
    since: 2019,
    component: "sram_rival",
  },

  // ---- シティサイクル ----
  {
    category: "city",
    brand: "BRIDGESTONE",
    model: "アルベルト L型",
    price: [28000, 52000],
    since: 2014,
    sizes: [],
  },
  {
    category: "city",
    brand: "BRIDGESTONE",
    model: "ステップクルーズ",
    price: [22000, 40000],
    since: 2015,
    sizes: [],
  },
  {
    category: "city",
    brand: "BRIDGESTONE",
    model: "マークローザ 7S",
    price: [30000, 55000],
    since: 2016,
    sizes: [],
  },
  {
    category: "city",
    brand: "Panasonic",
    model: "シナモン・JP",
    price: [25000, 45000],
    since: 2015,
    sizes: [],
  },
  {
    category: "city",
    brand: "RALEIGH",
    model: "RSC RADFORD SPORT",
    price: [45000, 78000],
    since: 2014,
    sizes: [],
  },
  {
    category: "city",
    brand: "LOUIS GARNEAU",
    model: "MULTIWAY 27",
    price: [30000, 52000],
    since: 2016,
    sizes: [],
  },

  // ---- ミニベロ ----
  {
    category: "minivelo",
    brand: "DAHON",
    model: "K3",
    price: [50000, 85000],
    since: 2018,
    sizes: [],
  },
  {
    category: "minivelo",
    brand: "DAHON",
    model: "Boardwalk D7",
    price: [40000, 68000],
    since: 2013,
    sizes: [],
  },
  {
    category: "minivelo",
    brand: "tern",
    model: "Link A7",
    price: [38000, 62000],
    since: 2014,
    sizes: [],
  },
  {
    category: "minivelo",
    brand: "tern",
    model: "Verge N8",
    price: [70000, 120000],
    since: 2015,
    sizes: [],
  },
  {
    category: "minivelo",
    brand: "Brompton",
    model: "C Line Explore",
    price: [150000, 260000],
    since: 2021,
    sizes: [],
  },
  {
    category: "minivelo",
    brand: "Brompton",
    model: "M6L",
    price: [120000, 220000],
    since: 2013,
    sizes: [],
  },
  {
    category: "minivelo",
    brand: "Bianchi",
    model: "MINIVELO 7",
    price: [45000, 78000],
    since: 2014,
    sizes: [],
  },
  {
    category: "minivelo",
    brand: "GIOS",
    model: "PANTO",
    price: [55000, 95000],
    since: 2014,
    sizes: [],
  },
  {
    category: "minivelo",
    brand: "RALEIGH",
    model: "RSW SPORT",
    price: [50000, 88000],
    since: 2014,
    sizes: [],
  },

  // ---- e-bike ----
  {
    category: "ebike",
    brand: "YAMAHA",
    model: "PAS With",
    price: [60000, 105000],
    since: 2016,
    sizes: [],
  },
  {
    category: "ebike",
    brand: "YAMAHA",
    model: "PAS Brace XL",
    price: [90000, 160000],
    since: 2016,
    sizes: [],
  },
  {
    category: "ebike",
    brand: "YAMAHA",
    model: "YPJ-EC",
    price: [130000, 230000],
    since: 2018,
    sizes: [],
  },
  {
    category: "ebike",
    brand: "Panasonic",
    model: "ジェッター",
    price: [90000, 155000],
    since: 2015,
    sizes: [],
  },
  {
    category: "ebike",
    brand: "Panasonic",
    model: "ビビ・DX",
    price: [65000, 115000],
    since: 2015,
    sizes: [],
  },
  {
    category: "ebike",
    brand: "BRIDGESTONE",
    model: "TB1e",
    price: [80000, 140000],
    since: 2019,
    sizes: [],
  },
  {
    category: "ebike",
    brand: "BRIDGESTONE",
    model: "アシスタU STD",
    price: [55000, 98000],
    since: 2016,
    sizes: [],
  },
  {
    category: "ebike",
    brand: "Trek",
    model: "Verve+ 2",
    price: [180000, 300000],
    since: 2020,
    sizes: [],
  },
  {
    category: "ebike",
    brand: "Specialized",
    model: "TURBO VADO 4.0",
    price: [280000, 460000],
    since: 2019,
    sizes: [],
  },
  {
    category: "ebike",
    brand: "tern",
    model: "HSD P9",
    price: [230000, 380000],
    since: 2020,
    sizes: [],
  },
];

/** パーツ。sub は parts_subcategory と対応させる */
export const PARTS = [
  { sub: "component", brand: "Shimano", model: "105 R7000 リアディレイラー", price: [6000, 12000] },
  {
    sub: "component",
    brand: "Shimano",
    model: "ULTEGRA R8000 クランクセット 50-34T",
    price: [18000, 32000],
  },
  {
    sub: "component",
    brand: "Shimano",
    model: "DURA-ACE R9100 スプロケット 11-28T",
    price: [15000, 26000],
  },
  {
    sub: "component",
    brand: "Shimano",
    model: "DEORE XT M8100 リアディレイラー",
    price: [8000, 15000],
  },
  { sub: "component", brand: "SRAM", model: "Rival AXS リアディレイラー", price: [28000, 48000] },
  {
    sub: "component",
    brand: "Campagnolo",
    model: "CHORUS 12s エルゴパワー",
    price: [45000, 78000],
  },
  { sub: "wheel", brand: "MAVIC", model: "KSYRIUM S ホイールセット", price: [45000, 80000] },
  { sub: "wheel", brand: "MAVIC", model: "COSMIC SL 45 ホイールセット", price: [110000, 190000] },
  { sub: "wheel", brand: "FULCRUM", model: "Racing 3 DB ホイールセット", price: [55000, 95000] },
  { sub: "wheel", brand: "FULCRUM", model: "Racing Zero ホイールセット", price: [90000, 150000] },
  {
    sub: "wheel",
    brand: "Campagnolo",
    model: "BORA WTO 45 ホイールセット",
    price: [220000, 380000],
  },
  { sub: "wheel", brand: "Shimano", model: "WH-RS500 ホイールセット", price: [18000, 32000] },
  { sub: "frame", brand: "Cannondale", model: "CAAD10 フレームセット", price: [45000, 85000] },
  { sub: "frame", brand: "Trek", model: "Émonda SL フレームセット", price: [90000, 160000] },
  { sub: "cockpit", brand: "Shimano", model: "PRO VIBE ハンドルバー 400mm", price: [7000, 14000] },
  {
    sub: "cockpit",
    brand: "Specialized",
    model: "S-Works カーボンシートポスト",
    price: [12000, 24000],
  },
  { sub: "saddle", brand: "Specialized", model: "POWER COMP サドル 143mm", price: [8000, 15000] },
  { sub: "saddle", brand: "Bianchi", model: "レザーサドル", price: [4000, 9000] },
  { sub: "pedal", brand: "Shimano", model: "PD-R7000 ペダル", price: [6000, 11000] },
  { sub: "pedal", brand: "Shimano", model: "PD-M520 SPDペダル", price: [3000, 6000] },
  { sub: "tire", brand: "Shimano", model: "IRC FORMULA PRO 700x25C 2本組", price: [5000, 10000] },
  {
    sub: "accessory",
    brand: "Trek",
    model: "Bontrager ボトルケージ 2個セット",
    price: [1500, 3500],
  },
  { sub: "accessory", brand: "Giant", model: "フロアポンプ", price: [2500, 5000] },
];

export const SIZE_CM = { XS: [44, 47], S: [48, 50], M: [51, 54], L: [55, 57], XL: [58, 60] };

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const PREF_NAMES = {
  "01": "札幌",
  "04": "仙台",
  11: "さいたま",
  12: "千葉",
  13: "都内",
  14: "横浜",
  23: "名古屋",
  26: "京都",
  27: "大阪",
  28: "神戸",
  34: "広島",
  40: "福岡",
};

/** 状態に応じた一言。写真では分からないところを書く */
const CONDITION_NOTES = {
  new: [
    "知人から譲り受けたものの、サイズが合わず未使用のままでした。",
    "購入したまま乗る機会がなく、室内に置いたままでした。傷はありません。",
  ],
  like_new: [
    "室内保管で、目立つ傷はありません。",
    "数回しか乗っておらず、状態は良いほうだと思います。",
  ],
  good: [
    "小傷はありますが、走行に影響するものはありません。",
    "使用に伴う細かい擦れはあるものの、大きな傷や凹みはありません。",
    "普段は室内保管でした。動作はいずれも問題ありません。",
  ],
  fair: [
    "トップチューブに擦り傷があります(3枚目)。走行には支障ありません。",
    "屋外保管だったため、金属部分に軽いサビが出ています。",
    "使用感はありますが、整備すればまだ十分乗れる状態です。",
  ],
  poor: [
    "変速の調整とタイヤ交換が必要です。現状渡しでお願いします。",
    "長く乗っておらず、各部の整備が前提の価格にしています。",
  ],
  junk: [
    "フレームに凹みがあり、そのままでは乗れません。部品取りとしてお考えください。",
    "動作未確認のジャンク品です。返品はご容赦ください。",
  ],
};

/** パーツは「走行」の話が合わないので、別の言い回しにする */
const PARTS_CONDITION_NOTES = {
  new: [
    "予備で買ったものの使う機会がなく、未開封のままです。",
    "サイズ違いで取り付けられず、未使用のまま保管していました。",
  ],
  like_new: [
    "数回使っただけで、大きな傷はありません。",
    "半年ほど使用しましたが、状態は良いほうだと思います。",
  ],
  good: [
    "使用に伴う小傷はありますが、機能に問題はありません。",
    "取り外して清掃済みです。動作は問題ありません。",
  ],
  fair: [
    "擦り傷と塗装の剥げがあります。使用には支障ありません。",
    "使用感はありますが、まだ十分使える状態です。",
  ],
  poor: [
    "消耗が進んでいるため、交換前提の価格にしています。",
    "動きが渋いところがあります。現状渡しでお願いします。",
  ],
  junk: [
    "破損しているため、部品取りとしてお考えください。",
    "動作未確認のジャンク品です。返品はご容赦ください。",
  ],
};

const USAGE = [
  "通勤で片道8kmほど、週末にたまにロングライドという使い方でした。",
  "週末に近所の川沿いを走る程度で、雨の日は乗っていません。",
  "月に2〜3回、河川敷を走るくらいの頻度でした。",
  "買い物と駅までの往復に使っていました。",
  "レースには使っておらず、ファンライド中心でした。",
];

const MAINTENANCE = [
  "今年の春にチェーンとバーテープを交換しています。",
  "購入後にタイヤとブレーキシューを新品にしました。",
  "昨年ショップでオーバーホール済みです。",
  "ワイヤー類は半年ほど前に交換しました。",
];

const EXTRAS = [
  "純正ペダルと予備チューブをお付けします。",
  "取扱説明書と購入時のレシートが残っています。",
  "ボトルケージ2個をそのままお付けします。",
];

const CLOSING = [
  "気になる点があればコメントからお気軽にどうぞ。",
  "細かい点はご質問いただければ写真を追加します。",
  "値下げのご相談も承ります。",
];

function maybe(list, chance) {
  return Math.random() < chance ? pick(list) : null;
}

export function buildDescription({ brand, model, year, condition, delivery, pref, isParts }) {
  const lines = [];

  if (isParts) {
    lines.push(
      pick([
        `${brand} ${model}を出品します。`,
        `使わなくなった ${brand} ${model}です。`,
        `${brand} ${model}、動作確認済みです。`,
      ]),
    );
  } else {
    lines.push(
      pick([
        `${brand} の ${model}(${year}年モデル)です。`,
        `${year}年に購入した ${brand} ${model} を出品します。`,
        `乗り換えのため、${brand} ${model} を手放します。`,
      ]),
    );
  }

  if (!isParts) {
    const usage = maybe(USAGE, 0.75);
    if (usage) lines.push(usage);
  }

  lines.push(pick((isParts ? PARTS_CONDITION_NOTES : CONDITION_NOTES)[condition]));

  // 整備歴やおまけは車体の話。パーツには添えない
  if (!isParts) {
    const maintenance = maybe(MAINTENANCE, 0.45);
    if (maintenance) lines.push(maintenance);

    const extras = maybe(EXTRAS, 0.35);
    if (extras) lines.push(extras);
  }

  if (delivery === "in_person") {
    lines.push(`${PREF_NAMES[pref] ?? "近隣"}まで取りに来ていただける方限定です。`);
  } else if (isParts) {
    lines.push("緩衝材で包み、宅配便でお送りします。");
  } else {
    lines.push(
      pick([
        "発送は輪行箱に梱包してお送りします。",
        "梱包のうえ、ヤマト便での発送を予定しています。",
      ]),
    );
  }

  const closing = maybe(CLOSING, 0.6);
  if (closing) lines.push(closing);

  // 1行に詰めず、実際の出品のように段落を分ける
  return lines.join("\n");
}
