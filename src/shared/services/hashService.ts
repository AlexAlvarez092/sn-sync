import { createHash } from "node:crypto";

export function hashText(value: string): string {
  const normalizedValue = value.replace(/\r\n?/g, "\n");
  return `sha256:${createHash("sha256").update(normalizedValue, "utf8").digest("hex")}`;
}
