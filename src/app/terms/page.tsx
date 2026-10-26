import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Пользовательское соглашение — Pinly",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-extrabold">Пользовательское соглашение</h1>
      <p className="mt-2 text-sm text-gray-400">Версия 1.0</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="text-lg font-bold">1. Предмет</h2>
          <p className="mt-2">
            Сервис Pinly предоставляет возможность находить, просматривать и
            сохранять изображения с открытых источников (лицензии Creative
            Commons), а также организовывать личные коллекции — доски.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">2. Аккаунт</h2>
          <p className="mt-2">
            Регистрация требует дееспособности и согласия с настоящим
            соглашением. Вы отвечаете за сохранность пароля и действия,
            совершённые под вашей учётной записью.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">3. Правила использования</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>запрещено публиковать незаконный контент и нарушать авторские права;</li>
            <li>атрибуция авторов сохраняемых изображений сохраняется автоматически;</li>
            <li>администрация может ограничить доступ за нарушение правил.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">4. Контент источников</h2>
          <p className="mt-2">
            Изображения предоставляются сторонними открытыми источниками «как
            есть». Сервис не претендует на их авторство и не гарантирует их
            доступность.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">5. Изменения</h2>
          <p className="mt-2">
            Оператор может изменять соглашение, публикуя новую версию на этой
            странице. Продолжая пользоваться Сервисом, вы принимаете изменения.
          </p>
        </section>
      </div>
    </article>
  );
}
