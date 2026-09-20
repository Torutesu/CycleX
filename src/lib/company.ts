/**
 * 事業者情報。特定商取引法に基づく表記と、問い合わせ導線に使う。
 *
 * 規約類の文面そのものの作成は業務対象外(別紙1 3.(5))なので、
 * ここは「値を入れれば画面に出る器」にしてある。
 * 空のままの項目は表示しない。埋まっていない情報を、それらしく見せないため。
 *
 * 記載内容は公開前に、必ず事業者側で(必要なら弁護士に)確認すること。
 */
export type CompanyField = { label: string; value: string };

/**
 * ここを書き換えると `/tokushoho` に反映される。
 * 値を入れるのは事業者(甲)。エンジニアの確認は要らない。
 */
export const COMPANY = {
  /** 事業者名(例: 株式会社サイクルエックス / 個人事業なら氏名) */
  name: "",
  /** 運営統括責任者 */
  representative: "",
  /** 所在地(例: 東京都〇〇区〇〇 1-2-3 〇〇ビル 4F) */
  address: "",
  /** 電話番号。請求があったら遅滞なく開示する場合は、その旨を書く */
  phone: "",
  /** 問い合わせ先メールアドレス。設定するとフッターに問い合わせリンクが出る */
  email: "",
  /** 受付時間(例: 平日 10:00〜18:00) */
  businessHours: "",
  /** 販売価格について(例: 各商品ページに表示する価格) */
  price: "",
  /** 商品代金以外の必要料金(例: 販売手数料 7%、送料は出品者または購入者の負担) */
  additionalFees: "",
  /** 支払方法(例: クレジットカード決済) */
  paymentMethods: "",
  /** 支払時期(例: 購入手続き時に決済) */
  paymentTiming: "",
  /** 引渡時期(例: 決済確認後、出品者が7日以内に発送) */
  deliveryTiming: "",
  /** 返品・キャンセルの条件 */
  returnPolicy: "",
} as const;

/** 画面に出す並び。値が空の項目は出さない */
export function companyFields(): CompanyField[] {
  return (
    [
      { label: "事業者名", value: COMPANY.name },
      { label: "運営統括責任者", value: COMPANY.representative },
      { label: "所在地", value: COMPANY.address },
      { label: "電話番号", value: COMPANY.phone },
      { label: "メールアドレス", value: COMPANY.email },
      { label: "受付時間", value: COMPANY.businessHours },
      { label: "販売価格", value: COMPANY.price },
      { label: "商品代金以外の必要料金", value: COMPANY.additionalFees },
      { label: "支払方法", value: COMPANY.paymentMethods },
      { label: "支払時期", value: COMPANY.paymentTiming },
      { label: "引渡時期", value: COMPANY.deliveryTiming },
      { label: "返品・キャンセル", value: COMPANY.returnPolicy },
    ] satisfies CompanyField[]
  ).filter((field) => field.value.trim().length > 0);
}

/** 問い合わせ先が設定されているか(導線の出し分けに使う) */
export function contactEmail(): string | null {
  const email = COMPANY.email.trim();
  return email.length > 0 ? email : null;
}
