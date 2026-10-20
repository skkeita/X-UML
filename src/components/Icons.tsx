import type { ReactNode } from 'react';

// Icônes minimalistes (trait 1.75) : zéro dépendance, héritent de currentColor.
const Svg = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const SunIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
export const MoonIcon = () => (
  <Svg>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Svg>
);
export const DownloadIcon = () => (
  <Svg>
    <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
  </Svg>
);
export const UploadIcon = () => (
  <Svg>
    <path d="M12 15V3M7 8l5-5 5 5M4 20h16" />
  </Svg>
);
export const PdfIcon = () => (
  <Svg>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
);
export const ImageIcon = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </Svg>
);
export const PanelIcon = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Svg>
);
export const UndoIcon = () => (
  <Svg>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);
export const RedoIcon = () => (
  <Svg>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Svg>
);
export const FitIcon = () => (
  <Svg>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);
export const CodeIcon = () => (
  <Svg>
    <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
  </Svg>
);
export const PaletteIcon = () => (
  <Svg>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1.1.2-2.2 1.4-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="10.5" cy="7.5" r="1" />
    <circle cx="15" cy="7.5" r="1" />
  </Svg>
);

/* Icônes des menus contextuels (14 px) : remplacent les émojis, rendu identique sur tous les systèmes. */
type IconProps = { size?: number };
export const FolderIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);
export const SystemIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18" />
  </Svg>
);
export const FrameIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 9h7l2-2V3" />
  </Svg>
);
export const PencilIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
);
export const UngroupIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
    <path d="M15 3h6v6M3 15v6h6" strokeDasharray="2 2.5" />
  </Svg>
);
export const CopyIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <rect x="8" y="8" width="13" height="13" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </Svg>
);
export const TrashIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
export const CloseIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const SwapIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M4 8h14l-4-4M20 16H6l4 4" />
  </Svg>
);
export const PaletteSmallIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1.1.2-2.2 1.4-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="10.5" cy="7.5" r="1" />
    <circle cx="15" cy="7.5" r="1" />
  </Svg>
);
