/** Locally unique, sortable-by-time id (no network or native crypto needed). */
export const newId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
