const KEY = 'bridgeQuizUser';

export function getSessionUser() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSessionUser(user) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearSessionUser() {
  localStorage.removeItem(KEY);
}
