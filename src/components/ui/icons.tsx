/**
 * Icon set.
 *
 * Hand-drawn 16px line icons rather than an icon package — keeps the bundle
 * small and the weight consistent with the typography. Deliberately plain:
 * no rings, hearts, elephants or paisley.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2.5 6.5L8 2l5.5 4.5V13a1 1 0 01-1 1h-9a1 1 0 01-1-1V6.5z" /><path d="M6.5 14V9.5h3V14" /></Icon>
);
export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}><rect x="2" y="3.5" width="12" height="10.5" rx="1.5" /><path d="M2 6.5h12M5.5 2v3M10.5 2v3" /></Icon>
);
export const CheckSquareIcon = (p: IconProps) => (
  <Icon {...p}><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M5.5 8l1.8 1.8L10.8 6" /></Icon>
);
export const UsersIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5c0-2.2 2-3.8 4.5-3.8s4.5 1.6 4.5 3.8" /><path d="M10.5 3.4a2.5 2.5 0 010 4.7M11.5 9.9c1.8.3 3 1.7 3 3.6" /></Icon>
);
export const BriefcaseIcon = (p: IconProps) => (
  <Icon {...p}><rect x="1.5" y="4.5" width="13" height="9" rx="1.5" /><path d="M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M1.5 8.5h13" /></Icon>
);
export const WalletIcon = (p: IconProps) => (
  <Icon {...p}><rect x="1.5" y="3.5" width="13" height="9.5" rx="2" /><path d="M1.5 6.5h13" /><circle cx="11.5" cy="9.8" r="0.9" fill="currentColor" stroke="none" /></Icon>
);
export const TimelineIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 2.5v11" /><circle cx="3" cy="5" r="1.5" /><circle cx="3" cy="11" r="1.5" /><path d="M6 5h7M6 11h4.5" /></Icon>
);
export const RouteIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="4" cy="3.5" r="1.8" /><circle cx="12" cy="12.5" r="1.8" /><path d="M4 5.3v3.2a2 2 0 002 2h4a2 2 0 002-2V7" /></Icon>
);
export const HangerIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 6.5V5.8a1.6 1.6 0 111.6-1.6" /><path d="M8 6.5L2 10.4c-.7.5-.4 1.6.5 1.6h11c.9 0 1.2-1.1.5-1.6L8 6.5z" /></Icon>
);
export const FileIcon = (p: IconProps) => (
  <Icon {...p}><path d="M9 1.5H4.5a1.5 1.5 0 00-1.5 1.5v10a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5V5.5L9 1.5z" /><path d="M9 1.5V5.5h4" /></Icon>
);
export const SparkIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 1.5l1.5 4L13.5 7l-4 1.5L8 12.5 6.5 8.5 2.5 7l4-1.5L8 1.5z" /><path d="M12.8 11.2l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5z" /></Icon>
);
export const ActivityIcon = (p: IconProps) => (
  <Icon {...p}><path d="M1.5 8h3l2-5 3 10 2-5h3" /></Icon>
);
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4" /></Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5l4 4" /></Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 3.5v9M3.5 8h9" /></Icon>
);
export const PencilIcon = (p: IconProps) => (
  <Icon {...p}><path d="M10.5 2.5l3 3L6 13l-3.5.5L3 10l7.5-7.5z" /><path d="M9 4l3 3" /></Icon>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 3.5L10.5 8 6 12.5" /></Icon>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3.5 6L8 10.5 12.5 6" /></Icon>
);
export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2.5 8h11M9.5 4l4 4-4 4" /></Icon>
);
export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 13V3M4 7l4-4 4 4" /></Icon>
);
export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 3v10M4 9l4 4 4-4" /></Icon>
);
export const AlertIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 2L1.5 13.5h13L8 2z" /><path d="M8 6.5v3M8 11.5v.01" /></Icon>
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 8.5l3.5 3.5L13 4.5" /></Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 4l8 8M12 4l-8 8" /></Icon>
);
export const LinkIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6.5 9.5a2.8 2.8 0 000 0l-1.6 1.6a2.5 2.5 0 01-3.5-3.5l2-2a2.5 2.5 0 013.5 0" /><path d="M9.5 6.5a2.8 2.8 0 000 0l1.6-1.6a2.5 2.5 0 013.5 3.5l-2 2a2.5 2.5 0 01-3.5 0" /></Icon>
);
export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 2.5h2.5l1.2 3-1.5 1.1a8 8 0 003.7 3.7l1.1-1.5 3 1.2V12a1.5 1.5 0 01-1.6 1.5A11.5 11.5 0 011.5 4.1 1.5 1.5 0 013 2.5z" /></Icon>
);
export const MailIcon = (p: IconProps) => (
  <Icon {...p}><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" /><path d="M2 4.5l6 4 6-4" /></Icon>
);
export const MapPinIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 14.5s5-4.4 5-8a5 5 0 00-10 0c0 3.6 5 8 5 8z" /><circle cx="8" cy="6.5" r="1.8" /></Icon>
);
export const BedIcon = (p: IconProps) => (
  <Icon {...p}><path d="M1.5 12.5V5M1.5 8.5h13V12.5M14.5 12.5v-1" /><path d="M4 8.5V7a1 1 0 011-1h2a1 1 0 011 1v1.5" /></Icon>
);
export const PlaneIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8.5 1.8c.5 0 .9.4.9.9v4l4.6 2.7v1.4l-4.6-1.4v3l1.6 1.2v1L8.5 14l-2.5.6v-1l1.6-1.2v-3L3 10.8V9.4l4.6-2.7v-4c0-.5.4-.9.9-.9z" /></Icon>
);
export const GemIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 2.5h8l2.5 3.5L8 14 1.5 6 4 2.5z" /><path d="M1.5 6h13M5.5 6L8 14M10.5 6L8 14M5.5 6l1-3.5M10.5 6l-1-3.5" /></Icon>
);
export const FlagIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3.5 14V2M3.5 3h8l-1.5 3 1.5 3h-8" /></Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9.1a1 1 0 001 .9h4.8a1 1 0 001-.9L12 4" /></Icon>
);
export const FilterIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2 3.5h12L9.5 8.5v4.5l-3-1.5v-3L2 3.5z" /></Icon>
);
export const MenuIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2 4.5h12M2 8h12M2 11.5h12" /></Icon>
);
export const DotsIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="13" cy="8" r="1.1" fill="currentColor" stroke="none" /></Icon>
);
export const UploadIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2.5 10.5v2a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5v-2" /><path d="M8 10.5V2M5 5l3-3 3 3" /></Icon>
);
export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2.5 10.5v2a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5v-2" /><path d="M8 2v8.5M5 7.5l3 3 3-3" /></Icon>
);
export const LockIcon = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></Icon>
);
export const MusicIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="4" cy="12" r="2" /><circle cx="12" cy="10.5" r="2" /><path d="M6 12V4l8-1.5v8" /></Icon>
);
export const CameraIcon = (p: IconProps) => (
  <Icon {...p}><rect x="1.5" y="4.5" width="13" height="9" rx="2" /><circle cx="8" cy="9" r="2.5" /><path d="M5.5 4.5l1-2h3l1 2" /></Icon>
);
export const UtensilsIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 2v5a1.5 1.5 0 003 0V2M5.5 8v6" /><path d="M11.5 2c-1 0-1.5 1.5-1.5 3.5S10.5 9 11.5 9 13 7.5 13 5.5 12.5 2 11.5 2zM11.5 9v5" /></Icon>
);
export const UndoIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2.5 6.5h7a3.5 3.5 0 010 7H6" /><path d="M5 3.5l-2.5 3L5 9.5" /></Icon>
);
export const CommandIcon = (p: IconProps) => (
  <Icon {...p}><path d="M5.5 2.5a1.5 1.5 0 100 3h5a1.5 1.5 0 110-3 1.5 1.5 0 010 3v5a1.5 1.5 0 103 0 1.5 1.5 0 11-3 0h-5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0v-5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></Icon>
);
export const ImageIcon = (p: IconProps) => (
  <Icon {...p}><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><circle cx="5.5" cy="6.5" r="1.2" /><path d="M2 11l3.5-3 2.5 2.2L11 7l3.5 3.4" /></Icon>
);
