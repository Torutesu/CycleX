import "server-only";

/**
 * FR-13 のメール通知フック。
 *
 * ここは呼び出し側のインターフェースのみを定義し、実際の送信は Phase 8 で
 * `src/lib/email/send.ts` に接続する。送信失敗が業務処理を止めてはならないため
 * (ADR #9)、各関数は例外を投げず、内部でログに記録する。
 */

type NotifyResult = Promise<void>;

/** 新着メッセージ(同一スレッドへの連続通知は一定時間抑制する) */
export async function notifyNewMessage(threadId: string, senderId: string): NotifyResult {
  void threadId;
  void senderId;
}

/** 決済完了(購入者・出品者の双方へ) */
export async function notifyPaid(transactionId: string): NotifyResult {
  void transactionId;
}

/** 発送・受渡連絡(購入者へ) */
export async function notifyShipped(transactionId: string): NotifyResult {
  void transactionId;
}

/** 受取確認(出品者へ) */
export async function notifyReceived(transactionId: string): NotifyResult {
  void transactionId;
}

/** 評価の依頼(相手方へ) */
export async function notifyReviewRequested(transactionId: string, reviewerId: string): NotifyResult {
  void transactionId;
  void reviewerId;
}

/** 評価が届いた(被評価者へ) */
export async function notifyReviewReceived(transactionId: string, revieweeId: string): NotifyResult {
  void transactionId;
  void revieweeId;
}

/** 取引完了(双方へ) */
export async function notifyCompleted(transactionId: string): NotifyResult {
  void transactionId;
}

/** 取引キャンセル(双方へ。通知設定で無効化できない) */
export async function notifyCanceled(transactionId: string, reason: string): NotifyResult {
  void transactionId;
  void reason;
}

/** 登録完了のウェルカムメール */
export async function notifyWelcome(userId: string): NotifyResult {
  void userId;
}
