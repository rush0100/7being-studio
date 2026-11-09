/** RUSH0100-style 01 mark — blue→teal ring. */
export function RushMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className="sb-rush-mark"
    >
      <defs>
        <linearGradient id="sbRing" x1="4" y1="36" x2="36" y2="4">
          <stop stopColor="#2864ef" />
          <stop offset="0.55" stopColor="#5b8dff" />
          <stop offset="1" stopColor="#22c9a8" />
        </linearGradient>
      </defs>
      <circle cx="15" cy="20" r="11" stroke="url(#sbRing)" strokeWidth="3.2" />
      <path
        d="M28 8v24"
        stroke="url(#sbRing)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="33.5" cy="12" r="1.6" fill="#22c9a8" />
      <circle cx="33.5" cy="20" r="1.6" fill="#5b8dff" />
      <circle cx="33.5" cy="28" r="1.6" fill="#2864ef" />
    </svg>
  );
}
