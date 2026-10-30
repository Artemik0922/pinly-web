// Инлайновые SVG-иконки интерфейса (без внешних зависимостей).

type IconProps = { size?: number; className?: string };

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export function IconSearch({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconHeart({
  size = 16,
  className,
  filled = false,
}: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(size, className)} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.4 5.2 5.2 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9Z" />
    </svg>
  );
}

export function IconPin({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 8h3l-5 6-5-6h3L9 3Z" />
    </svg>
  );
}

export function IconImage({ size = 28, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 17 5-5 4 4 2.5-2.5L20 17" />
    </svg>
  );
}

export function IconFolder({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

export function IconCompass({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  );
}

export function IconInbox({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 13h5l1.5 2.5h5L16 13h5" />
      <path d="M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2-8Z" />
    </svg>
  );
}

export function IconQuestion({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5A2.5 2.5 0 1 1 12 12.5v1.2" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function IconArrowLeft({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </svg>
  );
}

export function IconChevronDown({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconCheck({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size, className)} strokeWidth={3}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function IconPlus({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)} strokeWidth={2.5}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconDownload({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function IconShare({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 15V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M6 11v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8" />
    </svg>
  );
}

export function IconPencil({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 20h4L20 8a2.4 2.4 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function IconTrash({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconComment({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

export function IconUserPlus({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-3.9 3.1-7 7-7 1.6 0 3 .5 4.2 1.4" />
      <path d="M19 14v6M16 17h6" />
    </svg>
  );
}

export function IconUserCheck({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-3.9 3.1-7 7-7 1.6 0 3 .5 4.2 1.4" />
      <path d="m15.5 17.5 2 2 4-4.5" />
    </svg>
  );
}

export function IconLock({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconBell({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconEye({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M9.9 4.24A9 9 0 0 1 12 4c6.4 0 10 8 10 8a18.3 18.3 0 0 1-2.2 3.24M6.6 6.6A17.7 17.7 0 0 0 2 12s3.6 8 10 8a9 9 0 0 0 5.4-1.6M2 2l20 20" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

// Летучая мышь — иконка "bat" Delapouite из набора game-icons (CC BY 3.0),
// https://game-icons.net/1x1/delapouite/bat.html. Заливка вместо обводки:
// силуэт с расправленными крыльями обводкой не читается.
export function IconBat({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M196.14 78.192c-11.98 26.54-14.398 45.97-11.355 59.664 3.357 15.106 12.85 24.708 27.24 31.903l11.168 5.583-8.83 8.828c-.94.942-2.235 4.514-1.224 10.9 1.01 6.39 4.1 14.61 8.626 22.335 5.75 9.82 13.835 18.326 21.62 23.235L256 221.77l12.52 18.926c7.814-4.9 15.94-13.433 21.714-23.29 4.526-7.727 7.617-15.947 8.627-22.335 1.012-6.386-.282-9.958-1.223-10.9l-8.83-8.827 11.168-5.584c14.39-7.196 23.883-16.798 27.24-31.904 3.043-13.694.626-33.125-11.354-59.664-25.09 13.792-37.177 28.03-51.32 70.46L256 174.27l-8.54-25.617c-14.143-42.43-26.23-56.67-51.32-70.46zM96 97.808c-3.376 19.912-5.288 41.53 10.314 58.623C53.46 233.354 16 377.273 16 433.81c5.024-10.05 13.206-23.25 23.055-35.647 1.14-66.82 33.374-161.227 81.228-240.983l4.63-7.717 7.718 4.63c20.08 12.047 41.164 20.96 62.73 26.745-7.74-5.074-14.54-11.42-19.673-19.15-17.93-7.796-34.227-18.417-47.687-31.877-18.968-1.448-25.344-16.872-32-32zm320 0c-6.656 15.128-13.032 30.552-32 32-13.46 13.46-29.756 24.08-47.688 31.877-5.133 7.73-11.93 14.076-19.673 19.15 21.566-5.785 42.65-14.698 62.73-26.744l7.718-4.63 4.63 7.717c47.853 79.756 80.088 174.163 81.227 240.984 9.85 12.397 18.03 25.6 23.055 35.648 0-56.536-37.46-200.455-90.314-277.377 15.602-17.093 13.69-38.71 10.314-58.622zm-192 80c11.588 8.65 18.698 11.698 32 16 13.302-4.302 20.412-7.35 32-16 2.458 4.566 0 16 0 16-11.948 5.447-21.853 2.208-32 0-10.147 2.208-20.052 5.447-32 0 0 0-2.458-11.434 0-16zm-71.854 6.525c1.817 4.383 3.522 9.017 5.143 13.88 5.98 17.942 10.558 38.886 13.62 60.32 5.243 36.7 6.394 74.3.945 101.388 8.74-.234 17.477 2.767 26.21 8.274L166.41 392.56l20.268-4.795-8.55 33.595L208 403.77l1.057 20.8 13.615-34.794c.632.695 1.264 1.432 1.896 2.145-4.088-5.556-7.65-12.068-10.78-19.37-9.34-21.792-14.788-50.772-14.788-82.742 0-22.842 2.793-44.14 7.787-62.397-.18-.302-.375-.603-.553-.907-5.21-8.898-9-18.256-10.636-27.26a258.31 258.31 0 0 1-43.452-14.91zm207.708 0a258.34 258.34 0 0 1-43.452 14.91c-1.637 9.004-5.425 18.362-10.636 27.26-.178.304-.372.605-.553.908C310.207 245.67 313 266.967 313 289.81c0 31.97-5.448 60.95-14.787 82.742-2.734 6.378-5.807 12.136-9.262 17.2.085-.095.17-.198.253-.292l13.74 35.11L304 403.772l29.87 17.59-8.548-33.595 20.268 4.795-32.195-24.782c8.94-5.75 17.842-8.698 26.73-7.957-5.425-27.08-4.27-64.633.965-101.286 3.062-21.435 7.64-42.38 13.62-60.322 1.622-4.862 3.327-9.496 5.144-13.88zm-227.268.64c-12.714 64.79-23.21 127.977-15.46 180.256 12.15-9.62 24.292-10.477 36.362-5.83 4.968-22.784 4.842-61.64-.398-98.32-2.938-20.563-7.36-40.62-12.88-57.177-2.344-7.035-4.942-13.425-7.624-18.93zm246.828 0c-2.682 5.505-5.28 11.895-7.625 18.93-5.52 16.557-9.942 36.614-12.88 57.178-5.19 36.34-5.364 74.816-.537 97.683 12.897-3.96 24.765-2.81 36.5 6.468 7.75-52.28-2.745-115.467-15.46-180.256zm-271.6 33.74c-26.35 55.316-44.32 113.17-49.365 158.712 13.07-11.5 27.16-18.727 39.995-15.59-5.553-44.21.388-93.13 9.368-143.123zm296.374 0c8.98 49.993 14.92 98.912 9.367 143.122 12.835-3.137 26.925 4.09 39.996 15.59-5.044-45.542-23.014-103.396-49.363-158.713zm-183.22 27.466c-2.517 13.256-3.968 28.045-3.968 43.628 0 6.126.233 12.123.656 17.963 1.642 22.645 6.29 42.786 12.676 57.688 4.017 9.372 8.73 16.627 13.307 21.143 4.575 4.517 8.57 6.208 12.36 6.208 3.79 0 7.785-1.69 12.36-6.207 4.577-4.515 9.29-11.77 13.308-21.142 6.386-14.902 11.034-35.043 12.676-57.687.423-5.84.656-11.836.656-17.962 0-15.583-1.45-30.372-3.97-43.63-9.624 9.87-21.444 16.92-35.03 16.92-13.586 0-25.406-7.05-35.03-16.92zm9.805 153.007c8.413 10.265 16.82 22.012 25.227 34.62 8.136-12.204 16.2-23.596 24.207-33.636-6.772 6.394-15.1 10.638-24.207 10.638-9.465 0-18.096-4.578-25.006-11.397-.074-.072-.147-.15-.22-.223z" />
    </svg>
  );
}

