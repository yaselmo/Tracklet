/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO: string;
  readonly VITE_API_HOST?: string;
  readonly VITE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface TrackletElectronBridge {
  isElectron: boolean;
  apiHost?: string;
  openCreateSuperuser?: () => Promise<{
    ok: boolean;
    cancelled?: boolean;
    backendDir?: string;
    error?: string;
  }>;
  openCreateBackup?: () => Promise<{
    ok: boolean;
    cancelled?: boolean;
    backendDir?: string;
    backupDir?: string;
    files?: string[];
    error?: string;
  }>;
  platform?: string;
  versions?: {
    chrome: string;
    electron: string;
    node: string;
  };
}

// Version information is replaced at build time
declare const __INVENTREE_LIB_VERSION__: string;
declare const __INVENTREE_REACT_VERSION__: string;
declare const __INVENTREE_REACT_DOM_VERSION__: string;
declare const __INVENTREE_MANTINE_VERSION__: string;
