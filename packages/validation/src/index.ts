export class ValidationError extends Error {}

export function requiredText(value: unknown, label: string, max = 160) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new ValidationError(`${label} is required.`);
  return text;
}

export function emailAddress(value: unknown) {
  const email = requiredText(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Enter a valid email address.");
  }
  return email;
}

export function uuid(value: unknown, label = "Selection") {
  const id = requiredText(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ValidationError(`${label} is invalid.`);
  }
  return id;
}

export function oneOf<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
) {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`${label} is invalid.`);
  }
  return value as T;
}
