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

export function isLikelySysId(value: string): boolean {
  return /^[a-f0-9]{32}$/i.test(value.trim());
}

export function decodeHtmlEntities(value: string): string {
  const htmlEntityMap: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (entity) => {
    const token = entity.slice(1, -1);
    const mapped = htmlEntityMap[token.toLowerCase()];
    if (mapped !== undefined) {
      return mapped;
    }

    if (/^#x[0-9a-fA-F]+$/.test(token)) {
      const codePoint = Number.parseInt(token.slice(2), 16);
      if (Number.isNaN(codePoint) || codePoint > 0x10ffff) {
        return entity;
      }
      return String.fromCodePoint(codePoint);
    }

    if (/^#\d+$/.test(token)) {
      const codePoint = Number.parseInt(token.slice(1), 10);
      if (Number.isNaN(codePoint) || codePoint > 0x10ffff) {
        return entity;
      }
      return String.fromCodePoint(codePoint);
    }

    return entity;
  });
}
