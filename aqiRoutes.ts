import { Router } from 'express';
import type { AreaAqiStation, HourlyAqiPoint, LocationDetail } from '../../src/types/aqi.ts';
import {
  buildCityReading,
  classifyNaqi,
  computeCpcbAveragesFromHourly,
  computeIndiaNaqi,
  computeWindows,
  formatHourLabel,
  getDominantPollutant,
  type CitySeed,
  type OpenMeteoHourlyPayload,
} from '../naqi.ts';
import {
  CITY_AREA_PRESETS,
  fetchIndianCities,
  getGenericAreaPresets,
  reverseGeocodeName,
} from '../cities.ts';
import {
  buildAreaFromGoogleAq,
  buildHourlyFromGoogleAq,
  buildReadingFromGoogleAq,
  fetchGoogleCurrentAqi,
  fetchGoogleHistoryAqi,
  getMapsApiKey,
  mapInBatches,
} from '../googleAq.ts';
import { parseLatLon, sanitizeText } from '../validation.ts';

/**
 * Creates Express router for live Indian CPCB NAQI city feeds, neighborhood zones,
 * location detail telemetry, and India-only city search.
 */
export function createAqiRouter(): Router {
  const router = Router();

  router.get('/aqi/cities', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
      const fresh = req.query.fresh === 'true';
      const cities = await fetchIndianCities({ fresh });
      res.json({
        cities,
        dangerousCount: cities.filter((c) => c.isDangerous).length,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load Indian city AQI data';
      res.status(502).json({ error: message });
    }
  });

  router.get('/aqi/areas', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const parsedCoords = parseLatLon(req.query.lat, req.query.lon);
    if (!parsedCoords) {
      res.status(400).json({ error: 'Valid lat and lon parameters are required.' });
      return;
    }

    const { lat, lon } = parsedCoords;
    const cityId = sanitizeText(req.query.cityId, 40).toLowerCase();
    const cityName = sanitizeText(req.query.name, 80, 'Selected City');

    const presets = CITY_AREA_PRESETS[cityId] ?? getGenericAreaPresets(cityName);
    const coords = presets.map((p) => ({
      ...p,
      lat: Number((lat + p.dLat).toFixed(4)),
      lon: Number((lon + p.dLon).toFixed(4)),
    }));

    try {
      const mapsKey = getMapsApiKey();
      if (mapsKey) {
        try {
          const settled = await mapInBatches(coords, 5, async (c, idx) => {
            const cond = await fetchGoogleCurrentAqi(c.lat, c.lon, mapsKey);
            return buildAreaFromGoogleAq(
              `area-${cityId || 'custom'}-${idx}`,
              c.areaName,
              c.zoneLabel,
              c.lat,
              c.lon,
              cond,
            );
          });
          const googleAreas = settled
            .filter((r): r is PromiseFulfilledResult<AreaAqiStation> => r.status === 'fulfilled')
            .map((r) => r.value);

          if (googleAreas.length === coords.length) {
            googleAreas.sort((a, b) => b.aqi - a.aqi);
            res.json({ areas: googleAreas });
            return;
          }
        } catch {
          // Fall back cleanly to Open-Meteo CPCB-averaged feed
        }
      }

      const lats = coords.map((c) => c.lat).join(',');
      const lons = coords.map((c) => c.lon).join(',');
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide&hourly=pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide&past_days=1&forecast_days=1&timezone=Asia/Kolkata`;

      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        throw new Error(`Open-Meteo Area API returned ${response.status}`);
      }
      const payload = (await response.json()) as unknown;
      const items = Array.isArray(payload) ? payload : [payload];

      const areas: AreaAqiStation[] = coords.map((c, idx) => {
        const entry = (items[idx] ?? {}) as {
          current?: Record<string, unknown>;
          hourly?: OpenMeteoHourlyPayload;
        };
        const current = entry.current ?? {};
        const avg = computeCpcbAveragesFromHourly(
          entry.hourly,
          typeof current.time === 'string' ? current.time : undefined,
        );
        const pm25 = Number(Number(avg.pm2_5 ?? current.pm2_5 ?? 0).toFixed(1));
        const pm10 = Number(Number(avg.pm10 ?? current.pm10 ?? 0).toFixed(1));
        const no2 = Number(
          Number(avg.nitrogen_dioxide ?? current.nitrogen_dioxide ?? 0).toFixed(1),
        );
        const o3 = Number(Number(avg.ozone ?? current.ozone ?? 0).toFixed(1));
        const co = Number(Number(avg.carbon_monoxide ?? current.carbon_monoxide ?? 0).toFixed(1));
        const so2 = Number(Number(avg.sulphur_dioxide ?? current.sulphur_dioxide ?? 0).toFixed(1));
        const naqi = computeIndiaNaqi(pm25, pm10, no2, o3, co, so2);
        const { tier, theme } = classifyNaqi(naqi);

        return {
          id: `area-${cityId || 'custom'}-${idx}`,
          areaName: c.areaName,
          zoneLabel: c.zoneLabel,
          lat: c.lat,
          lon: c.lon,
          aqi: naqi,
          pm25,
          pm10,
          no2,
          tier,
          theme,
          dominantPollutant: getDominantPollutant(pm25, pm10, no2, o3, co, so2),
        };
      });

      areas.sort((a, b) => b.aqi - a.aqi);
      res.json({ areas });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load area-wise air quality';
      res.status(502).json({ error: message });
    }
  });

  router.get('/cities/search', async (req, res) => {
    const query = sanitizeText(req.query.q, 80);
    if (query.length < 2) {
      res.json({ results: [] });
      return;
    }

    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        query,
      )}&count=8&language=en&format=json&countryCode=IN`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        throw new Error(`Geocoding service returned ${response.status}`);
      }
      const data = (await response.json()) as {
        results?: Array<{
          id: number;
          name: string;
          country?: string;
          country_code?: string;
          admin1?: string;
          latitude: number;
          longitude: number;
        }>;
      };
      const results = (data.results ?? [])
        .filter((item) => !item.country_code || item.country_code === 'IN')
        .slice(0, 6)
        .map((item) => ({
          id: `geo-${item.id}`,
          name: item.name,
          country: item.country ?? 'India',
          admin1: item.admin1,
          lat: item.latitude,
          lon: item.longitude,
        }));
      res.json({ results });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Indian city search failed';
      res.status(502).json({ error: message });
    }
  });

  router.get('/aqi/location', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const parsedCoords = parseLatLon(req.query.lat, req.query.lon);
    if (!parsedCoords) {
      res.status(400).json({ error: 'Valid numeric lat and lon parameters are required.' });
      return;
    }

    const { lat, lon } = parsedCoords;
    const fresh = req.query.fresh === 'true';
    let name = sanitizeText(req.query.name, 80);
    let country = sanitizeText(req.query.country, 60);
    let region = sanitizeText(req.query.region, 80);

    if (!name) {
      const resolved = await reverseGeocodeName(lat, lon);
      name = resolved.name;
      country = country || resolved.country;
      region = region || resolved.region;
    }

    const seed: CitySeed = {
      id: sanitizeText(req.query.id, 60, `loc-${lat.toFixed(2)}-${lon.toFixed(2)}`),
      name,
      country: country || 'India',
      region: region || 'India',
      lat,
      lon,
      isMainCity: Boolean(req.query.isMainCity === 'true'),
    };

    try {
      const mapsKey = getMapsApiKey();
      if (mapsKey) {
        try {
          const [currentCond, historyRes] = await Promise.all([
            fetchGoogleCurrentAqi(lat, lon, mapsKey, { fresh }),
            fetchGoogleHistoryAqi(lat, lon, mapsKey).catch(() => ({ hoursInfo: [] })),
          ]);

          const base = buildReadingFromGoogleAq(seed, currentCond, historyRes);
          const hourly = buildHourlyFromGoogleAq(historyRes);
          const windows = computeWindows(hourly);

          const detail: LocationDetail = {
            ...base,
            hourly,
            ...windows,
          };

          res.json({ location: detail });
          return;
        } catch {
          // Fall back cleanly to CPCB-averaged Open-Meteo telemetry
        }
      }

      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide&hourly=pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide&past_days=1&forecast_days=1&timezone=Asia/Kolkata`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        throw new Error(`Air quality service returned ${response.status}`);
      }
      const data = (await response.json()) as {
        current?: Record<string, unknown>;
        hourly?: OpenMeteoHourlyPayload;
      };

      const times = data.hourly?.time ?? [];
      const pm25s = data.hourly?.pm2_5 ?? [];
      const pm10s = data.hourly?.pm10 ?? [];
      const no2s = data.hourly?.nitrogen_dioxide ?? [];
      const o3s = data.hourly?.ozone ?? [];
      const cos = data.hourly?.carbon_monoxide ?? [];
      const so2s = data.hourly?.sulphur_dioxide ?? [];

      const startSlice = times.length > 24 ? times.length - 24 : 0;
      const hourly: HourlyAqiPoint[] = times.slice(startSlice).map((time, offsetIdx) => {
        const idx = startSlice + offsetIdx;
        const pm25 = Number(Number(pm25s[idx] ?? 0).toFixed(1));
        const pm10 = Number(Number(pm10s[idx] ?? 0).toFixed(1));
        const no2 = Number(Number(no2s[idx] ?? 0).toFixed(1));
        const o3 = Number(Number(o3s[idx] ?? 0).toFixed(1));
        const co = Number(Number(cos[idx] ?? 0).toFixed(1));
        const so2 = Number(Number(so2s[idx] ?? 0).toFixed(1));
        return {
          time,
          hourLabel: formatHourLabel(time),
          aqi: computeIndiaNaqi(pm25, pm10, no2, o3, co, so2),
          pm25,
        };
      });

      const base = buildCityReading(seed, data.current ?? {}, data.hourly);
      const windows = computeWindows(hourly);

      const detail: LocationDetail = {
        ...base,
        hourly,
        ...windows,
      };

      res.json({ location: detail });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch location telemetry';
      res.status(502).json({ error: message });
    }
  });

  return router;
}
