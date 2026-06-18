const paths = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  reports: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
      <path d="M10 12h6" />
      <path d="M10 16h5" />
    </>
  ),
  summary: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <rect x="7" y="11" width="3" height="5" rx="1" />
      <rect x="12" y="8" width="3" height="8" rx="1" />
      <rect x="17" y="5" width="3" height="11" rx="1" />
    </>
  ),
  reconciliation: (
    <>
      <path d="M7 7h11" />
      <path d="M7 12h11" />
      <path d="M7 17h7" />
      <path d="M4 7h.01" />
      <path d="M4 12h.01" />
      <path d="M4 17h.01" />
    </>
  ),
  product: (
    <>
      <path d="M4 7h16" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.34-5.66" />
      <path d="M4 4v5h5" />
      <path d="M12 8v5l3 2" />
    </>
  ),
  alerts: (
    <>
      <path d="M12 4a6 6 0 0 0-6 6v3l-2 3h16l-2-3v-3a6 6 0 0 0-6-6z" />
      <path d="M10 20h4" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l3-4 3 2 4-6" />
    </>
  ),
  stations: (
    <>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 10v9h14v-9" />
      <path d="M9 19v-5h6v5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 11a3 3 0 0 1 0 6" />
      <path d="M18 8a2.5 2.5 0 0 1 0 5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05-2.1 2.1-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.66V20h-5v-.1A1.8 1.8 0 0 0 8.45 18.24a1.8 1.8 0 0 0-2 .36l-.05.05-2.1-2.1.05-.05a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 3.05 13H3v-3h.05a1.8 1.8 0 0 0 1.66-1.1 1.8 1.8 0 0 0-.36-2l-.05-.05 2.1-2.1.05.05a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 9.9 3.05V3h4v.05a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 2-.36l.05-.05 2.1 2.1-.05.05a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 20.4 10H21v3h-.6A1.8 1.8 0 0 0 19.4 15z" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5h16v11H8l-4 4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M8 12h10" />
    </>
  ),
  order: (
    <>
      <path d="M6 3h12l2 5H4z" />
      <path d="M5 8v12h14V8" />
      <path d="M9 13h6" />
    </>
  ),
}

const NavIcon = ({ name, className = '' }) => (
  <svg
    className={`h-4 w-4 ${className}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths[name] || paths.dashboard}
  </svg>
)

export default NavIcon
