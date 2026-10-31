import { Suspense } from "react";
import type { Metadata } from "next";
import { BoardView } from "@/components/board/BoardView";
import { boardMeta } from "@/lib/server/meta";
import { pageMetadata } from "@/lib/server/seo";

type Props = { params: Promise<{ id: string }> };

// await params — динамический доступ, поэтому он внутри Suspense:
// оболочка страницы пререндерится, содержимое достроится на клиенте.
async function BoardContent({ params }: Props) {
  const { id } = await params;
  return <BoardView id={id} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const meta = await boardMeta(id);
  if (!meta) return { title: "Доска" };
  return pageMetadata(meta);
}

export default function BoardPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Загрузка…</p>}>
      <BoardContent params={params} />
    </Suspense>
  );
}
