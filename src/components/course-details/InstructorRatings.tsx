import { useState } from "react";
import { useRmpInsights } from "../../hooks/useRmpInsights";
import { isRmpEnabled, uniqueInstructorNames } from "../../api/rmp";
import { OfferedSection, RmpComment, RmpCommentTier } from "../../types";
import "./InstructorRatings.css";

const MAX_COMMENTS = 5;
const COMMENT_PREVIEW_CHARS = 260;

function formatRating(value: number | null | undefined): string {
  return typeof value === "number" && value > 0 ? value.toFixed(1) : "–";
}

type RatingTone = "error" | "warn" | "success";

/** 0–2.4 red, 2.5–3.4 yellow, 3.5–5 green (RMP ratings have one decimal). */
function ratingTone(value: number): RatingTone {
  if (value < 2.5) return "error";
  if (value < 3.5) return "warn";
  return "success";
}

function formatCommentDate(raw: string): string {
  // RMP sends "2026-04-13 23:01:57 +0000 UTC"
  const date = new Date(raw.slice(0, 10));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", timeZone: "UTC" });
}

const TIER_LABEL: Record<RmpCommentTier, string> = {
  class: "This class",
  equivalent: "Equivalent",
  general: "General",
};

function RmpCommentItem({ comment }: { comment: RmpComment }) {
  const [expanded, setExpanded] = useState(false);
  const text = comment.comment.trim();
  const isLong = text.length > COMMENT_PREVIEW_CHARS;
  const shown = expanded || !isLong ? text : `${text.slice(0, COMMENT_PREVIEW_CHARS).trimEnd()}…`;
  const date = formatCommentDate(comment.date);
  // Older cached responses only have fromClass.
  const tier: RmpCommentTier = comment.source ?? (comment.fromClass ? "class" : "general");

  return (
    <li className="rmp-comment">
      <div className="rmp-comment-meta">
        <span className={`rmp-comment-tag ${tier}`}>{TIER_LABEL[tier]}</span>
        {comment.class && <span className="rmp-comment-class">{comment.class}</span>}
        {date && <span className="rmp-comment-date">{date}</span>}
      </div>
      <p className="rmp-comment-text">{shown}</p>
      {isLong && (
        <button
          type="button"
          className="rmp-link-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      <div className="rmp-comment-scores">
        {comment.clarityRating != null && <span>Clarity {comment.clarityRating}/5</span>}
        {comment.difficultyRating != null && <span>Difficulty {comment.difficultyRating}/5</span>}
        {comment.grade && <span>Grade: {comment.grade}</span>}
      </div>
    </li>
  );
}

interface InstructorRatingItemProps {
  name: string;
  courseCode: string | null;
  equivalentCodes: string[];
}

function InstructorRatingItem({ name, courseCode, equivalentCodes }: InstructorRatingItemProps) {
  const [open, setOpen] = useState(false);
  const rmp = useRmpInsights(name, courseCode, equivalentCodes, open);
  const data = rmp.data;

  return (
    <details className="rmp-instructor" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="rmp-instructor-summary">
        <span className="rmp-instructor-name">{name}</span>
        {rmp.status === "loading" && <span className="live-badge loading">Loading</span>}
        {/* Only show a number at a glance when the names match exactly. */}
        {rmp.status === "success" && data && !data.isExactNameMatch && (
          <span className="live-badge warn">Possible match</span>
        )}
        {rmp.status === "success" && data && data.isExactNameMatch && data.professor.numRatings > 0 && (
          <span className={`live-badge ${ratingTone(data.professor.avgRating)}`}>
            {formatRating(data.professor.avgRating)} / 5
          </span>
        )}
        {rmp.status === "not-found" && <span className="live-badge warn">Not on RMP</span>}
        {rmp.status === "error" && <span className="live-badge error">Unavailable</span>}
      </summary>

      <div className="rmp-instructor-body">
        {rmp.status === "loading" && (
          <p className="empty-note">Contacting RateMyProfessors… (first lookup can take a moment)</p>
        )}
        {rmp.status === "not-found" && (
          <p className="empty-note">No RateMyProfessors profile found for this instructor at SFU.</p>
        )}
        {rmp.status === "error" && (
          <p className="empty-note">Could not load ratings right now. Collapse and reopen to retry.</p>
        )}

        {rmp.status === "success" && data && (
          <>
            {!data.isExactNameMatch && (
              <div className="rmp-match-warning" role="note">
                <span className="live-badge warn">Possible match, verify on RMP</span>
                <p>
                  RMP lists this profile as <strong>{data.professor.name}</strong>, not{" "}
                  <strong>{name}</strong>. Check it's the same person before relying on these
                  ratings.
                </p>
              </div>
            )}

            <div className="rmp-profile-header">
              <div>
                <strong>{data.professor.name}</strong>
                <span className="rmp-profile-dept">
                  {[data.professor.department, data.professor.school].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>

            {data.professor.numRatings > 0 ? (
              <dl className="rmp-stats">
                <div>
                  <dt>Rating</dt>
                  <dd className={`rmp-rating-value ${ratingTone(data.professor.avgRating)}`}>
                    {formatRating(data.professor.avgRating)} / 5
                  </dd>
                </div>
                <div>
                  <dt>Difficulty</dt>
                  <dd>{formatRating(data.professor.avgDifficulty)} / 5</dd>
                </div>
                <div>
                  <dt>Ratings</dt>
                  <dd>{data.professor.numRatings}</dd>
                </div>
                {data.professor.wouldTakeAgainPercent !== null && (
                  <div>
                    <dt>Would take again</dt>
                    <dd>{Math.round(data.professor.wouldTakeAgainPercent)}%</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="empty-note">This profile has no ratings yet.</p>
            )}

            <a
              className="rmp-profile-link"
              href={data.professor.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on RateMyProfessors ↗
            </a>

            {data.note && <p className="rmp-note">{data.note}</p>}

            {data.comments.length > 0 ? (
              <ul className="rmp-comments">
                {data.comments.slice(0, MAX_COMMENTS).map((comment) => (
                  <RmpCommentItem key={comment.id} comment={comment} />
                ))}
              </ul>
            ) : (
              <p className="empty-note">No written comments yet.</p>
            )}
          </>
        )}
      </div>
    </details>
  );
}

interface InstructorRatingsProps {
  sections: OfferedSection[];
  /** Real course code like "MSE 250", or null for planner slots. */
  courseCode: string | null;
  /** Courses SFU lists as equivalent; their RMP comments are preferred over general ones. */
  equivalentCodes?: string[];
}

export function InstructorRatings({ sections, courseCode, equivalentCodes = [] }: InstructorRatingsProps) {
  if (!isRmpEnabled()) return null;

  const names = uniqueInstructorNames(sections.flatMap((section) => section.instructors));
  if (names.length === 0) return null;

  return (
    <section className="rmp-section" aria-label="Instructor ratings">
      <h4 className="rmp-heading">Instructor Ratings</h4>
      <p className="rmp-hint">Expand an instructor to load their ratings.</p>
      <div className="rmp-instructor-list">
        {names.map((name) => (
          <InstructorRatingItem
            key={`${name}|${courseCode ?? ""}`}
            name={name}
            courseCode={courseCode}
            equivalentCodes={equivalentCodes}
          />
        ))}
      </div>
      <p className="rmp-source">Source: RateMyProfessors (unofficial, may be incomplete)</p>
    </section>
  );
}
