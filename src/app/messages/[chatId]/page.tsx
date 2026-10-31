import { Suspense } from "react";
import type { Metadata } from "next";
import { ChatView } from "@/components/chat/ChatView";

type Props = { params: Promise<{ chatId: string }> };

// Переписка приватная — поисковикам её не показываем.
export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

export default function ChatPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Загрузка…</p>}>
      <ChatContent params={params} />
    </Suspense>
  );
}

async function ChatContent({ params }: Props) {
  const { chatId } = await params;
  return <ChatView chatId={chatId} />;
}
