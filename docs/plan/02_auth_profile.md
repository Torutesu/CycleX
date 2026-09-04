# Phase 2: 認証・プロフィール・共通レイアウト(20h)

ゴール: 登録〜ログイン〜プロフィール編集〜退会が動作し、全画面共通のナビゲーション(スマホ: 下部タブ / PC: ヘッダー)が入る。

## T-2.1 共通レイアウト(FR-14 の骨格)

- `src/components/layout/header.tsx`: ロゴ(テキスト「CycleX」)・検索バー(`/search?q=` へ submit)・PC のみ: 出品ボタン/お気に入り/メッセージ(未読バッジ)/アカウントメニュー(Avatar + dropdown)
- `src/components/layout/tab-bar.tsx`: `md:hidden fixed bottom-0` の 5 タブ(ホーム/さがす/出品/メッセージ/マイページ)。`usePathname` でアクティブ表示、メッセージに未読数バッジ(Server Component から props)
- `src/app/layout.tsx`: `<Header/> {children} <TabBar/> <Toaster/>`。本文に `pb-16 md:pb-0`(タブバー分の余白)
- 未読数取得 `src/features/message/queries.ts#getUnreadCount()`(この時点ではスタブで 0 を返す)

## T-2.2 サインアップ(FR-01-1)

- `src/features/auth/schema.ts`: `signupSchema = { email, password(8文字以上・英数含む・regex), displayName(1..30) }` ほか本フェーズの全スキーマ
- `src/features/auth/actions.ts#signup`: `supabase.auth.signUp({ email, password, options: { data: { display_name }, emailRedirectTo: APP_URL + '/auth/callback' } })` → 成功で `/verify-email` へ。既存メールはエラーを画面表示
- `/(auth)/signup/page.tsx`: RHF + zodResolver。Google ボタン(T-2.4)併設。ログインへのリンク
- `/(auth)/verify-email/page.tsx`: 案内+再送ボタン(`supabase.auth.resend`)

## T-2.3 ログイン/ログアウト(FR-01-3)

- `actions.ts#login`: `signInWithPassword`。失敗時は一律「メールアドレスまたはパスワードが正しくありません」。成功後 `users.status` を確認し、`suspended` → `/suspended`(利用停止案内ページ)、`withdrawn` → サインアウトさせ「退会済み」エラー
- `next` クエリがあれば検証(相対パスのみ許可)してリダイレクト
- `actions.ts#logout`: signOut → `/`
- `/(auth)/auth/callback/route.ts`: `exchangeCodeForSession` → `next` へ(メール確認・OAuth・リセット共通)

## T-2.4 Google ログイン(FR-01-2)

- `actions.ts#loginWithGoogle`: `signInWithOAuth({ provider: 'google', options: { redirectTo: APP_URL + '/auth/callback?next=...' } })`
- 同一メールの統合は Supabase の自動リンク挙動に委ねる(Google は verified email のため既存アカウントへリンクされる)。手動リンク UI は作らない

## T-2.5 パスワードリセット(FR-01-4)

- `/(auth)/reset-password/page.tsx`: ①メール入力 → `resetPasswordForEmail(email, { redirectTo: APP_URL + '/auth/callback?next=/reset-password/update' })`。結果は常に「送信しました」表示 ②`/reset-password/update/page.tsx`: 新パスワード入力 → `auth.updateUser({ password })`

## T-2.6 プロフィール(FR-02)

- `src/features/profile/actions.ts#updateProfile`: Zod(displayName 1..30, bio ≤1000, prefecture ∈ '01'..'47' | null)→ `users` UPDATE
- `#uploadAvatar`: 画像を `avatars/{userId}.{ext}` へアップロード(client 直 upload、5MB・MIME 検証はクライアント+Storage ポリシー)。表示は変換 URL `?width=160&height=160&resize=cover`
- `/(member)/mypage/profile/page.tsx`: 編集フォーム(アイコンはプレビュー+正方形表示)
- `/(public)/users/[id]/page.tsx`(S-04): プロフィール+評価サマリー(平均★/件数 — reviews から集計、Phase 6 まで 0 件表示)+公開中商品グリッド(Phase 4 のカードを流用するため、この時点は件数のみ)。`status='withdrawn'` は「退会済みユーザー」、`suspended` は 404
- `/(member)/mypage/page.tsx`(M-09): プロフィール概要+メニューリスト

## T-2.7 設定・退会(FR-01-5)

- `/(member)/mypage/settings/page.tsx`: メール変更(`auth.updateUser({ email })` → 確認メール)、パスワード変更、通知設定(Phase 8 で項目追加。器だけ作る)、退会ボタン
- `src/features/auth/actions.ts#withdraw`:
  1. admin クライアントで進行中取引を確認: `transactions where (buyer_id=uid or seller_id=uid) and status in ('pending_payment','paid','shipped','received')` → 存在すればエラー「進行中の取引があるため退会できません」
  2. `users` を `status='withdrawn', display_name='退会済みユーザー', avatar_url=null, bio=null, withdrawn_at=now()` に更新
  3. 公開中・下書きの自分の listing を `withdrawn` に一括更新
  4. `auth.admin.updateUserById(uid, { ban_duration: '876000h' })` でログイン不能化 → signOut → `/` へ
- 確認は Dialog(注意文言+「退会する」)

## T-2.8 ユニットテスト

- `signupSchema`(境界: 7文字/8文字、英字のみ、数字のみ)
- `withdraw` の進行中取引判定(判定を純関数 `canWithdraw(activeTxCount)` に切り出してテスト)

## フェーズ完了条件

- [ ] メール登録 → 確認メール(ローカルは Mailpit)→ ログインが通る
- [ ] パスワードリセットで新パスワードに変更できる
- [ ] プロフィール編集・アイコンアップロードが反映される
- [ ] 退会 → 再ログイン不可・公開プロフィールが「退会済みユーザー」表示
- [ ] 未ログインで `/mypage` → `/login?next=/mypage` → ログイン後復帰
- [ ] 375px で下部タブ、1280px でヘッダーナビに切り替わる
- [ ] 品質ゲート 4 コマンド成功
