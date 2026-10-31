// Личные сообщения: чаты один на один, текст и пины-карточки (backend/chats.py).
// Обновление — опросом на клиенте: открытый чат спрашивает ?after=,
// шапка — счётчик раз в минуту.

import type { Pin } from "@/lib/pin";
import { queryString, requestJson } from "@/lib/api/http";

export type ChatParty = { id: string; displayName: string; avatarUrl: string | null };

export type LastMessage = {
  kind: "text" | "pin";
  text: string | null;
  senderId: string;
  createdAt: number;
  pinTitle: string | null;
};

export type ApiChat = {
  id: string;
  member: ChatParty;
  lastMessage: LastMessage | null;
  unread: number;
  updatedAt: number;
};

export type ApiChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  kind: "text" | "pin";
  text: string | null;
  pin: { id: string; card: Pin | null } | null;
  createdAt: number;
};

export async function apiChats(signal?: AbortSignal): Promise<ApiChat[]> {
  const data = await requestJson<{ items: ApiChat[] }>("/api/chats", { signal });
  return data.items;
}

export async function apiStartChat(userId: string): Promise<ApiChat> {
  const data = await requestJson<{ chat: ApiChat }>("/api/chats", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  return data.chat;
}

export async function apiChat(chatId: string, signal?: AbortSignal): Promise<ApiChat> {
  const data = await requestJson<{ chat: ApiChat }>(`/api/chats/${chatId}`, { signal });
  return data.chat;
}

export async function apiChatMessages(
  chatId: string,
  params: { after?: number; before?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ApiChatMessage[]> {
  const query = queryString({
    after: params.after,
    before: params.before,
    limit: params.limit,
  });
  const data = await requestJson<{ messages: ApiChatMessage[] }>(
    `/api/chats/${chatId}/messages${query}`,
    { signal },
  );
  return data.messages;
}

export type NewChatMessage =
  | { kind: "text"; text: string }
  | { kind: "pin"; pinId: string; pinData: Pin; text?: string };

export async function apiSendChatMessage(
  chatId: string,
  body: NewChatMessage,
): Promise<ApiChatMessage> {
  const data = await requestJson<{ message: ApiChatMessage }>(`/api/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.message;
}

export async function apiChatRead(chatId: string): Promise<void> {
  await requestJson(`/api/chats/${chatId}/read`, { method: "POST" });
}

export async function apiChatsUnread(signal?: AbortSignal): Promise<number> {
  const data = await requestJson<{ unread: number }>("/api/chats/unread", { signal });
  return data.unread;
}
