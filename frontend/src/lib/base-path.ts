// The prefix the app is served under: the HA Ingress path, or "" when reached
// directly. The backend injects it into index.html; the Vite dev server doesn't,
// so it falls back to "".
export const BASE_PATH = window.__BASE_PATH__ ?? ''

export const apiUrl = (path: string) => `${BASE_PATH}${path}`
