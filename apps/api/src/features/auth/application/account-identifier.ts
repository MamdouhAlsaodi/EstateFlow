const MAXIMUM_IDENTIFIER_BYTES = 254;
const MINIMUM_PASSWORD_CODE_POINTS = 12;
const MAXIMUM_PASSWORD_BYTES = 256;
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function normalizeAccountIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  return isValidAccountIdentifier(normalized) ? normalized : null;
}

export function isValidRegistrationPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    [...value].length >= MINIMUM_PASSWORD_CODE_POINTS &&
    Buffer.byteLength(value, "utf8") <= MAXIMUM_PASSWORD_BYTES
  );
}

export function isValidLoginPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= MAXIMUM_PASSWORD_BYTES
  );
}

function isValidAccountIdentifier(identifier: string): boolean {
  return (
    Buffer.byteLength(identifier, "utf8") <= MAXIMUM_IDENTIFIER_BYTES &&
    SIMPLE_EMAIL_PATTERN.test(identifier)
  );
}
