import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPinById, getRelated } from "@/lib/feed";
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
  return <PinDetail pin={pin} related={related} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const pin = await getPinById(id);
  if (!pin) return { title: "Пин не найден — Pinly" };
  return { title: `${pin.title} — Pinly`, description: pin.description || `Пин от ${pin.author}` };
}

export default function PinPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-gray-400">Загрузка…</p>}>
      <PinContent params={params} />
    </Suspense>
  );
}
