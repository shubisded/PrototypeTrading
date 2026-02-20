const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, "");

export const getBackendBaseURL = (): string => {
  const env = (import.meta as any).env || {};
  const configured = env.VITE_BACKEND_URL || env.VITE_SOCKET_URL;
  if (configured) return normalizeBaseUrl(String(configured));

  if (typeof window !== "undefined" && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
};
