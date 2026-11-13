/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the RMP proxy, e.g. "https://mse-rmp-proxy.onrender.com/api/rmp". */
  readonly VITE_RMP_API_URL?: string;
  /** Google Apps Script web app /exec URL for bug reports (see apps-script/bugReport.gs). */
  readonly VITE_BUG_REPORT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
