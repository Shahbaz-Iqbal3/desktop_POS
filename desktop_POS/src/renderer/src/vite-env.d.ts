/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANDING_PAGE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
