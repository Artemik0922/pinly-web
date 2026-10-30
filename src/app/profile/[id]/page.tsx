import { Suspense } from "react";
import type { Metadata } from "next";
import { ProfileView } from "@/components/ProfileView";
import { profileMeta } from "@/lib/meta";

type Props = { params: Promise<{ id: string }> };

async function ProfileContent({ params }: Props) {
  const { id } = await params;
  return <ProfileView id={id} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const meta = await profileMeta(id);
  if (!meta) return { title: "Профиль" };
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.path },
  };
}

export default function ProfilePage({ params }: Props) {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Загрузка…</p>}>
      <ProfileContent params={params} />
    </Suspense>
  );
}
