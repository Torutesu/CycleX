import type { Metadata } from "next";
import { listBrands } from "@/features/admin/queries";
import { AdminHeader } from "@/features/admin/components/admin-table";
import { BrandManager } from "@/features/admin/components/brand-manager";

export const metadata: Metadata = { title: "メーカー管理" };

export default async function AdminBrandsPage() {
  const brands = await listBrands();

  return (
    <>
      <AdminHeader
        title="メーカー管理"
        description="出品フォームの選択肢に表示されるメーカーを管理します。カナ読みは検索と絞り込みに使います。参照整合のため削除はできません(無効化してください)。"
      />
      <BrandManager brands={brands} />
    </>
  );
}
