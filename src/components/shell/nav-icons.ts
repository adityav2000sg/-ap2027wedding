"use client";

import type { ComponentType, SVGProps } from "react";

import {
  ActivityIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckSquareIcon,
  FileIcon,
  HangerIcon,
  HomeIcon,
  ImageIcon,
  RouteIcon,
  SettingsIcon,
  SparkIcon,
  TimelineIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/ui/icons";
import type { IconKey } from "./nav";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** Resolves the serialisable icon keys from `nav.ts` into real components. */
export const NAV_ICONS: Record<IconKey, IconComponent> = {
  home: HomeIcon,
  calendar: CalendarIcon,
  tasks: CheckSquareIcon,
  guests: UsersIcon,
  vendors: BriefcaseIcon,
  budget: WalletIcon,
  timeline: TimelineIcon,
  logistics: RouteIcon,
  wardrobe: HangerIcon,
  moodboard: ImageIcon,
  documents: FileIcon,
  ai: SparkIcon,
  activity: ActivityIcon,
  settings: SettingsIcon,
};
