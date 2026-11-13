import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ScheduleSlotCard } from "../../components/schedule/ScheduleSlotCard";
import { computeTermCredits, TERM_CREDIT_WARN_THRESHOLD } from "../../lib/credits";
import {
  canPlaceCourse,
  CustomPlan,
  findSwapForCourse,
  placeCourse,
  removeCourseFromPlan,
  termNameFromLabel,
} from "../../lib/customPlan";
import { useOfferingHistories } from "../../hooks/useOfferingHistories";
import { groupTermsByYear } from "../../lib/scheduleTerms";
import type { SharedCourseCardProps } from "./courseCardProps";
import type { CourseDrag } from "./useCourseDrag";

interface CustomTermGridProps {
  plan: CustomPlan;
  setPlan: Dispatch<SetStateAction<CustomPlan>>;
  drag: CourseDrag;
  cardProps: SharedCourseCardProps;
  offeringHistories: ReturnType<typeof useOfferingHistories>;
  onUndoSwap: (courseId: string) => void;
}

/** Year rows of term columns; each term is a drop target with a credit count. */
export function CustomTermGrid({ plan, setPlan, drag, cardProps, offeringHistories, onUndoSwap }: CustomTermGridProps) {
  const { dragging, hoverTarget, setHoverTarget, keepDrag, dropOnTerm, termDropState, beginDrag, endDrag } = drag;
  const lookup = cardProps.courseLookup ?? {};
  const termsByYear = useMemo(() => groupTermsByYear(plan.terms), [plan.terms]);

  return (
    <div className="year-grid">
      {termsByYear.map((yearGroup) => (
        <section key={yearGroup.year} className="year-row">
          <h3 className="year-title">Year {yearGroup.year}</h3>
          <div className="term-grid">
            {yearGroup.terms.map((term) => {
              const credits = computeTermCredits(term.courseIds, lookup);
              const over = credits > TERM_CREDIT_WARN_THRESHOLD;
              const dropState = dragging ? termDropState(term.id) : null;
              const dropClass =
                dropState === "valid"
                  ? " drop-target-valid"
                  : dropState === "invalid"
                    ? " drop-target-invalid"
                    : "";
              const hoverClass = hoverTarget === term.id ? " drop-hover" : "";
              const season = termNameFromLabel(term.label);

              return (
                <article
                  key={term.id}
                  className={`term-column${over ? " term-over-credits" : ""}${dropClass}${hoverClass}`}
                  onDragOver={(event) => {
                    keepDrag(event);
                    if (dragging) {
                      event.dataTransfer.dropEffect = canPlaceCourse(
                        plan,
                        dragging.courseId,
                        term.id,
                        dragging.fromTermId
                      )
                        ? "move"
                        : "none";
                    }
                    setHoverTarget(term.id);
                  }}
                  onDragLeave={(event) => {
                    const next = event.relatedTarget as Node | null;
                    if (next && event.currentTarget.contains(next)) return;
                    if (hoverTarget === term.id) setHoverTarget(null);
                  }}
                  onDrop={(event) => dropOnTerm(event, term.id)}
                >
                  <h4>
                    {term.label.split("-")[1]?.trim() ?? term.label}
                    <span className={`term-credits${over ? " warn" : ""}`}>
                      {credits} cr
                      {over ? " — over 18" : ""}
                    </span>
                  </h4>
                  <div className="course-list">
                    {term.courseIds.map((courseId) => {
                      const swap = findSwapForCourse(plan, courseId);
                      return (
                        <ScheduleSlotCard
                          key={courseId}
                          slot={courseId}
                          {...cardProps}
                          draggable
                          onCourseDragStart={(event, id) => beginDrag(event, id, term.id)}
                          onCourseDragEnd={endDrag}
                          currentTermId={term.id}
                          moveOptions={plan.terms
                            .filter((option) => option.id !== term.id)
                            .map((option) => ({
                              id: option.id,
                              label: option.label,
                              disabled: !canPlaceCourse(plan, courseId, option.id, term.id),
                            }))}
                          onMoveToTerm={(id, destTermId) =>
                            setPlan((current) => placeCourse(current, id, destTermId, term.id))
                          }
                          onRemoveFromPlan={(id) =>
                            setPlan((current) => removeCourseFromPlan(current, id, term.id))
                          }
                          showOfferingBadges
                          offeringHistory={offeringHistories.get(courseId)}
                          termSeason={season}
                          swappedFromCode={swap?.originalCode}
                          onUndoSwap={swap ? onUndoSwap : undefined}
                        />
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
