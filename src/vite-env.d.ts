/// <reference types="vite/client" />

interface Window {
  onboardDesktop?: {
    isDesktop: boolean;
    checkUpdate?: () => Promise<{ currentVersion: string; latestVersion?: string; available?: boolean }>;
    downloadUpdate?: () => Promise<{ ok: boolean }>;
    installUpdate?: () => Promise<void>;
  };
}
