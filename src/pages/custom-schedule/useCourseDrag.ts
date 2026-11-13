import { useState } from "react";
import type { Dispatch, DragEvent, SetStateAction } from "react";
import { courseById } from "../../data";
import { canPlaceCourse, CourseDragPayload, CustomPlan, placeCourse, removeCourseFromPlan } from "../../lib/customPlan";

const DRAG_MIME = "application/x-mse-course";

function parseDragPayload(event: DragEvent): CourseDragPayload | null {
  const raw = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CourseDragPayload;
    if (typeof parsed?.courseId === "string") {
      return { courseId: parsed.courseId, fromTermId: parsed.fromTermId ?? null };
    }
  } catch {
    if (courseById[raw]) return { courseId: raw, fromTermId: null };
  }
  return null;
}

/** Drag-and-drop state and handlers for moving courses between the picker and terms. */
export function useCourseDrag(plan: CustomPlan, setPlan: Dispatch<SetStateAction<CustomPlan>>) {
  const [dragging, setDragging] = useState<CourseDragPayload | null>(null);
  /** Term id or "picker" currently under the dragged course. */
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);

  const beginDrag = (event: DragEvent<HTMLDivElement>, courseId: string, fromTermId: string | null) => {
    const payload: CourseDragPayload = { courseId, fromTermId };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    setDragging(payload);
  };

  const endDrag = () => {
    setDragging(null);
    setHoverTarget(null);
  };

  const dropOnTerm = (event: DragEvent, destTermId: string) => {
    event.preventDefault();
    const payload = dragging ?? parseDragPayload(event);
    endDrag();
    if (!payload) return;
    setPlan((current) => placeCourse(current, payload.courseId, destTermId, payload.fromTermId));
  };

  const dropOnPicker = (event: DragEvent) => {
    event.preventDefault();
    const payload = dragging ?? parseDragPayload(event);
    endDrag();
    if (!payload?.fromTermId) return;
    setPlan((current) => removeCourseFromPlan(current, payload.courseId, payload.fromTermId ?? undefined));
  };

  const keepDrag = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };

  const termDropState = (termId: string): "valid" | "invalid" | null => {
    if (!dragging) return null;
    return canPlaceCourse(plan, dragging.courseId, termId, dragging.fromTermId) ? "valid" : "invalid";
  };

  return {
    dragging,
    hoverTarget,
    setHoverTarget,
    beginDrag,
    endDrag,
    dropOnTerm,
    dropOnPicker,
    keepDrag,
    termDropState,
  };
}

export type CourseDrag = ReturnType<typeof useCourseDrag>;
