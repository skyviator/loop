export function authCookieOptions() {
  return { secure: process.env.NODE_ENV === "production" };
}
