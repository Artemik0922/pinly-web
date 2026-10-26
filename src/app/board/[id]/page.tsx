import { Suspense } from "react";
import { BoardView } from "@/components/BoardView";

type Props = { params: Promise<{ id: string }> };

// await params — динамический доступ, поэтому он внутри Suspense:
// оболочка страницы пререндерится, содержимое достроится на клиенте.
async function BoardContent({ params }: Props) {
  const { id } = await params;
  return <BoardView id={id} />;
}

export default function BoardPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-gray-400">Загрузка…</p>}>
      <BoardContent params={params} />
    </Suspense>
  );
}
