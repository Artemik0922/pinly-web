import { Suspense } from "react";
import type { Metadata } from "next";
import { BoardView } from "@/components/BoardView";
import { boardMeta } from "@/lib/meta";
import { SITE_URL } from "@/lib/site";

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
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.path },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE_URL}${meta.path}`,
      images: meta.imageUrl ? [{ url: meta.imageUrl, alt: meta.title }] : undefined,
    },
  };
}

export default function BoardPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Загрузка…</p>}>
      <BoardContent params={params} />
    </Suspense>
  );
}
