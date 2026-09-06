/**
 * 相手の操作待ちのときに出す案内(FR-08)。
 *
 * 配送では購入者がお届け先を伝えないと出品者は発送できないが、
 * 決済のあとに住所を集める画面は無く(配送業者連携は対象外)、
 * やりとりで伝える前提になっている。
 * 「お待ちください」とだけ出すと双方が待ち続けて取引が止まるため、
 * 購入者にはお届け先を送るよう促す。
 *
 * 表示だけを決める純粋な関数なのでテストで網羅する。
 */
export type WaitingNotice = {
  title: string;
  detail?: string;
  /** メッセージ画面への導線を出すか */
  showMessageLink?: boolean;
};

export function waitingNotice(
  status: string,
  role: "buyer" | "seller",
  deliveryMethod: string | null,
  hasReviewed: boolean,
): WaitingNotice {
  if (status === "received" && hasReviewed) {
    return { title: "相手の評価をお待ちください" };
  }

  if (status === "pending_payment") {
    return role === "seller"
      ? { title: "購入者のお支払いをお待ちください" }
      : { title: "お支払いの確認中です" };
  }

  if (status === "paid") {
    if (role !== "buyer") return { title: "発送・受渡のご連絡をお願いします" };

    return deliveryMethod === "in_person"
      ? {
          title: "受渡の日時と場所をご相談ください",
          detail:
            "メッセージで待ち合わせのご相談をしてください。決まりましたら出品者から連絡があります。",
          showMessageLink: true,
        }
      : {
          title: "お届け先をお伝えください",
          detail:
            "出品者が発送できるよう、メッセージでお届け先の住所・氏名・電話番号をお送りください。発送が済むと出品者から連絡があります。",
          showMessageLink: true,
        };
  }

  if (status === "shipped") {
    return { title: "購入者の受取確認をお待ちください" };
  }

  return { title: "相手の操作をお待ちください" };
}
