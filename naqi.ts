import type {
  AqiSeverityTier,
  AqiThemeMode,
  CityAqiReading,
  HourlyAqiPoint,
} from '../src/types/aqi.ts';

export interface CitySeed {
  id: string;
  name: string;
  country: string;
  region: string;
  lat: number;
  lon: number;
  isMainCity: boolean;
}

type Breakpoint = readonly [bLow: number, bHigh: number, iLow: number, iHigh: number];

const PM25_BP: readonly Breakpoint[] = [
  [0, 30, 0, 50],
  [30, 60, 51, 100],
  [60, 90, 101, 200],
  [90, 120, 201, 300],
  [120, 250, 301, 400],
  [250, 380, 401, 500],
];

const PM10_BP: readonly Breakpoint[] = [
  [0, 50, 0, 50],
  [50, 100, 51, 100],
  [100, 250, 101, 200],
  [250, 350, 201, 300],
  [350, 430, 301, 400],
  [430, 600, 401, 500],
];

const NO2_BP: readonly Breakpoint[] = [
  [0, 40, 0, 50],
  [40, 80, 51, 100],
  [80, 180, 101, 200],
  [180, 280, 201, 300],
  [280, 400, 301, 400],
  [400, 800, 401, 500],
];

const O3_BP: readonly Breakpoint[] = [
  [0, 50, 0, 50],
  [50, 100, 51, 100],
  [100, 168, 101, 200],
  [168, 208, 201, 300],
  [208, 748, 301, 400],
  [748, 1000, 401, 500],
];

// CO breakpoints in mg/m3 (8-hr CPCB standard)
const CO_BP: readonly Breakpoint[] = [
  [0, 1.0, 0, 50],
  [1.0, 2.0, 51, 100],
  [2.0, 10.0, 101, 200],
  [10.0, 17.0, 201, 300],
  [17.0, 34.0, 301, 400],
  [34.0, 68.0, 401, 500],
];

// SO2 breakpoints in ug/m3 (24-hr CPCB standard)
const SO2_BP: readonly Breakpoint[] = [
  [0, 40, 0, 50],
  [40, 80, 51, 100],
  [80, 380, 101, 200],
  [380, 800, 201, 300],
  [800, 1600, 301, 400],
  [1600, 2620, 401, 500],
];

/**
 * Computes an Indian CPCB NAQI sub-index using linear interpolation across
 * official concentration breakpoints.
 */
export function calcSubIndex(conc: number, breakpoints: readonly Breakpoint[]): number {
  if (!Number.isFinite(conc) || conc <= 0) return 0;
  for (const [bLow, bHigh, iLow, iHigh] of breakpoints) {
    if (conc <= bHigh) {
      return Math.round(((iHigh - iLow) / (bHigh - bLow)) * (conc - bLow) + iLow);
    }
  }
  return 500;
}

/**
 * Computes the overall Indian NAQI as the maximum sub-index across PM2.5, PM10,
 * NO2, O3, CO (ug/m3 converted to mg/m3), and SO2.
 */
export function computeIndiaNaqi(
  pm25: number,
  pm10: number,
  no2: number,
  o3: number,
  coUgM3 = 0,
  so2 = 0,
): number {
  const s1 = calcSubIndex(pm25, PM25_BP);
  const s2 = calcSubIndex(pm10, PM10_BP);
  const s3 = calcSubIndex(no2, NO2_BP);
  const s4 = calcSubIndex(o3, O3_BP);
  const s5 = calcSubIndex(coUgM3 > 0 ? coUgM3 / 1000 : 0, CO_BP);
  const s6 = calcSubIndex(so2, SO2_BP);
  return Math.max(s1, s2, s3, s4, s5, s6);
}

/**
 * Maps an Indian NAQI value to its official severity category, adaptive UI theme, and alert flag.
 */
export function classifyNaqi(naqi: number): {
  tier: AqiSeverityTier;
  theme: AqiThemeMode;
  isDangerous: boolean;
} {
  if (naqi <= 50) {
    return { tier: 'Good', theme: 'good', isDangerous: false };
  }
  if (naqi <= 100) {
    return { tier: 'Satisfactory', theme: 'good', isDangerous: false };
  }
  if (naqi <= 200) {
    return { tier: 'Moderate', theme: 'moderate', isDangerous: false };
  }
  if (naqi <= 300) {
    return { tier: 'Poor', theme: 'high', isDangerous: true };
  }
  if (naqi <= 400) {
    return { tier: 'Very Poor', theme: 'high', isDangerous: true };
  }
  return { tier: 'Severe', theme: 'high', isDangerous: true };
}

/**
 * Identifies the pollutant with the highest CPCB NAQI sub-index (official CPCB rule).
 */
export function getDominantPollutant(
  pm25: number,
  pm10: number,
  no2: number,
  o3: number,
  coUgM3 = 0,
  so2 = 0,
): string {
  const subIndices = [
    { name: 'PM2.5', subIndex: calcSubIndex(pm25, PM25_BP), ratio: pm25 / 30 },
    { name: 'PM10', subIndex: calcSubIndex(pm10, PM10_BP), ratio: pm10 / 50 },
    { name: 'NO₂', subIndex: calcSubIndex(no2, NO2_BP), ratio: no2 / 40 },
    { name: 'O₃', subIndex: calcSubIndex(o3, O3_BP), ratio: o3 / 50 },
    {
      name: 'CO',
      subIndex: calcSubIndex(coUgM3 > 0 ? coUgM3 / 1000 : 0, CO_BP),
      ratio: coUgM3 / 1000,
    },
    { name: 'SO₂', subIndex: calcSubIndex(so2, SO2_BP), ratio: so2 / 40 },
  ];
  subIndices.sort((a, b) => b.subIndex - a.subIndex || b.ratio - a.ratio);
  return subIndices[0].name;
}

const PPB_TO_UGM3_FACTORS: Record<string, number> = {
  no2: 1.882,
  o3: 1.963,
  so2: 2.62,
  co: 1.146,
  nh3: 0.697,
};

export function ppbToUgM3(code: string, ppb: number): number {
  if (!Number.isFinite(ppb) || ppb <= 0) return 0;
  const factor = PPB_TO_UGM3_FACTORS[code.toLowerCase()];
  if (!factor) return Number(ppb.toFixed(1));
  return Number((ppb * factor).toFixed(1));
}

export function formatPollutantName(code: string): string {
  const normalized = code.trim().toLowerCase();
  switch (normalized) {
    case 'pm25':
    case 'pm2_5':
      return 'PM2.5';
    case 'pm10':
      return 'PM10';
    case 'no2':
      return 'NO₂';
    case 'o3':
      return 'O₃';
    case 'co':
      return 'CO';
    case 'so2':
      return 'SO₂';
    case 'nh3':
      return 'NH₃';
    default:
      return code ? code.toUpperCase() : 'PM2.5';
  }
}

export function toSafeMetric(val: unknown): number {
  const n = Number(val ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number(n.toFixed(1));
}

export interface OpenMeteoHourlyPayload {
  time?: string[];
  pm2_5?: Array<number | null>;
  pm10?: Array<number | null>;
  nitrogen_dioxide?: Array<number | null>;
  ozone?: Array<number | null>;
  carbon_monoxide?: Array<number | null>;
  sulphur_dioxide?: Array<number | null>;
}

function avgWindow(values: Array<number | null> | undefined, endIdx: number, count: number): number | null {
  if (!values || values.length === 0 || endIdx < 0) return null;
  const startIdx = Math.max(0, endIdx - count + 1);
  let sum = 0;
  let valid = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const raw = values[i];
    if (raw !== null && raw !== undefined && Number.isFinite(raw) && raw >= 0) {
      sum += raw;
      valid++;
    }
  }
  return valid > 0 ? Number((sum / valid).toFixed(1)) : null;
}

/**
 * Computes CPCB-standard averaging windows (24h mean for PM2.5/PM10/NO2/SO2,
 * 8h mean for O3/CO) up to the latest completed/current hour in hourly telemetry.
 */
export function computeCpcbAveragesFromHourly(
  hourly: OpenMeteoHourlyPayload | undefined,
  currentTimeIso?: string,
): Partial<Record<'pm2_5' | 'pm10' | 'nitrogen_dioxide' | 'ozone' | 'carbon_monoxide' | 'sulphur_dioxide', number>> {
  const times = hourly?.time;
  if (!times || times.length === 0) return {};

  let endIdx = times.length - 1;
  if (currentTimeIso) {
    const exactIdx = times.indexOf(currentTimeIso);
    if (exactIdx !== -1) {
      endIdx = exactIdx;
    } else {
      const targetMs = Date.parse(currentTimeIso);
      if (Number.isFinite(targetMs)) {
        for (let i = times.length - 1; i >= 0; i--) {
          const tMs = Date.parse(times[i]);
          if (Number.isFinite(tMs) && tMs <= targetMs) {
            endIdx = i;
            break;
          }
        }
      }
    }
  }

  const out: Partial<
    Record<
      'pm2_5' | 'pm10' | 'nitrogen_dioxide' | 'ozone' | 'carbon_monoxide' | 'sulphur_dioxide',
      number
    >
  > = {};

  const pm25 = avgWindow(hourly?.pm2_5, endIdx, 24);
  const pm10 = avgWindow(hourly?.pm10, endIdx, 24);
  const no2 = avgWindow(hourly?.nitrogen_dioxide, endIdx, 24);
  const o3 = avgWindow(hourly?.ozone, endIdx, 8);
  const co = avgWindow(hourly?.carbon_monoxide, endIdx, 8);
  const so2 = avgWindow(hourly?.sulphur_dioxide, endIdx, 24);

  if (pm25 !== null) out.pm2_5 = pm25;
  if (pm10 !== null) out.pm10 = pm10;
  if (no2 !== null) out.nitrogen_dioxide = no2;
  if (o3 !== null) out.ozone = o3;
  if (co !== null) out.carbon_monoxide = co;
  if (so2 !== null) out.sulphur_dioxide = so2;

  return out;
}

export function buildCityReading(
  seed: CitySeed,
  current: Record<string, unknown>,
  hourly?: OpenMeteoHourlyPayload,
): CityAqiReading {
  const rawUsAqi = Number(current.us_aqi ?? 0);
  const usAqi = Number.isFinite(rawUsAqi) ? Math.max(0, Math.round(rawUsAqi)) : 0;

  const avg = computeCpcbAveragesFromHourly(
    hourly,
    typeof current.time === 'string' ? current.time : undefined,
  );

  const pm25 = toSafeMetric(avg.pm2_5 ?? current.pm2_5);
  const pm10 = toSafeMetric(avg.pm10 ?? current.pm10);
  const no2 = toSafeMetric(avg.nitrogen_dioxide ?? current.nitrogen_dioxide);
  const o3 = toSafeMetric(avg.ozone ?? current.ozone);
  const co = toSafeMetric(avg.carbon_monoxide ?? current.carbon_monoxide);
  const so2 = toSafeMetric(avg.sulphur_dioxide ?? current.sulphur_dioxide);
  const naqi = computeIndiaNaqi(pm25, pm10, no2, o3, co, so2);
  const { tier, theme, isDangerous } = classifyNaqi(naqi);

  return {
    ...seed,
    aqi: naqi,
    usAqi,
    pm25,
    pm10,
    no2,
    o3,
    co,
    so2,
    tier,
    theme,
    isDangerous,
    dominantPollutant: getDominantPollutant(pm25, pm10, no2, o3, co, so2),
    dataSource:
      Object.keys(avg).length > 0
        ? 'Open-Meteo · 24h/8h CPCB NAQI'
        : 'Open-Meteo · CPCB NAQI',
    updatedAt: String(current.time ?? new Date().toISOString()),
  };
}

export function formatHourLabel(isoTime: string): string {
  const parts = isoTime.split('T');
  if (parts.length < 2) return isoTime;
  return parts[1].slice(0, 5);
}

export function computeWindows(hourly: HourlyAqiPoint[]): {
  bestVentilationWindow: string;
  peakSmogWindow: string;
} {
  if (hourly.length === 0) {
    return {
      bestVentilationWindow: '13:00 – 16:00',
      peakSmogWindow: '06:00 – 09:00',
    };
  }

  let minPoint = hourly[0];
  let maxPoint = hourly[0];
  for (const pt of hourly) {
    if (pt.aqi < minPoint.aqi) minPoint = pt;
    if (pt.aqi > maxPoint.aqi) maxPoint = pt;
  }

  return {
    bestVentilationWindow: `${minPoint.hourLabel} (NAQI ~${minPoint.aqi})`,
    peakSmogWindow: `${maxPoint.hourLabel} (NAQI ~${maxPoint.aqi})`,
  };
}
