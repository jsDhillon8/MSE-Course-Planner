import type { ComponentProps } from "react";
import { ScheduleSlotCard } from "../../components/schedule/ScheduleSlotCard";

/** Card props that are the same for every course on the custom schedule page. */
export type SharedCourseCardProps = Pick<
  ComponentProps<typeof ScheduleSlotCard>,
  "selectedCourseId" | "highlightRoles" | "completedCourseIds" | "onToggleCompleted" | "onSelect" | "courseLookup"
>;
