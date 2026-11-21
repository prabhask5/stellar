import type { ReactNode, SVGProps } from "react";

/**
 * One line-icon set: 24px grid, 1.8 stroke, round caps and joins, currentColor.
 * Emoji are never used as interface icons; they only identify user lists and routines.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  strokeWidth?: number;
}

function make(name: string, paths: ReactNode) {
  function Icon({ size = 24, strokeWidth = 1.8, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = `${name}Icon`;
  return Icon;
}

// Navigation
export const UniverseIcon = make(
  "Universe",
  <>
    <path d="M11 3.5c.5 4.2 2.3 6 6.5 6.5-4.2.5-6 2.3-6.5 6.5-.5-4.2-2.3-6-6.5-6.5 4.2-.5 6-2.3 6.5-6.5Z" />
    <path d="M18.5 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z" />
  </>,
);
export const TasksIcon = make(
  "Tasks",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.3 2.4 2.4 4.6-5" />
  </>,
);
export const GoalsIcon = make(
  "Goals",
  <>
    <path d="M6 21V4" />
    <path d="M6 4.5h11.5l-2.3 3.75 2.3 3.75H6" />
  </>,
);
export const RoutinesIcon = make(
  "Routines",
  <>
    <circle cx="12" cy="12" r="3.6" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-20 12 12)" />
  </>,
);
export const FocusIcon = make(
  "Focus",
  <>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 1.5" />
    <path d="M9.5 2.75h5" />
  </>,
);
export const GearIcon = make(
  "Gear",
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.05.05a2 2 0 1 1-2.8 2.8l-.05-.05a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V19.5a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.5 1.6 1.6 0 0 0-1.8.3l-.05.05a2 2 0 1 1-2.8-2.8l.05-.05a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1.05 1.6 1.6 0 0 0-.3-1.8l-.05-.05a2 2 0 1 1 2.8-2.8l.05.05a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.05-.05a2 2 0 1 1 2.8 2.8l-.05.05a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </>,
);

// Actions
export const PlusIcon = make("Plus", <path d="M12 5v14M5 12h14" />);
export const MinusIcon = make("Minus", <path d="M5 12h14" />);
export const CheckIcon = make("Check", <path d="m5 12.5 4.5 4.5L19 7" />);
export const XIcon = make("X", <path d="M6 6l12 12M18 6 6 18" />);
export const ChevronLeftIcon = make("ChevronLeft", <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />);
export const ChevronRightIcon = make("ChevronRight", <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />);
export const ChevronDownIcon = make("ChevronDown", <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />);
export const ArrowRightIcon = make("ArrowRight", <path d="M5 12h14M13 6l6 6-6 6" />);
export const SearchIcon = make(
  "Search",
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </>,
);
export const TrashIcon = make(
  "Trash",
  <>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V4.75h5V7" />
    <path d="M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12" />
    <path d="M10 11v5.5M14 11v5.5" />
  </>,
);
export const EditIcon = make(
  "Edit",
  <>
    <path d="M4.5 19.5h4l10.2-10.2a2 2 0 0 0-2.8-2.8L5.7 16.7l-1.2 2.8Z" />
    <path d="m14.5 8 2.5 2.5" />
  </>,
);
export const CopyIcon = make(
  "Copy",
  <>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </>,
);
export const UndoIcon = make(
  "Undo",
  <>
    <path d="M8 5 4 9l4 4" />
    <path d="M4 9h10a5.5 5.5 0 0 1 0 11h-3" />
  </>,
);
export const DragIcon = make(
  "Drag",
  <>
    <circle cx="9" cy="6.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="17.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="17.5" r="1" fill="currentColor" stroke="none" />
  </>,
);
export const DotsIcon = make(
  "Dots",
  <>
    <circle cx="5.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </>,
);
export const BackspaceIcon = make(
  "Backspace",
  <>
    <path d="M9 5.5h9.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9L3 12l6-6.5Z" />
    <path d="m11.5 9.5 5 5M16.5 9.5l-5 5" />
  </>,
);

// Objects
export const CalendarIcon = make(
  "Calendar",
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </>,
);
export const ClockIcon = make(
  "Clock",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
);
export const TextIcon = make("Text", <path d="M5 7h14M5 12h14M5 17h8" />);
export const GridIcon = make(
  "Grid",
  <>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
  </>,
);
export const LockIcon = make(
  "Lock",
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="3" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </>,
);
export const DevicesIcon = make(
  "Devices",
  <>
    <rect x="3" y="5" width="13" height="10" rx="2" />
    <path d="M6.5 19h6M9.5 15v4" />
    <rect x="15.5" y="9.5" width="5.5" height="10" rx="1.5" />
  </>,
);
export const BellIcon = make(
  "Bell",
  <>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 5 2 6.5 2 6.5h-15s2-1.5 2-6.5Z" />
    <path d="M10 19.5a2.1 2.1 0 0 0 4 0" />
  </>,
);
export const DownloadIcon = make(
  "Download",
  <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
);
export const UploadIcon = make("Upload", <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14" />);
export const LinkIcon = make(
  "Link",
  <>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </>,
);
export const InfoIcon = make(
  "Info",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
  </>,
);
export const WarningIcon = make(
  "Warning",
  <>
    <path d="M12 4.5 3.5 19h17L12 4.5Z" />
    <path d="M12 10.5v4" />
    <circle cx="12" cy="16.8" r="0.6" fill="currentColor" />
  </>,
);
export const EyeIcon = make(
  "Eye",
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </>,
);
export const QuoteIcon = make(
  "Quote",
  <path d="M9.5 7C7 8 5.5 10 5.5 13v4h5v-5h-3c0-1.5.8-2.7 2-3.3M18.5 7c-2.5 1-4 3-4 6v4h5v-5h-3c0-1.5.8-2.7 2-3.3" />,
);
export const DatabaseIcon = make(
  "Database",
  <>
    <ellipse cx="12" cy="6.5" rx="7.5" ry="3" />
    <path d="M4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11" />
    <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
  </>,
);
export const PuzzleIcon = make(
  "Puzzle",
  <path d="M9.5 4.5h3a1 1 0 0 1 1 1v1.2a1.8 1.8 0 1 0 3 0V5.5a1 1 0 0 1 1-1H19.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-4.5h1.2a1.8 1.8 0 1 0 0-3H4.5V5.5a1 1 0 0 1 1-1h4Z" />,
);
export const PaletteIcon = make(
  "Palette",
  <>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2.2-.5-1.5.4-2.8 2-2.8h1.9a3 3 0 0 0 3-3c0-5-3.8-9-8.5-9Z" />
    <circle cx="8" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="16" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
  </>,
);
export const ShieldIcon = make(
  "Shield",
  <>
    <path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.7 7 9 4.1-1.3 7-4.7 7-9V6l-7-2.5Z" />
    <path d="m9 12 2.2 2.2L15 10.3" />
  </>,
);
export const SlidersIcon = make(
  "Sliders",
  <>
    <path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9" />
    <circle cx="15" cy="7.5" r="2" />
    <circle cx="9" cy="16.5" r="2" />
  </>,
);

// Timer controls (solid shapes read better at small sizes)
export const PlayIcon = make("Play", <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />);
export const PauseIcon = make(
  "Pause",
  <>
    <rect x="7" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.6" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor" stroke="none" />
  </>,
);
export const StopIcon = make(
  "Stop",
  <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />,
);
export const SkipIcon = make(
  "Skip",
  <>
    <path d="M6.5 6v12l8.5-6-8.5-6Z" fill="currentColor" />
    <path d="M17.5 6v12" />
  </>,
);
export const FullscreenIcon = make(
  "Fullscreen",
  <path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" />,
);
export const ExitFullscreenIcon = make(
  "ExitFullscreen",
  <path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5" />,
);
export const SparkleIcon = make(
  "Sparkle",
  <path d="M12 3.5c.6 5 2.9 7.3 8 8-5.1.7-7.4 3-8 8-.6-5-2.9-7.3-8-8 5.1-.7 7.4-3 8-8Z" />,
);
export const WifiOffIcon = make(
  "WifiOff",
  <>
    <path d="M4 4l16 16" />
    <path d="M8.5 12.5a6 6 0 0 1 2-1.3M5.5 9.5a10.5 10.5 0 0 1 3-2M12 6.5c2.6 0 5 .9 6.5 3M15.5 12.5a6 6 0 0 0-1-.8" />
    <circle cx="12" cy="17.5" r="0.9" fill="currentColor" />
  </>,
);
