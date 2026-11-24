import type { AreaAqiStation, CityAqiReading, HourlyAqiPoint } from '../src/types/aqi.ts';
import {
  classifyNaqi,
  computeIndiaNaqi,
  formatPollutantName,
  getDominantPollutant,
  ppbToUgM3,
  toSafeMetric,
  type CitySeed,
} from './naqi.ts';

export interface GoogleAqIndex {
  code?: string;
  displayName?: string;
  aqi?: number;
  aqiDisplay?: string;
  category?: string;
  dominantPollutant?: string;
}

export interface GoogleAqPollutant {
  code?: string;
  concentration?: {
    value?: number;
    units?: string;
  };
}

export interface GoogleAqCondition {
  dateTime?: string;
  regionCode?: string;
  indexes?: GoogleAqIndex[];
  pollutants?: GoogleAqPollutant[];
}

export interface GoogleAqHistoryResponse {
  hoursInfo?: GoogleAqCondition[];
}

export function getMapsApiKey(): string {
  return process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
}

interface CurrentCacheEntry {
  expiresAt: number;
  data: GoogleAqCondition;
}

const currentConditionCache = new Map<string, CurrentCacheEntry>();
const staleConditionCache = new Map<string, GoogleAqCondition>();
let currentConditionsQuotaCooldownUntil = 0;

export function clearGoogleAqCache(): void {
  currentConditionCache.clear();
  staleConditionCache.clear();
  currentConditionsQuotaCooldownUntil = 0;
}

export async function mapInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      slice.map((item, offset) => fn(item, i + offset)),
    );
    results.push(...settled);
  }
  return results;
}

export function formatIstHourLabel(isoDateTime: string): string {
  const ts = Date.parse(isoDateTime);
  if (!Number.isFinite(ts)) {
    const parts = isoDateTime.split('T');
    return parts.length >= 2 ? parts[1].slice(0, 5) : isoDateTime;
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

export function extractPollutantsUgM3(pollutants: GoogleAqPollutant[] | undefined): {
  pm25: number;
  pm10: number;
  no2: number;
  o3: number;
  co: number;
  so2: number;
} {
  let pm25 = 0;
  let pm10 = 0;
  let no2 = 0;
  let o3 = 0;
  let co = 0;
  let so2 = 0;

  for (const item of pollutants ?? []) {
    const code = (item.code ?? '').toLowerCase();
    const rawVal = Number(item.concentration?.value ?? 0);
    if (!Number.isFinite(rawVal) || rawVal < 0) continue;

    const units = (item.concentration?.units ?? '').toUpperCase();
    const valUgM3 =
      units === 'PARTS_PER_BILLION' ? ppbToUgM3(code, rawVal) : toSafeMetric(rawVal);

    if (code === 'pm25') pm25 = valUgM3;
    else if (code === 'pm10') pm10 = valUgM3;
    else if (code === 'no2') no2 = valUgM3;
    else if (code === 'o3') o3 = valUgM3;
    else if (code === 'co') co = valUgM3;
    else if (code === 'so2') so2 = valUgM3;
  }

  return { pm25, pm10, no2, o3, co, so2 };
}

function meanOfPositive(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0) return null;
  return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1));
}

export function buildReadingFromGoogleAq(
  seed: CitySeed,
  condition: GoogleAqCondition,
  history?: GoogleAqHistoryResponse,
): CityAqiReading {
  const live = extractPollutantsUgM3(condition.pollutants);
  const indexes = condition.indexes ?? [];
  const indCpcb = indexes.find((idx) => idx.code === 'ind_cpcb');
  const uaqi = indexes.find((idx) => idx.code === 'uaqi');

  const sortedHours = [...(history?.hoursInfo ?? [])]
    .filter((h) => Boolean(h.dateTime))
    .sort((a, b) => Date.parse(a.dateTime ?? '') - Date.parse(b.dateTime ?? ''));

  let pm25 = live.pm25;
  let pm10 = live.pm10;
  let no2 = live.no2;
  let o3 = live.o3;
  let co = live.co;
  let so2 = live.so2;

  if (sortedHours.length > 0) {
    const extracted = sortedHours.map((h) => extractPollutantsUgM3(h.pollutants));
    const avg24 = {
      pm25: meanOfPositive([...extracted.map((e) => e.pm25), live.pm25]),
      pm10: meanOfPositive([...extracted.map((e) => e.pm10), live.pm10]),
      no2: meanOfPositive([...extracted.map((e) => e.no2), live.no2]),
      so2: meanOfPositive([...extracted.map((e) => e.so2), live.so2]),
      o3: meanOfPositive([...extracted.slice(-7).map((e) => e.o3), live.o3]),
      co: meanOfPositive([...extracted.slice(-7).map((e) => e.co), live.co]),
    };
    if (avg24.pm25 !== null) pm25 = avg24.pm25;
    if (avg24.pm10 !== null) pm10 = avg24.pm10;
    if (avg24.no2 !== null) no2 = avg24.no2;
    if (avg24.o3 !== null) o3 = avg24.o3;
    if (avg24.co !== null) co = avg24.co;
    if (avg24.so2 !== null) so2 = avg24.so2;
  }

  const rawNaqi =
    typeof indCpcb?.aqi === 'number' && Number.isFinite(indCpcb.aqi)
      ? Math.max(0, Math.round(indCpcb.aqi))
      : computeIndiaNaqi(pm25, pm10, no2, o3, co, so2);

  const { tier, theme, isDangerous } = classifyNaqi(rawNaqi);
  const dominantPollutant = indCpcb?.dominantPollutant
    ? formatPollutantName(indCpcb.dominantPollutant)
    : getDominantPollutant(pm25, pm10, no2, o3, co, so2);

  const usAqi =
    typeof uaqi?.aqi === 'number' && Number.isFinite(uaqi.aqi)
      ? Math.max(0, Math.round(uaqi.aqi))
      : 0;

  return {
    ...seed,
    aqi: rawNaqi,
    usAqi,
    pm25,
    pm10,
    no2,
    livePm25: live.pm25,
    livePm10: live.pm10,
    liveNo2: live.no2,
    o3,
    co,
    so2,
    tier,
    theme,
    isDangerous,
    dominantPollutant,
    dataSource: 'Google Air Quality · CPCB NAQI (IN)',
    updatedAt: condition.dateTime ?? new Date().toISOString(),
  };
}

export function buildAreaFromGoogleAq(
  id: string,
  areaName: string,
  zoneLabel: string,
  lat: number,
  lon: number,
  condition: GoogleAqCondition,
): AreaAqiStation {
  const { pm25, pm10, no2, o3, co, so2 } = extractPollutantsUgM3(condition.pollutants);
  const indCpcb = (condition.indexes ?? []).find((idx) => idx.code === 'ind_cpcb');

  const naqi =
    typeof indCpcb?.aqi === 'number' && Number.isFinite(indCpcb.aqi)
      ? Math.max(0, Math.round(indCpcb.aqi))
      : computeIndiaNaqi(pm25, pm10, no2, o3, co, so2);

  const { tier, theme } = classifyNaqi(naqi);
  const dominantPollutant = indCpcb?.dominantPollutant
    ? formatPollutantName(indCpcb.dominantPollutant)
    : getDominantPollutant(pm25, pm10, no2, o3, co, so2);

  return {
    id,
    areaName,
    zoneLabel,
    lat,
    lon,
    aqi: naqi,
    pm25,
    pm10,
    no2,
    tier,
    theme,
    dominantPollutant,
  };
}

export function buildHourlyFromGoogleAq(history: GoogleAqHistoryResponse): HourlyAqiPoint[] {
  const sorted = [...(history.hoursInfo ?? [])]
    .filter((h) => Boolean(h.dateTime))
    .sort((a, b) => Date.parse(a.dateTime ?? '') - Date.parse(b.dateTime ?? ''));

  return sorted.map((hour) => {
    const time = hour.dateTime ?? '';
    const { pm25, pm10, no2, o3, co, so2 } = extractPollutantsUgM3(hour.pollutants);
    const hasPollutants = pm25 > 0 || pm10 > 0 || no2 > 0 || o3 > 0 || co > 0 || so2 > 0;
    const indCpcb = (hour.indexes ?? []).find((idx) => idx.code === 'ind_cpcb');
    const aqi = hasPollutants
      ? computeIndiaNaqi(pm25, pm10, no2, o3, co, so2)
      : typeof indCpcb?.aqi === 'number' && Number.isFinite(indCpcb.aqi)
        ? Math.max(0, Math.round(indCpcb.aqi))
        : 0;

    return {
      time,
      hourLabel: formatIstHourLabel(time),
      aqi,
      pm25,
    };
  });
}

async function fetchLatestViaHistory(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<GoogleAqCondition> {
  const res = await fetch(
    `https://airquality.googleapis.com/v1/history:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
      body: JSON.stringify({
        location: { latitude: lat, longitude: lon },
        hours: 1,
        pageSize: 1,
        extraComputations: ['LOCAL_AQI', 'POLLUTANT_CONCENTRATION'],
        customLocalAqis: [{ regionCode: 'IN', aqi: 'ind_cpcb' }],
      }),
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!res.ok) {
    throw new Error(`Google Air Quality history fallback returned ${res.status}`);
  }

  const payload = (await res.json()) as GoogleAqHistoryResponse;
  const latest = payload.hoursInfo?.[0];
  if (!latest) {
    throw new Error('Google Air Quality history returned no hourly data');
  }
  return latest;
}

export async function fetchGoogleCurrentAqi(
  lat: number,
  lon: number,
  apiKey: string,
  options: { fresh?: boolean } = {},
): Promise<GoogleAqCondition> {
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (!options.fresh) {
    const cached = currentConditionCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
  }

  let data: GoogleAqCondition | null = null;

  if (Date.now() >= currentConditionsQuotaCooldownUntil) {
    try {
      const res = await fetch(
        `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${encodeURIComponent(
          apiKey,
        )}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
          },
          body: JSON.stringify({
            location: { latitude: lat, longitude: lon },
            universalAqi: true,
            extraComputations: [
              'LOCAL_AQI',
              'POLLUTANT_CONCENTRATION',
              'DOMINANT_POLLUTANT_CONCENTRATION',
            ],
            customLocalAqis: [{ regionCode: 'IN', aqi: 'ind_cpcb' }],
          }),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (res.status === 429) {
        currentConditionsQuotaCooldownUntil = Date.now() + 15 * 60 * 1000;
      } else if (res.ok) {
        data = (await res.json()) as GoogleAqCondition;
      }
    } catch {
      // Fall through to history:lookup fallback
    }
  }

  if (!data) {
    try {
      data = await fetchLatestViaHistory(lat, lon, apiKey);
    } catch (err) {
      const stale = staleConditionCache.get(cacheKey);
      if (stale) {
        return stale;
      }
      throw err;
    }
  }

  currentConditionCache.set(cacheKey, {
    expiresAt: Date.now() + 2 * 60 * 1000,
    data,
  });
  staleConditionCache.set(cacheKey, data);
  return data;
}

export async function fetchGoogleHistoryAqi(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<GoogleAqHistoryResponse> {
  const res = await fetch(
    `https://airquality.googleapis.com/v1/history:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
      body: JSON.stringify({
        location: { latitude: lat, longitude: lon },
        hours: 24,
        pageSize: 24,
        extraComputations: ['LOCAL_AQI', 'POLLUTANT_CONCENTRATION'],
        customLocalAqis: [{ regionCode: 'IN', aqi: 'ind_cpcb' }],
      }),
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!res.ok) {
    throw new Error(`Google Air Quality history returned ${res.status}`);
  }

  return (await res.json()) as GoogleAqHistoryResponse;
}
