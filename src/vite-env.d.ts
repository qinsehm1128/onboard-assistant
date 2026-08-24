/// <reference types="vite/client" />

interface DesktopUpdatePayload {
  phase?: "idle" | "checking" | "available" | "downloading" | "ready" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

interface Window {
  onboardDesktop?: {
    isDesktop: boolean;
    checkUpdate?: () => Promise<{
      currentVersion: string;
      latestVersion?: string;
      available?: boolean;
      error?: string;
    }>;
    downloadUpdate?: () => Promise<{ ok: boolean; error?: string }>;
    installUpdate?: () => Promise<void>;
    onUpdate?: (callback: (payload: DesktopUpdatePayload) => void) => () => void;
  };
}
