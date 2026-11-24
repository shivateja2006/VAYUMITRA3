import type { CityAqiReading } from '../src/types/aqi.ts';
import {
  buildReadingFromGoogleAq,
  clearGoogleAqCache,
  fetchGoogleCurrentAqi,
  getMapsApiKey,
  mapInBatches,
} from './googleAq.ts';
import {
  buildCityReading,
  type CitySeed,
  type OpenMeteoHourlyPayload,
} from './naqi.ts';

export const INDIAN_CITIES: CitySeed[] = [
  { id: 'delhi', name: 'Delhi', country: 'India', region: 'NCR · North', lat: 28.6139, lon: 77.209, isMainCity: true },
  { id: 'mumbai', name: 'Mumbai', country: 'India', region: 'Maharashtra · West', lat: 19.0653, lon: 72.8681, isMainCity: true },
  { id: 'bengaluru', name: 'Bengaluru', country: 'India', region: 'Karnataka · South', lat: 12.9716, lon: 77.5946, isMainCity: true },
  { id: 'hyderabad', name: 'Hyderabad', country: 'India', region: 'Telangana · South', lat: 17.385, lon: 78.4867, isMainCity: true },
  { id: 'chennai', name: 'Chennai', country: 'India', region: 'Tamil Nadu · South', lat: 13.0827, lon: 80.2707, isMainCity: true },
  { id: 'kolkata', name: 'Kolkata', country: 'India', region: 'West Bengal · East', lat: 22.5726, lon: 88.3639, isMainCity: true },
  { id: 'pune', name: 'Pune', country: 'India', region: 'Maharashtra · West', lat: 18.5204, lon: 73.8567, isMainCity: true },
  { id: 'ahmedabad', name: 'Ahmedabad', country: 'India', region: 'Gujarat · West', lat: 23.0225, lon: 72.5714, isMainCity: true },
  { id: 'kochi', name: 'Kochi', country: 'India', region: 'Kerala · South', lat: 9.9312, lon: 76.2673, isMainCity: true },
  { id: 'gurugram', name: 'Gurugram', country: 'India', region: 'Haryana · NCR', lat: 28.4595, lon: 77.0266, isMainCity: false },
  { id: 'noida', name: 'Noida', country: 'India', region: 'Uttar Pradesh · NCR', lat: 28.5355, lon: 77.391, isMainCity: false },
  { id: 'lucknow', name: 'Lucknow', country: 'India', region: 'Uttar Pradesh · North', lat: 26.8467, lon: 80.9462, isMainCity: false },
  { id: 'patna', name: 'Patna', country: 'India', region: 'Bihar · East', lat: 25.5941, lon: 85.1376, isMainCity: false },
  { id: 'jaipur', name: 'Jaipur', country: 'India', region: 'Rajasthan · North', lat: 26.9124, lon: 75.7873, isMainCity: false },
  { id: 'chandigarh', name: 'Chandigarh', country: 'India', region: 'North India', lat: 30.7333, lon: 76.7794, isMainCity: false },
];

export interface AreaPreset {
  areaName: string;
  zoneLabel: string;
  dLat: number;
  dLon: number;
}

export const CITY_AREA_PRESETS: Record<string, AreaPreset[]> = {
  delhi: [
    { areaName: 'Connaught Place', zoneLabel: 'Central Delhi', dLat: 0.015, dLon: 0.01 },
    { areaName: 'Anand Vihar', zoneLabel: 'East Transit Hub', dLat: 0.032, dLon: 0.106 },
    { areaName: 'Rohini Sector 16', zoneLabel: 'North-West', dLat: 0.124, dLon: -0.095 },
    { areaName: 'Dwarka Sector 8', zoneLabel: 'South-West', dLat: -0.048, dLon: -0.145 },
    { areaName: 'Okhla Phase II', zoneLabel: 'South-East Industrial', dLat: -0.075, dLon: 0.062 },
    { areaName: 'Punjabi Bagh', zoneLabel: 'West Delhi', dLat: 0.056, dLon: -0.078 },
    { areaName: 'RK Puram', zoneLabel: 'South Delhi', dLat: -0.048, dLon: -0.032 },
    { areaName: 'Civil Lines', zoneLabel: 'North Delhi', dLat: 0.066, dLon: 0.016 },
    { areaName: 'IGI Terminal 3', zoneLabel: 'Airport Corridor', dLat: -0.057, dLon: -0.111 },
  ],
  mumbai: [
    { areaName: 'Colaba', zoneLabel: 'South Peninsula', dLat: -0.16, dLon: -0.05 },
    { areaName: 'Bandra Kurla Complex', zoneLabel: 'Central Business', dLat: -0.01, dLon: -0.01 },
    { areaName: 'Andheri West', zoneLabel: 'Western Suburbs', dLat: 0.058, dLon: -0.044 },
    { areaName: 'Powai', zoneLabel: 'Lake & East Hills', dLat: 0.042, dLon: 0.028 },
    { areaName: 'Chembur', zoneLabel: 'Eastern Refinery Belt', dLat: -0.018, dLon: 0.022 },
    { areaName: 'Borivali East', zoneLabel: 'North National Park', dLat: 0.154, dLon: -0.016 },
    { areaName: 'Worli Sea Face', zoneLabel: 'Coastal West', dLat: -0.074, dLon: -0.062 },
    { areaName: 'Mulund West', zoneLabel: 'North-East Suburb', dLat: 0.096, dLon: 0.078 },
    { areaName: 'Navi Mumbai Vashi', zoneLabel: 'Trans-Harbour', dLat: 0.002, dLon: 0.118 },
  ],
  bengaluru: [
    { areaName: 'MG Road', zoneLabel: 'Central Core', dLat: 0.004, dLon: 0.012 },
    { areaName: 'Whitefield', zoneLabel: 'East IT Corridor', dLat: -0.002, dLon: 0.155 },
    { areaName: 'Electronic City', zoneLabel: 'South Highway', dLat: -0.128, dLon: 0.072 },
    { areaName: 'Hebbal', zoneLabel: 'North Flyover', dLat: 0.064, dLon: -0.002 },
    { areaName: 'Peenya Industrial', zoneLabel: 'North-West', dLat: 0.058, dLon: -0.078 },
    { areaName: 'Jayanagar', zoneLabel: 'South Residential', dLat: -0.044, dLon: -0.012 },
    { areaName: 'Koramangala', zoneLabel: 'South-East', dLat: -0.036, dLon: 0.032 },
    { areaName: 'Yelahanka', zoneLabel: 'Outer North', dLat: 0.128, dLon: 0.002 },
    { areaName: 'Kengeri', zoneLabel: 'South-West', dLat: -0.064, dLon: -0.11 },
  ],
  kochi: [
    { areaName: 'Fort Kochi', zoneLabel: 'Coastal Heritage', dLat: 0.034, dLon: -0.026 },
    { areaName: 'Marine Drive', zoneLabel: 'Ernakulam Core', dLat: 0.044, dLon: 0.006 },
    { areaName: 'Kakkanad Infopark', zoneLabel: 'East Tech Hub', dLat: 0.078, dLon: 0.088 },
    { areaName: 'Edappally', zoneLabel: 'North Junction', dLat: 0.094, dLon: 0.041 },
    { areaName: 'Vyttila Mobility Hub', zoneLabel: 'Central Transit', dLat: 0.036, dLon: 0.052 },
    { areaName: 'Eloor Industrial', zoneLabel: 'North River Belt', dLat: 0.144, dLon: 0.025 },
    { areaName: 'Aluva', zoneLabel: 'Periyar Basin', dLat: 0.175, dLon: 0.084 },
    { areaName: 'Tripunithura', zoneLabel: 'South-East', dLat: 0.014, dLon: 0.081 },
    { areaName: 'Willingdon Island', zoneLabel: 'Port Harbour', dLat: 0.024, dLon: 0.004 },
  ],
};

export function getGenericAreaPresets(cityName: string): AreaPreset[] {
  return [
    { areaName: `${cityName} Central`, zoneLabel: 'City Core', dLat: 0, dLon: 0 },
    { areaName: `${cityName} North`, zoneLabel: 'Northern Sector', dLat: 0.065, dLon: 0 },
    { areaName: `${cityName} North-East`, zoneLabel: 'NE Corridor', dLat: 0.05, dLon: 0.055 },
    { areaName: `${cityName} East`, zoneLabel: 'Eastern Zone', dLat: 0, dLon: 0.07 },
    { areaName: `${cityName} South-East`, zoneLabel: 'SE Industrial', dLat: -0.05, dLon: 0.055 },
    { areaName: `${cityName} South`, zoneLabel: 'Southern Sector', dLat: -0.065, dLon: 0 },
    { areaName: `${cityName} South-West`, zoneLabel: 'SW Residential', dLat: -0.05, dLon: -0.055 },
    { areaName: `${cityName} West`, zoneLabel: 'Western Zone', dLat: 0, dLon: -0.07 },
    { areaName: `${cityName} North-West`, zoneLabel: 'NW Transit', dLat: 0.05, dLon: -0.055 },
  ];
}

interface CitiesCache {
  expiresAt: number;
  cities: CityAqiReading[];
}

let citiesCache: CitiesCache | null = null;

export function clearCitiesCache(): void {
  citiesCache = null;
  clearGoogleAqCache();
}

export async function fetchIndianCities(
  options: { fresh?: boolean } = {},
): Promise<CityAqiReading[]> {
  if (!options.fresh && citiesCache && Date.now() < citiesCache.expiresAt) {
    return citiesCache.cities;
  }

  const mapsKey = getMapsApiKey();
  const googleByCityId = new Map<string, CityAqiReading>();

  if (mapsKey) {
    try {
      const settled = await mapInBatches(INDIAN_CITIES, 5, async (seed) => {
        const cond = await fetchGoogleCurrentAqi(seed.lat, seed.lon, mapsKey, {
          fresh: options.fresh,
        });
        return buildReadingFromGoogleAq(seed, cond);
      });
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          googleByCityId.set(result.value.id, result.value);
        }
      }

      if (googleByCityId.size === INDIAN_CITIES.length) {
        const allGoogle = Array.from(googleByCityId.values()).sort((a, b) => b.aqi - a.aqi);
        citiesCache = {
          expiresAt: Date.now() + 2 * 60 * 1000,
          cities: allGoogle,
        };
        return allGoogle;
      }
    } catch {
      // Fall through to per-city Open-Meteo fallback for missing cities
    }
  }

  const missingCities = INDIAN_CITIES.filter((c) => !googleByCityId.has(c.id));
  const fallbackById = new Map<string, CityAqiReading>();

  if (missingCities.length > 0) {
    const lats = missingCities.map((c) => c.lat).join(',');
    const lons = missingCities.map((c) => c.lon).join(',');
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide&hourly=pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide&past_days=1&forecast_days=1&timezone=Asia/Kolkata`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      if (googleByCityId.size === 0) {
        throw new Error(`Open-Meteo Air Quality API returned status ${response.status}`);
      }
    } else {
      const payload = (await response.json()) as unknown;
      const items = Array.isArray(payload) ? payload : [payload];
      missingCities.forEach((seed, index) => {
        const entry = (items[index] ?? {}) as {
          current?: Record<string, unknown>;
          hourly?: OpenMeteoHourlyPayload;
        };
        fallbackById.set(seed.id, buildCityReading(seed, entry.current ?? {}, entry.hourly));
      });
    }
  }

  const readings = INDIAN_CITIES.map(
    (seed) => googleByCityId.get(seed.id) ?? fallbackById.get(seed.id),
  ).filter((r): r is CityAqiReading => Boolean(r));

  readings.sort((a, b) => b.aqi - a.aqi);

  citiesCache = {
    expiresAt: Date.now() + 2 * 60 * 1000,
    cities: readings,
  };

  return readings;
}

export async function reverseGeocodeName(
  lat: number,
  lon: number,
): Promise<{ name: string; country: string; region: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Vayumitra-AirQualityAssistant/1.0',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        address?: {
          city?: string;
          town?: string;
          village?: string;
          state_district?: string;
          state?: string;
          country?: string;
        };
      };
      const addr = data.address ?? {};
      const city = addr.city || addr.town || addr.village || addr.state_district || addr.state;
      if (city) {
        return {
          name: city,
          country: addr.country ?? 'India',
          region: addr.state ?? 'India',
        };
      }
    }
  } catch {
    // Fall back cleanly to coordinate label
  }
  return {
    name: `Location (${lat.toFixed(2)}, ${lon.toFixed(2)})`,
    country: 'India',
    region: 'Local Sensor Grid',
  };
}
