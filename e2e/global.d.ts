// Флаг гидрации, который ставит наш же HydrationSignal. Типы Next его наружу
// не отдают — объявляем сами, ровно в объёме, который читаем.
declare global {
  interface Window {
    readonly __PINLY_HYDRATED?: boolean;
  }
}

export {};
