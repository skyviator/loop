const DEFAULT_AUTH_DESTINATION = "/app";
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function hasSafePathShape(value: string) {
  return value.startsWith("/")
    && !value.startsWith("//")
    && !value.startsWith("/\\")
    && !value.includes("\\")
    && !CONTROL_CHARACTER.test(value);
}

function decodedPathIsSafe(value: string) {
  let decoded = value;
  for (let pass = 0; pass < 5; pass += 1) {
    if (!hasSafePathShape(decoded)) return false;
    const next = decodeURIComponent(decoded);
    if (next === decoded) return true;
    decoded = next;
  }
  return hasSafePathShape(decoded);
}

export function configuredApplicationOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) throw new Error("Auth callback is not configured.");

  const url = new URL(configured);
  const localHttp = url.protocol === "http:"
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  const originOnly = url.pathname === "/"
    && !url.search
    && !url.hash
    && !url.username
    && !url.password;
  if ((!localHttp && url.protocol !== "https:") || !originOnly) {
    throw new Error("Auth callback is not configured securely.");
  }

  return url.origin;
}

export function safeAuthDestination(value: string | null, origin: string) {
  if (!value) return DEFAULT_AUTH_DESTINATION;

  try {
    if (!decodedPathIsSafe(value)) return DEFAULT_AUTH_DESTINATION;
    const destination = new URL(value, origin);
    if (destination.origin !== origin) return DEFAULT_AUTH_DESTINATION;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return DEFAULT_AUTH_DESTINATION;
  }
}
