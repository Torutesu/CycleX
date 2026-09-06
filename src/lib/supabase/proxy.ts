import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/** ログイン必須のパス(前方一致) */
const PROTECTED_PREFIXES = ["/sell", "/mypage", "/messages", "/transactions", "/purchase"] as const;

/** 管理者のみアクセス可能なパス */
const ADMIN_PREFIX = "/admin";

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

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

  if (!user && (isProtected(pathname) || isAdminPath(pathname))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // 会員向け・管理画面のときだけプロフィールを引く。
  // 公開ページでも毎回引いていたため、全リクエストに DB 往復が乗っていた。
  // role / status は anon には列単位で見せていないため service role で読む
  // (id は getUser() で検証済み)。
  if (user && (isProtected(pathname) || isAdminPath(pathname))) {
    const { data: profile } = await createAdminClient()
      .from("users")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();

    // 利用停止ユーザーは会員向けの画面を操作できない
    if (profile?.status === "suspended" && pathname !== "/suspended") {
      const suspendedUrl = request.nextUrl.clone();
      suspendedUrl.pathname = "/suspended";
      suspendedUrl.search = "";
      return NextResponse.redirect(suspendedUrl);
    }

    // 管理画面の存在自体を隠すため、権限不足は 404 として扱う
    if (isAdminPath(pathname) && profile?.role !== "admin") {
      return NextResponse.rewrite(new URL("/404", request.url));
    }
  }

  return response;
}
