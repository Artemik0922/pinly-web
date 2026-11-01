"use client";

// Переписка: пузыри, пин-карточки, поллинг новых сообщений (?after=, только
// на видимой вкладке), оптимистичная отправка и отметка прочитанного.
// Никаких скелетонов: пока сообщения не доехали — только строка «Загрузка…».
// Состояние нити — в useChatThread, разметка — в ChatHeader / MessageList /
// Composer / PinAttachment.

import Link from "next/link";
import { useState } from "react";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { MessageList } from "@/components/chat/MessageList";
import { PinPickerDialog } from "@/components/chat/PinPickerDialog";
import { useChatThread } from "@/components/chat/useChatThread";
import { SignInGate } from "@/components/ui/SignInGate";
import { useUser } from "@/lib/state/session";

export function ChatView({ chatId }: { chatId: string }) {
  const { user, ready, enabled } = useUser();
  const {
    chat,
    messages,
    error,
    hasMore,
    loadingMore,
    text,
    setText,
    bottomRef,
    sendText,
    sendPin,
    loadOlder,
  } = useChatThread(chatId);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!ready || !enabled) return null;

  if (!user) return <SignInGate title="Сообщения" hint="Войдите, чтобы читать переписку." />;

  if (error) {
    return (
      <main className="mx-auto w-full max-w-shell-text px-4 py-10 text-center">
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
        <Link
          href="/messages"
          className="mt-4 inline-block rounded-full bg-surface px-5 py-2 text-sm font-semibold hover:bg-surface-card"
        >
          Все чаты
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-shell-text flex-col px-4 pb-4">
      <ChatHeader chat={chat} />

      <MessageList
        messages={messages}
        hasMore={hasMore}
        loadingMore={loadingMore}
        userId={user.id}
        bottomRef={bottomRef}
        onLoadOlder={loadOlder}
      />

      <Composer
        text={text}
        setText={setText}
        sendText={sendText}
        onOpenPicker={() => setPickerOpen(true)}
      />

      <PinPickerDialog
        open={pickerOpen}
        title="Отправить пин"
        emptyText="Своих пинов не нашлось. Загрузите пин — и он полетит в чат."
        onPick={(pin) => {
          setPickerOpen(false);
          sendPin(pin);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </main>
  );
}
