import type { Metadata } from "next";
import { BoardView } from "@/components/board/BoardView";
import { pinImageUrl } from "@/lib/pin";
import type { PublicBoard } from "@/lib/api/boards";
import { absoluteUrl } from "@/lib/site";
import { boardCard, boardMeta } from "@/lib/server/meta";
import { jsonLdText, pageMetadata } from "@/lib/server/seo";

type Props = { params: Promise<{ id: string }> };

// Доска живёт в базе и меняется без пересборки, а её ссылка — главный выход
// мастера к заказчику. Поэтому страница отдаётся на каждый запрос и с
// серверными пинами: оболочка без содержимого показывала краулеру и
// мессенджеру «Загрузка…» вместо работ (тот же приём, что у /category/<slug>).
export const instant = false;

// Витрина целиком: name/url/creator + список пинов. ItemList режется до 30 —
// ровно как срез pins в бэкенде, гнать в разметку сотни позиций смысла нет.
function boardJsonLd(board: PublicBoard) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: board.title,
    url: absoluteUrl(`/board/${board.id}`),
    ...(board.owner
      ? { creator: { "@type": "Person", name: board.owner.name, url: absoluteUrl(`/profile/${board.owner.id}`) } }
      : null),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: board.pinsCount ?? board.pins.length,
      itemListElement: board.pins.slice(0, 30).map((pin, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(`/pin/${pin.id}`),
        name: pin.title,
        image: absoluteUrl(pinImageUrl(pin)),
      })),
    },
  };
}

// await params — динамический доступ, поэтому он внутри Suspense: оболочка
// пререндерится, содержимое достроится на сервере.
async function BoardContent({ params }: Props) {
  const { id } = await params;
  const board = await boardCard(id);
  return (
    <>
      {board && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdText(boardJsonLd(board)) }}
        />
      )}
      {/* Секретной доски здесь нет намеренно: бэкенд отдаёт по ней 404 и
          владельцу тоже, а приватный взгляд собирается на клиенте из своего
          списка досок. notFound() сломал бы именно его. */}
      <BoardView id={id} initialForeign={board} />
    </>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const meta = await boardMeta(id);
  if (!meta) return { title: "Доска" };
  return pageMetadata(meta);
}

export default async function BoardPage({ params }: Props) {
  return <BoardContent params={params} />;
}
