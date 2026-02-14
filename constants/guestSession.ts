const GUEST_ID_STORAGE_KEY = "sp_guest_id";

const fallbackGuestId = () =>
  `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const getOrCreateGuestId = () => {
  try {
    const existing = localStorage.getItem(GUEST_ID_STORAGE_KEY);
    if (existing) return existing;

    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `guest-${crypto.randomUUID()}`
        : fallbackGuestId();
    localStorage.setItem(GUEST_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return fallbackGuestId();
  }
};

