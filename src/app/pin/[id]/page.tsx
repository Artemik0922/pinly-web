import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPinById, getRelated } from "@/lib/feed";
import { pinImageSize, pinImageUrl } from "@/data/pins";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { PinDetail } from "@/components/PinDetail";

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
  return {
    title: pin.title,
    description: pin.description || `Пин от ${pin.author} · ${pin.category}`,
    alternates: { canonical: `/pin/${pin.id}` },
    openGraph: {
      type: "article",
      title: pin.title,
      description: pin.description || `Пин от ${pin.author}`,
      url: `${SITE_URL}/pin/${pin.id}`,
      images: [{ url: absoluteUrl(pinImageUrl(pin)), alt: pin.title }],
    },
  };
}

export default function PinPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Загрузка…</p>}>
      <PinContent params={params} />
    </Suspense>
  );
}
