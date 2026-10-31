"use client";

// Состояние переписки: первичная загрузка, поллинг новых сообщений (?after=,
// только на видимой вкладке), оптимистичная отправка и отметка прочитанного.
// View-слой живёт в ChatView.tsx и его субкомпонентах.

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import type { Pin } from "@/lib/pin";
import { apiChat, apiChatMessages, apiChatRead, apiSendChatMessage, type ApiChat, type ApiChatMessage } from "@/lib/api/chats";
import { useUser } from "@/lib/state/session";

const PAGE = 50;
const POLL_MS = 3_000;

export type Display = ApiChatMessage & { pending?: boolean };

function mergeMessages(prev: Display[], incoming: ApiChatMessage[]): Display[] {
  const seen = new Set(incoming.map((m) => m.id));
  return [...prev.filter((m) => !seen.has(m.id)), ...incoming].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
}

export function useChatThread(chatId: string) {
  const { user, ready, enabled } = useUser();
  const { show } = useToast();
  const [chat, setChat] = useState<ApiChat | null>(null);
  const [messages, setMessages] = useState<Display[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  // Граница поллинга — только подтверждённые сервером сообщения: локальное
  // время pending-пузырей может расходиться с серверными часами.
  const lastTsRef = useRef(0);
  // Поллинг начинает тикать только после первой загрузки истории.
  const loadedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  // Поллинг дописывает вниз только если читатель и так у конца: иначе история
  // уезжает из-под носа у того, кто перечитывает старые сообщения.
  useEffect(() => {
    const NEAR_BOTTOM_PX = 240;
    const onScroll = () => {
      const page = document.documentElement;
      nearBottomRef.current =
        page.scrollHeight - window.scrollY - window.innerHeight < NEAR_BOTTOM_PX;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // --- первичная загрузка ---
  useEffect(() => {
    if (!ready || !enabled || !user) return;
    loadedRef.current = false;
    let alive = true;
    const controller = new AbortController();
    Promise.all([
      apiChat(chatId),
      apiChatMessages(chatId, { limit: PAGE }),
    ])
      .then(([chatData, msgs]) => {
        if (!alive) return;
        setChat(chatData);
        setMessages(msgs);
        setHasMore(msgs.length === PAGE);
        lastTsRef.current = msgs.length > 0 ? msgs[msgs.length - 1].createdAt : 0;
        loadedRef.current = true;
        apiChatRead(chatId).catch(() => undefined);
        requestAnimationFrame(scrollToBottom);
      })
      .catch(() => {
        if (alive) setError("Чат недоступен: не удалось загрузить переписку.");
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [chatId, ready, enabled, user, scrollToBottom]);

  // --- поллинг новых сообщений ---
  useEffect(() => {
    if (!ready || !enabled || !user) return;
    const poll = async () => {
      if (document.hidden || !loadedRef.current) return;
      try {
        const fresh = await apiChatMessages(chatId, { after: lastTsRef.current });
        if (fresh.length > 0) {
          lastTsRef.current = fresh[fresh.length - 1].createdAt;
          setMessages((prev) => mergeMessages(prev ?? [], fresh));
          apiChatRead(chatId).catch(() => undefined);
          if (nearBottomRef.current) requestAnimationFrame(scrollToBottom);
        }
      } catch {
        // бэкенд мог мигнуть — молча ждём следующего тика
      }
    };
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [chatId, ready, enabled, user, scrollToBottom]);

  const sendText = async () => {
    const body = text.trim();
    if (!body || !user || messages === null) return;
    const temp: Display = {
      id: `tmp-${Date.now()}`,
      chatId,
      senderId: user.id,
      kind: "text",
      text: body,
      pin: null,
      createdAt: Date.now(),
      pending: true,
    };
    setMessages((prev) => [...(prev ?? []), temp]);
    setText("");
    nearBottomRef.current = true;
    requestAnimationFrame(scrollToBottom);
    try {
      const saved = await apiSendChatMessage(chatId, { kind: "text", text: body });
      lastTsRef.current = Math.max(lastTsRef.current, saved.createdAt);
      setMessages((prev) =>
        (prev ?? []).map((m) => (m.id === temp.id ? saved : m)),
      );
    } catch {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== temp.id));
      setText(body);
      show("Сообщение не отправилось — попробуйте ещё раз.");
    }
  };

  const sendPin = async (pin: Pin) => {
    if (!user || messages === null) return;
    const temp: Display = {
      id: `tmp-${Date.now()}`,
      chatId,
      senderId: user.id,
      kind: "pin",
      text: null,
      pin: { id: pin.id, card: pin },
      createdAt: Date.now(),
      pending: true,
    };
    setMessages((prev) => [...(prev ?? []), temp]);
    nearBottomRef.current = true;
    requestAnimationFrame(scrollToBottom);
    try {
      const saved = await apiSendChatMessage(chatId, {
        kind: "pin",
        pinId: pin.id,
        pinData: pin,
      });
      lastTsRef.current = Math.max(lastTsRef.current, saved.createdAt);
      setMessages((prev) =>
        (prev ?? []).map((m) => (m.id === temp.id ? saved : m)),
      );
    } catch {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== temp.id));
      show("Пин не отправился — попробуйте ещё раз.");
    }
  };

  const loadOlder = async () => {
    if (messages === null || messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const older = await apiChatMessages(chatId, {
        before: messages[0].createdAt,
        limit: PAGE,
      });
      setMessages((prev) => mergeMessages(older, prev ?? []));
      setHasMore(older.length === PAGE);
    } catch {
      show("Не удалось загрузить историю.");
    } finally {
      setLoadingMore(false);
    }
  };

  return {
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
  };
}
