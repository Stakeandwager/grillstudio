/* Shared inline SVG icons — no emoji, consistent stroke language */

export const Icon = {
  flame: (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        d="M12 2c1 4-4 5.5-4 10a4.5 4.5 0 0 0 9 0c0-2-1-3.4-1.8-4.6-.5 1.2-1.2 1.8-2.2 2.1.9-2.6.4-5.3-1-7.5z"
        fill="url(#emberGrad)"
      />
      <defs>
        <linearGradient id="emberGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB03A" />
          <stop offset="1" stopColor="#F03800" />
        </linearGradient>
      </defs>
    </svg>
  ),
  trim: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="6" cy="6" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="18" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.1 7.6 20 17M8.1 16.4 20 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  text: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 5h16v3h-2V7h-4.9v10H15v2H9v-2h1.9V7H6v1H4V5z" fill="currentColor" />
    </svg>
  ),
  captions: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 12h6M6.5 15.2h11M14.5 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  music: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M9 18.5A2.5 2.5 0 1 1 6.5 16c.54 0 1.04.17 1.5.44V6l11-2v11.5A2.5 2.5 0 1 1 16.5 13c.54 0 1.04.17 1.5.44V7.4l-7 1.27v9.83z" fill="currentColor" />
    </svg>
  ),
  polish: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4L12 3z" fill="currentColor" />
      <path d="M18.5 14l.9 2.3 2.1.7-2.1.7-.9 2.3-.9-2.3-2.1-.7 2.1-.7.9-2.3z" fill="currentColor" opacity="0.7" />
    </svg>
  ),
  export: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 3l4.5 4.5-1.4 1.4L13 6.8V15h-2V6.8L8.9 8.9 7.5 7.5 12 3zM5 13h2v5h10v-5h2v7H5v-7z" fill="currentColor" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
    </svg>
  ),
  remove: (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M7 6V4h10v2h4v2h-2v13H5V8H3V6h4zm2 2v11h6V8H9zm1.5 2h1.6v7h-1.6v-7z" fill="currentColor" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2L12 2z" fill="currentColor" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 20V4h2v14h14v2H4zm4-4v-6h2.4v6H8zm4.6 0V7h2.4v9h-2.4zm4.6 0v-4h2.4v4h-2.4z" fill="currentColor" />
    </svg>
  ),
};
