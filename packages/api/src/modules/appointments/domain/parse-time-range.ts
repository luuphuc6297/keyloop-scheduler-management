const TSTZRANGE_RE = /^[\[\(]"?([^",\]\)]+)"?,\s*"?([^",\]\)]+)"?[\]\)]$/;

export interface ParsedTstzrange {
  startAtIso: string;
  endAtIso: string;
}

export function parseTstzrange(literal: string): ParsedTstzrange {
  const match = TSTZRANGE_RE.exec(literal);
  if (!match) {
    throw new Error(`Could not parse tstzrange literal: ${literal}`);
  }
  const startAtIso = new Date(match[1]!.replace(' ', 'T')).toISOString();
  const endAtIso = new Date(match[2]!.replace(' ', 'T')).toISOString();
  return { startAtIso, endAtIso };
}

export function extractLowerBound(literal: string): string {
  const match = TSTZRANGE_RE.exec(literal);
  if (!match) {
    throw new Error(`Could not parse tstzrange literal: ${literal}`);
  }
  return match[1]!;
}
