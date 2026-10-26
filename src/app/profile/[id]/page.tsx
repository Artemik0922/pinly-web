import { Suspense } from "react";
import { ProfileView } from "@/components/ProfileView";

type Props = { params: Promise<{ id: string }> };

async function ProfileContent({ params }: Props) {
  const { id } = await params;
  return <ProfileView id={id} />;
}

export default function ProfilePage({ params }: Props) {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-gray-400">Загрузка…</p>}>
      <ProfileContent params={params} />
    </Suspense>
  );
}
