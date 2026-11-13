/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the RMP proxy, e.g. "https://mse-rmp-proxy.onrender.com/api/rmp". */
  readonly VITE_RMP_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
