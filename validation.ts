export const ALLOWED_AQ_MAP_TYPES = new Set([
  'IND_CPCB',
  'US_AQI',
  'UAQI_RED_GREEN',
  'PM25_INDIGO_PERSIAN',
]);

/**
 * Parses and bounds-checks geographic latitude/longitude inputs.
 */
export function parseLatLon(
  rawLat: unknown,
  rawLon: unknown,
): { lat: number; lon: number } | null {
  if (
    rawLat === undefined ||
    rawLat === null ||
    rawLat === '' ||
    rawLon === undefined ||
    rawLon === null ||
    rawLon === ''
  ) {
    return null;
  }
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }
  return { lat, lon };
}

/**
 * Strips ASCII control characters, trims whitespace, and caps string length
 * before interpolation into downstream prompts or telemetry labels.
 */
export function sanitizeText(value: unknown, maxLength: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLength);
}

export interface SanitizedChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function sanitizeChatHistory(history: unknown): SanitizedChatTurn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (item): item is { role?: unknown; content?: unknown } =>
        Boolean(item) && typeof item === 'object',
    )
    .map((item) => ({
      role: (item.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: sanitizeText(item.content, 600),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-4);
}
