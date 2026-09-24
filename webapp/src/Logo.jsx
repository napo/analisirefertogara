import React from 'react'

export function VolleyScoresheetLogo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logo Referto Volley"
      role="img"
    >
      {/* Scoresheet / Spreadsheet base document */}
      <rect
        x="4"
        y="9"
        width="26"
        height="31"
        rx="3.5"
        fill="#FFFFFF"
        stroke="#011627"
        strokeWidth="2.2"
      />
      {/* Scoresheet table header bar */}
      <path
        d="M5 14H29"
        stroke="#011627"
        strokeWidth="1.8"
      />
      {/* Scoresheet table vertical column separator */}
      <path
        d="M13 14V39"
        stroke="rgba(1, 22, 39, 0.22)"
        strokeWidth="1.4"
      />
      <path
        d="M21 14V39"
        stroke="rgba(1, 22, 39, 0.22)"
        strokeWidth="1.4"
      />
      {/* Scoresheet table horizontal row lines */}
      <path
        d="M5 20H29"
        stroke="rgba(1, 22, 39, 0.18)"
        strokeWidth="1.2"
      />
      <path
        d="M5 26H29"
        stroke="rgba(1, 22, 39, 0.18)"
        strokeWidth="1.2"
      />
      <path
        d="M5 32H29"
        stroke="rgba(1, 22, 39, 0.18)"
        strokeWidth="1.2"
      />

      {/* Stylized Volleyball (overlapping top-right of scoresheet) */}
      <g transform="translate(28, 16)">
        {/* Ball shadow / drop glow */}
        <circle cx="0" cy="0" r="13" fill="#FFFFFF" />
        <circle
          cx="0"
          cy="0"
          r="12.5"
          fill="#FFB300"
          stroke="#011627"
          strokeWidth="2"
        />

        {/* Volleyball 3-panel curved seams */}
        {/* Panel 1 curve */}
        <path
          d="M -12.5 0 C -4 -1, 0 -4, 0 -12.5"
          fill="none"
          stroke="#011627"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Panel 2 curve */}
        <path
          d="M 0 -12.5 C 1 -4, 4 0, 12.5 0"
          fill="none"
          stroke="#011627"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Panel 3 curve */}
        <path
          d="M 0 12.5 C 0 4, -4 0, -12.5 0"
          fill="none"
          stroke="#011627"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Center triangle / tri-point seam */}
        <path
          d="M 0 0 C 4 1, 8 6, 8.8 8.8"
          fill="none"
          stroke="#011627"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M 0 0 C 1 4, 0 9, -0.5 12.5"
          fill="none"
          stroke="#011627"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M 0 0 C -4 -1, -9 -1.5, -12.5 -0.5"
          fill="none"
          stroke="#011627"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Volleyball inner accent panel in classic volleyball royal blue / navy */}
        <path
          d="M 0 -12.5 C 1 -4, 4 0, 12.5 0 A 12.5 12.5 0 0 0 0 -12.5 Z"
          fill="#011627"
          opacity="0.85"
        />
        <path
          d="M 0 0 C 4 1, 8 6, 8.8 8.8 A 12.5 12.5 0 0 0 12.5 0 C 4 0, 1 -4, 0 -12.5 C 1 -4, 4 1, 0 0 Z"
          fill="#FFFFFF"
          opacity="0.9"
        />
      </g>
    </svg>
  )
}
