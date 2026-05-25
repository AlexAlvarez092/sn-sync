export function normalizeOptionalString(
  value: unknown,
  allowEmpty = false,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (!allowEmpty && !normalized) {
    return undefined;
  }

  return normalized;
}
