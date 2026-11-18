import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { CourseDetailsPanel } from "../../components/course-details/CourseDetailsPanel";
import { AppHeader } from "../../components/layout/AppHeader";
import { ProgressFooter } from "../../components/layout/ProgressFooter";
import { HighlightLegend } from "../../components/schedule/HighlightLegend";
import { formatOfferingWarning, offeringWarningLevel } from "../../components/schedule/ScheduleSlotCard";
import { getCurriculumCourseIds, pageTemplates } from "../../data";
import { useCourseProgress } from "../../hooks/useCourseProgress";
import { useOfferingHistories } from "../../hooks/useOfferingHistories";
import { isPlaceholderCourse } from "../../lib/courseCodes";
import { summarizePlanCredits, TERM_CREDIT_WARN_THRESHOLD } from "../../lib/credits";
import { equivalentsById } from "../../lib/equivalence";
import {
  clearCustomPlanStorage,
  createEmptyCustomPlan,
  CustomPlan,
  customPlanFromTemplate,
  findSwapForCourse,
  loadCustomPlan,
  parsePlanFile,
  placedCourseIds,
  PLAN_FILE_EXTENSION,
  planCourseLookup,
  saveCustomPlan,
  serializePlanFile,
  termNameFromLabel,
} from "../../lib/customPlan";
import { courseDependencyGraph } from "../../lib/requirements/dependencyGraph";
import { validatePlanRequirements } from "../../lib/requirements/planValidation";
import { Course, CourseHighlightRole, VariantId } from "../../types";
import type { SharedCourseCardProps } from "./courseCardProps";
import { CoursePicker } from "./CoursePicker";
import "./CustomSchedulePage.css";
import { CustomTermGrid } from "./CustomTermGrid";
import { PulloutPanel, usePulloutState } from "./PulloutPanel";
import { useCourseDrag } from "./useCourseDrag";
import { useEquivalentSwap } from "./useEquivalentSwap";

interface CustomSchedulePageProps {
  onOpenWelcome: () => void;
}

export function CustomSchedulePage({ onOpenWelcome }: CustomSchedulePageProps) {
  const [plan, setPlan] = useState<CustomPlan>(loadCustomPlan);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [recursiveHighlights, setRecursiveHighlights] = useState(true);
  const [templateSeed, setTemplateSeed] = useState(`${pageTemplates[0]?.id ?? ""}:A`);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, togglePicker] = usePulloutState("mse-planner:custom-picker-panel");
  const [detailsOpen, toggleDetails] = usePulloutState("mse-planner:custom-details-panel");

  const {
    completedCourseIds,
    transferCredits,
    toggleCourseCompleted,
    handleTransferCreditsChange,
    handleTransferCreditsKeyDown,
    handleResetProgress,
  } = useCourseProgress();

  const lookup = useMemo(() => planCourseLookup(plan), [plan]);

  useEffect(() => {
    saveCustomPlan(plan);
  }, [plan]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCourse(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!selectedCourse) return;
    const latest = lookup[selectedCourse.id];
    if (latest && latest !== selectedCourse) setSelectedCourse(latest);
    if (!latest) setSelectedCourse(null);
  }, [lookup, selectedCourse]);

  const placed = useMemo(() => placedCourseIds(plan), [plan]);

  const drag = useCourseDrag(plan, setPlan);
  const { handleSwapIntoPlan, handleUndoSwap } = useEquivalentSwap(
    plan,
    setPlan,
    placed,
    selectedCourse,
    setSelectedCourse,
  );

  const gridCourses = useMemo(() => {
    const list: Course[] = [];
    for (const term of plan.terms) {
      for (const id of term.courseIds) {
        const course = lookup[id];
        if (course) list.push(course);
      }
    }
    return list;
  }, [plan.terms, lookup]);

  const historyCourses = useMemo(() => {
    const list = [...gridCourses];
    if (selectedCourse && !list.some((course) => course.id === selectedCourse.id)) {
      list.push(selectedCourse);
    }
    return list;
  }, [gridCourses, selectedCourse]);

  const offeringHistories = useOfferingHistories(historyCourses);

  const highlightSourceId = selectedCourse
    ? findSwapForCourse(plan, selectedCourse.id)?.originalCourseId ?? selectedCourse.id
    : null;

  const relationshipHighlights = useMemo(() => {
    const highlights = courseDependencyGraph.getHighlights(highlightSourceId, recursiveHighlights);
    if (!selectedCourse || selectedCourse.id === highlightSourceId) return highlights;

    const roles = new Map<string, CourseHighlightRole>(highlights.roles);
    roles.delete(highlightSourceId ?? "");
    roles.set(selectedCourse.id, "selected");
    return { roles };
  }, [highlightSourceId, recursiveHighlights, selectedCourse]);

  const requirementWarnings = useMemo(
    () => validatePlanRequirements(plan.terms, plan.swaps, lookup),
    [plan.terms, plan.swaps, lookup]
  );

  const curriculumCourseIds = useMemo(
    () => getCurriculumCourseIds(plan.programId, plan.curriculumId),
    [plan.programId, plan.curriculumId]
  );

  const creditSummary = useMemo(
    () =>
      summarizePlanCredits(
        plan.terms,
        plan.swaps,
        completedCourseIds,
        lookup,
        curriculumCourseIds,
        equivalentsById
      ),
    [plan.terms, plan.swaps, completedCourseIds, lookup, curriculumCourseIds]
  );
  const totalCurriculumCredits = creditSummary.graduationCredits;
  const completedCredits = creditSummary.completedGraduationCredits;

  const totalCompleted = completedCredits + transferCredits;
  const completionPercent =
    totalCurriculumCredits > 0 ? Math.round((totalCompleted / totalCurriculumCredits) * 100) : 0;

  const offeringWarnings = useMemo(() => {
    const items: string[] = [];
    for (const term of plan.terms) {
      const season = termNameFromLabel(term.label);
      for (const courseId of term.courseIds) {
        const course = lookup[courseId];
        if (!course || isPlaceholderCourse(course)) continue;
        const history = offeringHistories.get(course.id);
        const level = offeringWarningLevel(history, season);
        if (level === "none" || !history || history === "loading" || history === "unknown" || !season) {
          continue;
        }
        items.push(formatOfferingWarning(course, term.label, season, history));
      }
    }
    return items;
  }, [plan.terms, lookup, offeringHistories]);

  const handleStartFromTemplate = () => {
    const [templateId, variantId] = templateSeed.split(":");
    const template = pageTemplates.find((item) => item.id === templateId);
    if (!template) return;
    const variant = (variantId as VariantId) || template.availableVariants[0] || "A";
    setPlan(customPlanFromTemplate(template, variant));
  };

  const handleResetSchedule = () => {
    const confirmed = window.confirm(
      "Reset your custom schedule to an empty Year 1–5 grid? This cannot be undone."
    );
    if (!confirmed) return;
    const empty = createEmptyCustomPlan(plan.programId, plan.curriculumId);
    setPlan(empty);
    clearCustomPlanStorage();
    saveCustomPlan(empty);
  };

  const handleExportPlan = () => {
    const blob = new Blob([serializePlanFile(plan)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${plan.programId}-${plan.curriculumId}${PLAN_FILE_EXTENSION}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPlan = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const result = parsePlanFile(await file.text());
    if (!result.ok) {
      window.alert(`Couldn't import "${file.name}". ${result.error}`);
      return;
    }
    if (placed.size > 0 && !window.confirm(`Replace your current custom schedule with "${file.name}"?`)) {
      return;
    }
    setSelectedCourse(null);
    setPlan(result.plan);
  };

  const handleCourseSelect = (course: Course) => {
    setSelectedCourse((current) => (current?.id === course.id ? null : course));
  };

  const selectedInPlan = Boolean(selectedCourse && placed.has(selectedCourse.id));

  const cardProps: SharedCourseCardProps = {
    selectedCourseId: selectedCourse?.id ?? null,
    highlightRoles: relationshipHighlights.roles,
    completedCourseIds,
    onToggleCompleted: toggleCourseCompleted,
    onSelect: handleCourseSelect,
    courseLookup: lookup,
  };

  return (
    <div className="app-shell custom-shell">
      <AppHeader
        selectedPageId="custom"
        extraControls={
          <>
            <select
              value={templateSeed}
              onChange={(event) => setTemplateSeed(event.target.value)}
              aria-label="Template to copy"
            >
              {pageTemplates.map((page) =>
                page.supportsVariants
                  ? page.availableVariants.map((option) => (
                      <option key={`${page.id}:${option}`} value={`${page.id}:${option}`}>
                        {page.title} — Option {option}
                      </option>
                    ))
                  : [
                      <option key={`${page.id}:A`} value={`${page.id}:A`}>
                        {page.title}
                      </option>,
                    ]
              )}
            </select>
            <button type="button" onClick={handleStartFromTemplate}>
              Start from template
            </button>
            <button type="button" onClick={handleExportPlan} aria-label="Export plan to a file">
              Export
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              aria-label="Import plan from a file"
            >
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={handleImportPlan}
            />
            <button type="button" className="reset-progress-btn" onClick={handleResetSchedule}>
              Reset
            </button>
          </>
        }
        onOpenWelcome={onOpenWelcome}
      />

      <main
        className={`planner-layout custom-layout${pickerOpen ? "" : " picker-closed"}${
          detailsOpen ? "" : " details-closed"
        }`}
      >
        <PulloutPanel
          id="custom-course-picker"
          side="left"
          label="Course picker"
          open={pickerOpen}
          onToggle={togglePicker}
        >
          <CoursePicker plan={plan} setPlan={setPlan} placed={placed} drag={drag} cardProps={cardProps} />
        </PulloutPanel>

        <section className="grid-panel">
          <h2>Custom Schedule</h2>
          <p className="meta">
            Build a Year 1–5 plan. CO-OP must occupy a term by itself. Terms over{" "}
            {TERM_CREDIT_WARN_THRESHOLD} credits are flagged.
          </p>

          <HighlightLegend
            roles={relationshipHighlights.roles}
            recursiveHighlights={recursiveHighlights}
            onToggleRecursive={setRecursiveHighlights}
          />

          {offeringWarnings.length > 0 && (
            <details className="schedule-warnings">
              <summary>Offering warnings ({offeringWarnings.length})</summary>
              <ul>
                {offeringWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          )}

          <CustomTermGrid
            plan={plan}
            setPlan={setPlan}
            drag={drag}
            cardProps={cardProps}
            offeringHistories={offeringHistories}
            onUndoSwap={handleUndoSwap}
            requirementWarnings={requirementWarnings}
            notCountingReasons={creditSummary.notCountingReasons}
          />
        </section>

        <PulloutPanel
          id="custom-course-details"
          side="right"
          label="Course details"
          open={detailsOpen}
          onToggle={toggleDetails}
        >
          <CourseDetailsPanel
            selectedCourse={selectedCourse}
            swapEnabled={selectedInPlan}
            requirementWarnings={selectedCourse ? requirementWarnings.get(selectedCourse.id) : undefined}
            onSwapIntoPlan={handleSwapIntoPlan}
          />
        </PulloutPanel>
      </main>

      <ProgressFooter
        completedCredits={completedCredits}
        transferCredits={transferCredits}
        totalCompleted={totalCompleted}
        totalCurriculumCredits={totalCurriculumCredits}
        completionPercent={completionPercent}
        extraCredits={creditSummary.extraCredits}
        onTransferCreditsChange={handleTransferCreditsChange}
        onTransferCreditsKeyDown={handleTransferCreditsKeyDown}
        onResetProgress={handleResetProgress}
      />
    </div>
  );
}
