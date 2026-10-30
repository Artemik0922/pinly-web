import Link from "next/link";
import { IconCompass } from "@/components/Icons";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="grid place-items-center text-muted">
        <IconCompass size={40} />
      </p>
      <h1 className="mt-4 text-2xl font-extrabold">Такой страницы нет</h1>
      <p className="mt-2 text-sm text-muted">
        Возможно, пин удалили, а ссылка осталась из закладок.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
      >
        В ленту
      </Link>
    </div>
  );
}
