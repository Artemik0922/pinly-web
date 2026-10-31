import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPinById, getRelated } from "@/lib/server/feed";
import { pinImageSize, pinImageUrl } from "@/lib/pin";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { jsonLdText, pageMetadata } from "@/lib/server/seo";
import { PinDetail } from "@/components/pin/PinDetail";

type Props = { params: Promise<{ id: string }> };

// await params и данные — динамический доступ внутри Suspense,
// чтобы оболочка страницы пререндерилась (шаблон Next 16).
async function PinContent({ params }: Props) {
  // Пин тянется из внешних API и дискового кэша с Date.now() —
  // connection() переводит рендер в серверный, без пререндера.
  await connection();
  const { id } = await params;
  const pin = await getPinById(id);
  if (!pin) notFound();
  const related = await getRelated(pin);
  const [w, h] = pinImageSize(pin);
  // Структурированные данные: страница пина — это CreativeWork с указанием
  // автора и лицензии (требование CC-лицензий, по которым идут источники).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: pin.title,
    ...(pin.description ? { description: pin.description } : {}),
    url: `${SITE_URL}/pin/${pin.id}`,
    image: absoluteUrl(pinImageUrl(pin)),
    artworkSurface: `${w}x${h}`,
    creator: { "@type": "Person", name: pin.author },
    ...(pin.license ? { license: pin.license.toUpperCase() } : {}),
    ...(pin.pageUrl ? { isBasedOn: pin.pageUrl } : {}),
    keywords: pin.tags.join(", "),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdText(jsonLd) }}
      />
      <PinDetail pin={pin} related={related} />
    </>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Как и PinContent: getPinById читает дисковый кэш с Date.now() —
  // без connection() пререндер метаданных падает на нестабильном значении.
  await connection();
  const { id } = await params;
  const pin = await getPinById(id);
  if (!pin) return { title: "Пин не найден" };
  // og подписывает автора, когда описания нет — короткая строка вместо пустой
  return pageMetadata({
    title: pin.title,
    description: pin.description || `Пин от ${pin.author} · ${pin.category}`,
    path: `/pin/${pin.id}`,
    imageUrl: pinImageUrl(pin),
    type: "article",
  });
}

export default function PinPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Загрузка…</p>}>
      <PinContent params={params} />
    </Suspense>
  );
}
