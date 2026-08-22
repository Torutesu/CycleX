import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { AvatarUploader } from "@/features/profile/components/avatar-uploader";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "プロフィール編集" };

export default async function ProfileEditPage() {
  const user = await requireUser("/mypage/profile");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("users")
    .select("display_name, bio, prefecture, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/mypage"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        マイページ
      </Link>

      <h1 className="text-xl font-bold">プロフィール編集</h1>

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-medium">アイコン</h2>
        <AvatarUploader
          userId={user.id}
          displayName={profile?.display_name ?? user.displayName}
          currentPath={profile?.avatar_url ?? null}
        />
      </section>

      <div className="mt-8">
        <ProfileForm
          defaultValues={{
            displayName: profile?.display_name ?? "",
            bio: profile?.bio ?? "",
            prefecture: profile?.prefecture ?? "",
          }}
        />
      </div>
    </div>
  );
}
