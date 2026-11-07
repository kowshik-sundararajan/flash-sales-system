export const USERNAME_HINT = "Use 3 to 32 letters and digits";

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9]{3,32}$/i.test(username);
}
