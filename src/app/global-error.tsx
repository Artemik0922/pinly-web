"use client";

// Падение самого root layout: обычный error.tsx его не накрывает,
// поэтому нужен свой документ с кнопкой перезагрузки.

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20 }}>Pinly не смог отрисовать страницу</h1>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: 16,
            padding: "10px 20px",
            borderRadius: 999,
            border: 0,
            background: "#2fbf9b",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Перезагрузить
        </button>
      </body>
    </html>
  );
}
