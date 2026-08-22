import type { Metadata } from "next";
import { listBrands } from "@/features/admin/queries";
import { AdminHeader } from "@/features/admin/components/admin-table";
import { BrandManager } from "@/features/admin/components/brand-manager";

export const metadata: Metadata = { title: "ブランド管理" };

export default async function AdminBrandsPage() {
  const brands = await listBrands();

  return (
    <>
      <AdminHeader
        title="ブランド管理"
        description="出品フォームの選択肢に表示されるブランドを管理します。参照整合のため削除はできません(無効化してください)。"
      />
      <BrandManager brands={brands} />
    </>
  );
}
