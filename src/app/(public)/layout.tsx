import { Footer } from "@/components/layout/footer";

/** 公開画面にはフッター(規約類へのリンク)を表示する */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
