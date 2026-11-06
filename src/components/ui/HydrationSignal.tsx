"use client";

// Сигнал «страница жива» для e2e-смоука. Сервер рисует кнопки до гидрации, и
// клик в это время — тихий no-op; тест должен ждать слушателей, а не угадывать.
// Ставится в последнем по порядку клиентском узле корня, поэтому эффект
// срабатывает уже после всех, что выше. Внутренний флаг Next
// (`window.__NEXT_HYDRATED`) не подходит: он появляется только в сборке с
// `__NEXT_TEST_MODE`, которого у нас нет и который менял бы поведение сайта
// под тестами.

import { useEffect } from "react";

declare global {
  interface Window {
    __PINLY_HYDRATED?: boolean;
  }
}

export function HydrationSignal() {
  useEffect(() => {
    window.__PINLY_HYDRATED = true;
  }, []);

  return null;
}
