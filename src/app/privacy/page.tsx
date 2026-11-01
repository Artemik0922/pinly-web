import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Pinly",
};

// Контакт оператора обязателен по 152-ФЗ и нужен не для формы: по нему
// человек отзывает согласие и просит восстановить доступ (сброса пароля нет).
const OPERATOR_EMAIL = process.env.PINLY_OPERATOR_EMAIL || "pinly@test.local";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-shell-text px-4 py-12">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Политика конфиденциальности</h1>
      <p className="mt-2 text-sm text-muted">Версия 1.0 · действует с момента публикации</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="text-lg font-bold">1. Кто обрабатывает данные</h2>
          <p className="mt-2">
            Оператор персональных данных — администрация сервиса Pinly (далее — «Сервис»). Обработка
            осуществляется на серверном оборудовании, размещённом на территории Российской
            Федерации, в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных
            данных».
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">2. Какие данные мы собираем</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>email — только для входа: писем Сервис не рассылает;</li>
            <li>имя (отображаемое) — для подписи ваших досок и пинов;</li>
            <li>содержимое досок (сохранённые пины) — по вашему действию;</li>
            <li>технические данные (IP, user-agent) — только в журнале согласия.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">3. Зачем и на каком основании</h2>
          <p className="mt-2">
            Данные обрабатываются на основании вашего согласия (ст. 6 ч. 1 п. 1 152-ФЗ), выражаемого
            при регистрации, — для предоставления доступа к Сервису: создание аккаунта, хранение
            досок и сохранённых пинов, отправка ссылки на доску тем, кому вы её показываете.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">4. Срок и хранение</h2>
          <p className="mt-2">
            Данные хранятся до удаления вами аккаунта или до отзыва согласия. После удаления учётной
            записи профиль, доски и сохранённые пины удаляются безвозвратно.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">5. Ваши права</h2>
          <p className="mt-2">
            Вы вправе запросить сведения об обработке, уточнение или удаление своих данных, а также
            отозвать согласие, удалив аккаунт. Для этого используйте настройки профиля или напишите
            оператору.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">6. Cookies</h2>
          <p className="mt-2">
            Сервис использует только технические cookies (сессия входа), необходимые для работы.
            Аналитические и рекламные cookies не используются.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">7. Третьи лица</h2>
          <p className="mt-2">
            Данные не передаются третьим лицам, за исключением случаев, предусмотренных
            законодательством РФ. Вход только по email и паролю: ни через Яндекс ID, ни через
            VK ID мы ничего не получаем, потому что такого входа в Сервисе нет.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">8. Контакт оператора</h2>
          <p className="mt-2">
            По вопросам обработки данных, отзыву согласия и восстановлению доступа (сброса пароля
            в Сервисе нет — разбираемся вручную) напишите на{" "}
            <a href={`mailto:${OPERATOR_EMAIL}`} className="font-semibold text-accent-strong underline-offset-4 hover:underline">
              {OPERATOR_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
