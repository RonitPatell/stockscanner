import React from "react";

/** TrustTicker emerald tile + T tick mark (mirrors src/components/Logo.tsx) */
export const Logo: React.FC<{ size?: number }> = ({ size = 120 }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="32" height="32" rx="8" fill="#10b981" />
    <path d="M9 9h14v3.5H17.5V23h-3V12.5H9V9z" fill="#022c22" fillOpacity="0.9" />
    <path
      d="M21 19.5l2.5 2.5L26 19.5"
      stroke="#ecfdf5"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
