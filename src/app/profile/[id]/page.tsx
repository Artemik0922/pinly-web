import { cookies } from "next/headers";
import type { Metadata } from "next";
import type { ProfileData } from "@/lib/api/social";
import { ProfileView } from "@/components/profile/ProfileView";
import { PublicProfile } from "@/components/profile/PublicProfile";
import { SESSION_COOKIE } from "@/lib/server/backend";
import { absoluteUrl } from "@/lib/site";
import { profileData, profileMeta } from "@/lib/server/meta";
import { jsonLdText, pageMetadata } from "@/lib/server/seo";

type Props = { params: Promise<{ id: string }> };

// Профиль есть в sitemap, но до этого страница собиралась на клиенте:
// краулер получал «Загрузка…» вместо работ мастера, то есть индексировал
// пустую витрину. Теперь витрина приезжает в первом же HTML.
export const instant = false;

const JSONLD_BOARDS = 12;

function profileJsonLd(data: ProfileData) {
  const { profile, boards } = data;
  const url = absoluteUrl(`/profile/${profile.id}`);
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: profile.displayName,
    url,
    mainEntity: {
      "@type": "Person",
      name: profile.displayName,
      url,
      ...(profile.avatarUrl ? { image: absoluteUrl(profile.avatarUrl) } : null),
    },
    // Доски — ради них на профиль и приходят: в разметке тот же список, что
    // видит человек, а не только заголовок.
    ...(boards.length
      ? {
          hasPart: boards.slice(0, JSONLD_BOARDS).map((board) => ({
            "@type": "CollectionPage",
            name: board.title,
            url: absoluteUrl(`/board/${board.id}`),
          })),
        }
      : null),
  };
}

async function ProfileContent({ params }: Props) {
  const { id } = await params;
  const session = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const data = await profileData(id, session);

  // Своему профилю витрина не нужна: под cookie живёт приватный взгляд со
  // своими досками, секретными пинами и редактором. И когда бэкенд молчит,
  // решать должен клиент — он отличает «пользователя нет» от «сервер лежит».
  if (!data || data.profile.isSelf) return <ProfileView id={id} />;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdText(profileJsonLd(data)) }}
      />
      <PublicProfile id={id} initial={data} />
    </>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const meta = await profileMeta(id, session);
  if (!meta) return { title: "Профиль" };
  return pageMetadata({ ...meta, description: undefined });
}

export default function ProfilePage({ params }: Props) {
  return <ProfileContent params={params} />;
}
