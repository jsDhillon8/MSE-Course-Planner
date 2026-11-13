/**
 * Bug reports go to a Google Apps Script web app (see apps-script/bugReport.gs),
 * which appends them to a Google Sheet. URL comes from VITE_BUG_REPORT_URL at build time;
 * without it the "Report bug" button is hidden.
 */
const BUG_REPORT_URL: string | null = import.meta.env.VITE_BUG_REPORT_URL?.trim() || null;

export function isBugReportEnabled(): boolean {
  return BUG_REPORT_URL !== null;
}

export interface BugReportPayload {
  summary: string;
  description: string;
  steps: string;
  page: string;
  theme: string;
  viewport: string;
  userAgent: string;
  /** Honeypot: must stay empty. */
  website: string;
}

export async function submitBugReport(payload: BugReportPayload): Promise<void> {
  if (!BUG_REPORT_URL) throw new Error("Bug reporting is not configured.");

  // text/plain keeps this a "simple" request, so the browser skips the CORS preflight
  // that Apps Script can't respond to. Apps Script always returns 200; check the body.
  const res = await fetch(BUG_REPORT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);

  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(data.error || "Could not send the report.");
}
