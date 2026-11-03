# Стирание данных: единственное место, где каскад удаляет строки нескольких
# доменов.
#
# Таблицы связаны строковыми pin_id без FK (пины бывают внешние), поэтому
# «удалить пин» и «удалить аккаунт» нельзя положить на один DELETE: нужны
# проходы по доскам, лайкам, комментариям и уведомлениям. Каждый домен удаляет
# свои строки сам — здесь только порядок вызовов, иначе ссылка в запросе
# упирается в уже каскадно удалённые пины.

import sqlite3

from . import accounts, boards, chats, likes, media, notifications, pins, slides, social, uploads
from .db import connection


def erase_pin(pin: sqlite3.Row) -> None:
    """Удалить пин, всё, что на него ссылается, файлы носителей и вектор."""
    pin_id = pin["id"]
    with connection() as conn:
        # имена слайдов собираем ДО удаления: каскад по pin_slides унесёт
        # строки, и стирать будет уже нечего
        slide_names = slides.filenames_of(conn, pin_id)
        boards.remove_pin_rows(conn, pin_id)
        likes.remove_pin_rows(conn, pin_id)
        social.remove_pin_rows(conn, pin_id)
        # уведомления о лайках/сохранениях/комментариях мёртвого пина не нужны
        notifications.remove_pin_rows(conn, pin_id)
        pins.remove_row(conn, pin_id)
    # файлы и эмбеддинги — вне транзакции: их не за что откатывать
    pins.forget_files([pin])
    for name in slide_names:
        uploads.discard(name)
    pins.forget_vectors([pin_id])


def erase_account(user: sqlite3.Row) -> None:
    """152-ФЗ: удаление аккаунта и персональных данных.

    Журнал согласий остаётся, но обезличенным: доказательство «человек соглашался
    на версию X» нужнее, чем его адрес, а после удаления аккаунта открытый email
    в таблице — это ПД, которые мы больше не имеем права хранить."""
    user_id = user["id"]
    with connection() as conn:
        # собираем артефакты заранее: каскад по users(id) их унесёт
        rows = pins.pins_of_user(conn, user_id)
        filenames = media.file_names_of_user(conn, user_id)
        slide_names = slides.filenames_of_user(conn, user_id)
        # Доски, пины, лайки, подписки, комментарии, уведомления и участия в
        # чатах уйдут по cascade. Остальное — строковые ссылки без FK, чистим
        # руками: свои лайки под чужими пинами, чужие лайки и комментарии под
        # своими пинами, свои комментарии, вложения своих пинов в чужих досках.
        boards.remove_rows_of_user_pins(conn, user_id)
        likes.remove_user_rows(conn, user_id)
        likes.remove_rows_of_user_pins(conn, user_id)
        social.remove_user_rows(conn, user_id)
        social.remove_rows_of_user_pins(conn, user_id)
        accounts.delete_avatar(user)
        accounts.pseudonymise_consent(conn, user_id, user["email"])
        accounts.remove_user(conn, user_id)
        # Чат, оставшийся без участников (собеседник тоже удалился),
        # каскадом не закрывается: у него нет внешнего ключа на users.
        chats.remove_empty_chats(conn)
    pins.forget_files(rows)
    pins.forget_vectors([row["id"] for row in rows])
    for name in filenames:
        uploads.discard(name)
    # видео и постеры пинов: строки ушли каскадом, файлы — только руками
    for name in slide_names:
        uploads.discard(name)
