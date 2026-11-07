/**
 * Since we haven't implemented authentication, use randomly generated user ID stored in localStorage as a placeholder
 */
const USER_ID_KEY = "userId";

export function generateAndSetUserId(): string {
  const id = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, id);
  return id;
}

export function getUserId(): string {
  const userId = localStorage.getItem(USER_ID_KEY);

  if (!userId) return generateAndSetUserId();

  return userId;
}
