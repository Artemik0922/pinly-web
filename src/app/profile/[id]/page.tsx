import { Suspense } from "react";
import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/ProfileView";
import { profileMeta } from "@/lib/server/meta";
import { pageMetadata } from "@/lib/server/seo";

type Props = { params: Promise<{ id: string }> };

async function ProfileContent({ params }: Props) {
  const { id } = await params;
  return <ProfileView id={id} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const meta = await profileMeta(id);
  if (!meta) return { title: "Профиль" };
  return pageMetadata({ ...meta, description: undefined });
}

export default function ProfilePage({ params }: Props) {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Загрузка…</p>}>
      <ProfileContent params={params} />
    </Suspense>
  );
}
