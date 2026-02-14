export const getBackendBaseURL = () => {
  const envUrl = (import.meta as any).env.VITE_SOCKET_URL;
  if (envUrl) return envUrl;

  if (typeof window !== "undefined" && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
};

