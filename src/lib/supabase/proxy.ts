import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decideAccess,
  isAdminPath,
  isProtectedPath,
  type AccountStatus,
} from "@/lib/supabase/access-rules";
import type { Database } from "@/types/database";

/**
 * Cookie セッションのリフレッシュとルート保護。
 * Next.js 16 では middleware が proxy に改称されたため、ルートの proxy.ts から呼び出す。
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() はセッションを検証しつつ必要ならトークンをリフレッシュする。
  // この呼び出しを削ると保護ルートでセッションが切れるため必須。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  // 停止・退会は app_metadata に書いてある(停止処理が Auth 側にも記録する)。
  // getUser() は Auth サーバーから最新値を返すので、DB を引かずに全パスで判定できる
  let status: AccountStatus | null = null;
  const metaStatus = user?.app_metadata?.status;
  if (metaStatus === "suspended" || metaStatus === "withdrawn") status = metaStatus;

  // 会員向け・管理画面のときだけプロフィールを引く。
  // 公開ページでも毎回引いていたため、全リクエストに DB 往復が乗っていた。
  // role / status は anon には列単位で見せていないため service role で読む
  // (id は getUser() で検証済み)。
  let role: "user" | "admin" | null = null;
  if (user && status === null && (isProtectedPath(pathname) || isAdminPath(pathname))) {
    const { data: profile } = await createAdminClient()
      .from("users")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();
    role = profile?.role === "admin" ? "admin" : "user";
    // app_metadata が未設定でも DB の状態を正とする
    if (profile?.status === "suspended" || profile?.status === "withdrawn") {
      status = profile.status;
    }
  }

  const decision = decideAccess(pathname, Boolean(user), status, role);

  switch (decision.kind) {
    case "login": {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
    case "suspended": {
      const suspendedUrl = request.nextUrl.clone();
      suspendedUrl.pathname = "/suspended";
      suspendedUrl.search = "";
      return NextResponse.redirect(suspendedUrl);
    }
    case "not_found":
      return NextResponse.rewrite(new URL("/404", request.url));
    case "allow":
      return response;
  }
}
