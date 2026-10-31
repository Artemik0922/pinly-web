"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { IconArrowLeft } from "@/components/ui/Icons";
import type { ApiChat } from "@/lib/api/chats";

export function ChatHeader({ chat }: { chat: ApiChat | null }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Link
        href="/messages"
        aria-label="К списку чатов"
        className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface sm:h-9 sm:w-9"
      >
        <IconArrowLeft size={18} />
      </Link>
      {chat ? (
        <Link href={`/profile/${chat.member.id}`} className="flex min-w-0 items-center gap-3">
          <Avatar
            name={chat.member.displayName}
            url={chat.member.avatarUrl}
            size={36}
          />
          <span className="truncate text-sm font-bold">
            {chat.member.displayName}
          </span>
        </Link>
      ) : (
        <span className="h-9 w-40 rounded-full bg-surface" aria-hidden />
      )}
    </div>
  );
}
