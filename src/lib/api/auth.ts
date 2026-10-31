// Аккаунт и сессия (backend/accounts.py).

import { isStatus, requestJson, requestMultipart } from "@/lib/api/http";

export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  createdAt: number;
};

export type MeResult =
  | { status: "ok"; user: AccountUser } // сервер жив, сессия есть
  | { status: "anon" } // сервер жив, сессии нет
  | { status: "down" }; // бэкенд не запущен

export async function apiMe(): Promise<MeResult> {
  try {
    const data = await requestJson<{ user: AccountUser }>("/api/auth/me");
    return { status: "ok", user: data.user };
  } catch (err) {
    if (isStatus(err, 401)) return { status: "anon" };
    return { status: "down" };
  }
}

export async function apiRegister(body: {
  email: string;
  password: string;
  displayName: string;
  consent: boolean;
}): Promise<AccountUser> {
  // ключи совпадают с pydantic-моделью бэкенда (snake_case)
  const data = await requestJson<{ user: AccountUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: body.email,
      password: body.password,
      display_name: body.displayName,
      consent: body.consent,
    }),
  });
  return data.user;
}

export async function apiLogin(email: string, password: string): Promise<AccountUser> {
  const data = await requestJson<{ user: AccountUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function apiLogout(): Promise<void> {
  await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
}

export async function apiUpdateDisplayName(displayName: string): Promise<void> {
  await requestJson("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ display_name: displayName }),
  });
}

export async function apiUploadAvatar(file: File): Promise<void> {
  const form = new FormData();
  form.set("file", file);
  await requestMultipart<undefined>("/api/auth/avatar", form);
}

export async function apiDeleteAccount(): Promise<void> {
  await requestJson("/api/auth/account", { method: "DELETE" });
}
