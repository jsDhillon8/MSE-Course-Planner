import { Fragment, useRef } from "react";
import type { DragEvent } from "react";
import { courseById } from "../../data";
import { offeringFill, offeringTooltip } from "../../api/sfuOutlines";
import { Course, CourseHighlightRole, CourseSlot, OfferingHistory, TermName } from "../../types";
import { slotCourseIds } from "../../lib/scheduleTerms";
import { notOfferedRecentlyReason } from "../../lib/recentOffering";
import { OfferingHistoryState } from "../../hooks/useOfferingHistories";
import type { PlanRequirementWarning } from "../../lib/requirements/planValidation";
import "./ScheduleSlotCard.css";

export function getCourseCardClassName(
  courseId: string,
  roles: Map<string, CourseHighlightRole>
): string {
  const role = roles.get(courseId);
  return role ? `course-card role-${role}` : "course-card";
}

export interface TermMoveOption {
  id: string;
  label: string;
  disabled?: boolean;
}

const SEASON_BADGES: { key: TermName; short: string; label: string }[] = [
  { key: "fall", short: "F", label: "Fall" },
  { key: "spring", short: "Sp", label: "Spring" },
  { key: "summer", short: "Su", label: "Summer" },
];

interface OfferingBadgesProps {
  history: OfferingHistoryState | undefined;
}

function OfferingBadges({ history }: OfferingBadgesProps) {
  const resolved = history && history !== "loading" && history !== "unknown" ? history : undefined;
  const isUnknown = !resolved;

  return (
    <div className="offering-badges" aria-label="Recent offering history">
      {SEASON_BADGES.map((season) => {
        const stats = resolved ? resolved[season.key] : undefined;
        const fill = isUnknown ? "unknown" : offeringFill(stats);
        const title =
          history === "loading"
            ? `${season.label}: loading`
            : offeringTooltip(season.label, stats);
        return (
          <span key={season.key} className={`offering-pip fill-${fill}`} title={title}>
            {season.short}
          </span>
        );
      })}
    </div>
  );
}

interface ScheduleSlotCardProps {
  slot: CourseSlot;
  selectedCourseId: string | null;
  highlightRoles: Map<string, CourseHighlightRole>;
  completedCourseIds: Set<string>;
  onToggleCompleted: (courseId: string) => void;
  onSelect: (course: Course) => void;
  draggable?: boolean;
  onCourseDragStart?: (event: DragEvent<HTMLDivElement>, courseId: string) => void;
  onCourseDragEnd?: () => void;
  moveOptions?: TermMoveOption[];
  currentTermId?: string;
  onMoveToTerm?: (courseId: string, termId: string) => void;
  onRemoveFromPlan?: (courseId: string) => void;
  courseLookup?: Record<string, Course>;
  offeringHistory?: OfferingHistoryState;
  showOfferingBadges?: boolean;
  termSeason?: TermName | null;
  swappedFromCode?: string;
  onUndoSwap?: (courseId: string) => void;
  /** Unmet prerequisites/corequisites for this placement (custom schedule only). */
  requirementWarnings?: PlanRequirementWarning[];
  /** Set when this course's credits don't count toward graduation (custom schedule only). */
  notCountingReason?: string;
  /** The course's variant group (same lecture with or without a lab or tutorial), shown as a toggle. */
  variantIds?: string[];
  onChooseVariant?: (fromId: string, toId: string) => void;
  /** Variants that can't be picked, e.g. already placed elsewhere. */
  isVariantDisabled?: (courseId: string) => boolean;
}

export function offeringWarningLevel(
  history: OfferingHistoryState | undefined,
  season: TermName | null | undefined
): "none" | "rare" | "never" {
  if (!season || !history || history === "loading" || history === "unknown") return "none";
  const fill = offeringFill(history[season]);
  if (fill === "empty") return "never";
  if (fill === "half") return "rare";
  return "none";
}

export function ScheduleSlotCard({
  slot,
  selectedCourseId,
  highlightRoles,
  completedCourseIds,
  onToggleCompleted,
  onSelect,
  draggable = false,
  onCourseDragStart,
  onCourseDragEnd,
  moveOptions,
  currentTermId,
  onMoveToTerm,
  onRemoveFromPlan,
  courseLookup = courseById,
  offeringHistory,
  showOfferingBadges = false,
  termSeason = null,
  swappedFromCode,
  onUndoSwap,
  requirementWarnings = [],
  notCountingReason,
  variantIds,
  onChooseVariant,
  isVariantDisabled,
}: ScheduleSlotCardProps) {
  const courseIds = slotCourseIds(slot);
  const isChoiceGroup = courseIds.length > 1;
  const suppressClickRef = useRef(false);
  const warning = offeringWarningLevel(offeringHistory, termSeason);

  return (
    <div
      className={isChoiceGroup ? "course-slot choice-slot" : "course-slot"}
      role={isChoiceGroup ? "group" : undefined}
      aria-label={isChoiceGroup ? "Choose one of the following courses" : undefined}
    >
      {courseIds.map((courseId, index) => {
        const course = courseLookup[courseId];
        const isCompleted = completedCourseIds.has(courseId);
        const notRecentReason = course ? notOfferedRecentlyReason(course, offeringHistory) : null;
        const warningClass =
          warning === "never"
            ? " offering-warning never-offered"
            : warning === "rare"
              ? " offering-warning rarely-offered"
              : "";
        return (
          <Fragment key={courseId}>
            {index > 0 && (
              <span className="choice-divider" aria-hidden="true">
                OR
              </span>
            )}
            {course ? (
              <div
                className={`${getCourseCardClassName(course.id, highlightRoles)}${
                  isCompleted ? " completed" : ""
                }${draggable ? " is-draggable" : ""}${warningClass}${notRecentReason ? " not-offered-recently" : ""}`}
                role="button"
                tabIndex={0}
                draggable={draggable}
                aria-pressed={selectedCourseId === course.id}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onSelect(course);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(course);
                  }
                }}
                onDragStart={
                  draggable && onCourseDragStart
                    ? (event) => {
                        suppressClickRef.current = true;
                        onCourseDragStart(event, course.id);
                      }
                    : undefined
                }
                onDragEnd={() => {
                  onCourseDragEnd?.();
                  window.setTimeout(() => {
                    suppressClickRef.current = false;
                  }, 0);
                }}
              >
                <label
                  className="course-checkbox"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    draggable={false}
                    checked={isCompleted}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggleCompleted(course.id)}
                    aria-label={`Mark ${course.code} as completed`}
                  />
                </label>
                <strong>{course.code}</strong>
                <span>{course.title}</span>
                {variantIds && variantIds.length > 1 && onChooseVariant && (
                  <div
                    className="variant-toggle"
                    role="group"
                    aria-label={`${course.code}: versions of the same course`}
                    title="Versions of the same course (e.g. with or without a lab). SFU gives credit for only one. Pick the one you're taking."
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {variantIds.map((variantId) => {
                      const variant = courseLookup[variantId];
                      const active = variantId === course.id;
                      return (
                        <button
                          key={variantId}
                          type="button"
                          draggable={false}
                          className={active ? "active" : undefined}
                          aria-pressed={active}
                          disabled={!active && isVariantDisabled?.(variantId)}
                          onClick={() => {
                            if (!active) onChooseVariant(course.id, variantId);
                          }}
                        >
                          {variant?.code ?? variantId} · {variant?.credits ?? "?"} cr
                        </button>
                      );
                    })}
                  </div>
                )}
                {requirementWarnings.length > 0 && (
                  <span
                    className="requirement-badge"
                    title={`${requirementWarnings.map((warning) => warning.message).join("\n")}\nSelect the course for how to fix it.`}
                  >
                    <span aria-hidden="true">⚠</span>{" "}
                    {requirementWarnings.length === 1
                      ? "Prereq warning"
                      : `${requirementWarnings.length} prereq warnings`}
                    <span className="visually-hidden">
                      : {requirementWarnings.map((warning) => warning.message).join(" ")}
                    </span>
                  </span>
                )}
                {notRecentReason && (
                  <span className="not-offered-badge" title={notRecentReason}>
                    Not offered recently
                    <span className="visually-hidden">: {notRecentReason}</span>
                  </span>
                )}
                {notCountingReason && (
                  <span className="not-counting-badge" title={notCountingReason}>
                    Doesn't count toward graduation
                    <span className="visually-hidden">: {notCountingReason}</span>
                  </span>
                )}
                {showOfferingBadges && <OfferingBadges history={offeringHistory} />}
                {swappedFromCode && (
                  <div className="swap-meta">
                    <span className="swap-from">swapped from {swappedFromCode}</span>
                    {onUndoSwap && (
                      <button
                        type="button"
                        className="undo-swap-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onUndoSwap(course.id);
                        }}
                      >
                        Undo swap
                      </button>
                    )}
                    <span className="swap-note">
                      Confirm with an advisor that this counts toward your degree.
                    </span>
                  </div>
                )}
                {moveOptions && onMoveToTerm && (
                  <label
                    className="course-move-control"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <span className="visually-hidden">
                      {currentTermId ? `Move ${course.code}` : `Add ${course.code}`}
                    </span>
                    <select
                      value=""
                      draggable={false}
                      aria-label={currentTermId ? `Move ${course.code} to another term` : `Add ${course.code} to a term`}
                      onChange={(event) => {
                        const value = event.target.value;
                        event.target.value = "";
                        if (!value) return;
                        if (value === "__remove") {
                          onRemoveFromPlan?.(course.id);
                          return;
                        }
                        onMoveToTerm(course.id, value);
                      }}
                    >
                      <option value="">{currentTermId ? "Move to…" : "Add to…"}</option>
                      {moveOptions.map((option) => (
                        <option key={option.id} value={option.id} disabled={option.disabled}>
                          {option.label}
                        </option>
                      ))}
                      {currentTermId && onRemoveFromPlan && (
                        <option value="__remove">Remove from plan</option>
                      )}
                    </select>
                  </label>
                )}
              </div>
            ) : (
              <div className="course-card">
                <strong>Unknown Course</strong>
                <span>{courseId}</span>
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export function formatOfferingWarning(
  course: Course,
  termLabel: string,
  season: TermName,
  history: OfferingHistory
): string {
  const stats = history[season];
  const seasonLabel = season === "fall" ? "falls" : season === "spring" ? "springs" : "summers";
  return `${course.code} in ${termLabel}: offered in ${stats.offered}/${stats.total} recent ${seasonLabel}`;
}
