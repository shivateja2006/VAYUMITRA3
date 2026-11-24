// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAreaFromGoogleAq,
  buildHourlyFromGoogleAq,
  buildReadingFromGoogleAq,
  clearGoogleAqCache,
  extractPollutantsUgM3,
  fetchGoogleCurrentAqi,
  formatIstHourLabel,
  mapInBatches,
} from '../server/googleAq.ts';
import type { CitySeed } from '../server/naqi.ts';

const MUMBAI_SEED: CitySeed = {
  id: 'mumbai',
  name: 'Mumbai',
  country: 'India',
  region: 'Maharashtra · West',
  lat: 19.0653,
  lon: 72.8681,
  isMainCity: true,
};

describe('Google Air Quality CPCB Telemetry Adapter', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearGoogleAqCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('extracts pollutants in ug/m3 and converts ppb gases accurately', () => {
    const out = extractPollutantsUgM3([
      { code: 'pm25', concentration: { value: 42.34, units: 'MICROGRAMS_PER_CUBIC_METER' } },
      { code: 'pm10', concentration: { value: 112.6, units: 'MICROGRAMS_PER_CUBIC_METER' } },
      { code: 'no2', concentration: { value: 20, units: 'PARTS_PER_BILLION' } },
      { code: 'o3', concentration: { value: 15, units: 'PARTS_PER_BILLION' } },
      { code: 'co', concentration: { value: 950, units: 'MICROGRAMS_PER_CUBIC_METER' } },
      { code: 'so2', concentration: { value: 10, units: 'PARTS_PER_BILLION' } },
    ]);

    expect(out.pm25).toBe(42.3);
    expect(out.pm10).toBe(112.6);
    expect(out.no2).toBeCloseTo(37.6, 1);
    expect(out.o3).toBeCloseTo(29.4, 1);
    expect(out.co).toBe(950);
    expect(out.so2).toBeCloseTo(26.2, 1);
  });

  it('builds official CPCB NAQI readings with 24h averages and live 1h snapshots', () => {
    const reading = buildReadingFromGoogleAq(
      MUMBAI_SEED,
      {
        dateTime: '2026-11-24T10:00:00Z',
        indexes: [
          { code: 'ind_cpcb', aqi: 132, dominantPollutant: 'pm10' },
          { code: 'uaqi', aqi: 84 },
        ],
        pollutants: [
          { code: 'pm25', concentration: { value: 65, units: 'MICROGRAMS_PER_CUBIC_METER' } },
          { code: 'pm10', concentration: { value: 140, units: 'MICROGRAMS_PER_CUBIC_METER' } },
          { code: 'no2', concentration: { value: 25, units: 'PARTS_PER_BILLION' } },
        ],
      },
      {
        hoursInfo: [
          {
            dateTime: '2026-11-24T08:00:00Z',
            pollutants: [
              { code: 'pm25', concentration: { value: 45, units: 'MICROGRAMS_PER_CUBIC_METER' } },
              { code: 'pm10', concentration: { value: 110, units: 'MICROGRAMS_PER_CUBIC_METER' } },
            ],
          },
          {
            dateTime: '2026-11-24T09:00:00Z',
            pollutants: [
              { code: 'pm25', concentration: { value: 55, units: 'MICROGRAMS_PER_CUBIC_METER' } },
              { code: 'pm10', concentration: { value: 125, units: 'MICROGRAMS_PER_CUBIC_METER' } },
            ],
          },
        ],
      },
    );

    expect(reading.aqi).toBe(132);
    expect(reading.usAqi).toBe(84);
    expect(reading.tier).toBe('Moderate');
    expect(reading.dominantPollutant).toBe('PM10');
    expect(reading.livePm25).toBe(65);
    expect(reading.livePm10).toBe(140);
    expect(reading.pm25).toBeCloseTo(55, 1);
    expect(reading.pm10).toBeCloseTo(125, 1);
  });

  it('builds chronological IST hourly series and neighborhood station payloads', () => {
    expect(formatIstHourLabel('2026-11-24T08:00:00Z')).toBe('13:30');

    const hourly = buildHourlyFromGoogleAq({
      hoursInfo: [
        {
          dateTime: '2026-11-24T09:00:00Z',
          pollutants: [
            { code: 'pm25', concentration: { value: 60, units: 'MICROGRAMS_PER_CUBIC_METER' } },
          ],
        },
        {
          dateTime: '2026-11-24T08:00:00Z',
          pollutants: [
            { code: 'pm25', concentration: { value: 30, units: 'MICROGRAMS_PER_CUBIC_METER' } },
          ],
        },
      ],
    });

    expect(hourly).toHaveLength(2);
    expect(hourly[0].hourLabel).toBe('13:30');
    expect(hourly[0].aqi).toBe(50);
    expect(hourly[1].hourLabel).toBe('14:30');
    expect(hourly[1].aqi).toBe(100);

    const area = buildAreaFromGoogleAq('bkc', 'BKC', 'Commercial Hub', 19.06, 72.86, {
      indexes: [{ code: 'ind_cpcb', aqi: 145, dominantPollutant: 'pm25' }],
      pollutants: [
        { code: 'pm25', concentration: { value: 73, units: 'MICROGRAMS_PER_CUBIC_METER' } },
      ],
    });
    expect(area.aqi).toBe(145);
    expect(area.tier).toBe('Moderate');
    expect(area.dominantPollutant).toBe('PM2.5');
  });

  it('caches currentConditions responses, enters cooldown on 429, and falls back to history:lookup', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('currentConditions:lookup')) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { code: 429 } }),
        } as unknown as Response;
      }
      if (url.includes('history:lookup')) {
        return {
          ok: true,
          json: async () => ({
            hoursInfo: [
              {
                dateTime: '2026-11-24T10:00:00Z',
                indexes: [{ code: 'ind_cpcb', aqi: 121, dominantPollutant: 'pm10' }],
              },
            ],
          }),
        } as unknown as Response;
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    global.fetch = fetchMock;

    const first = await fetchGoogleCurrentAqi(19.0653, 72.8681, 'test-key');
    expect(first.indexes?.[0].aqi).toBe(121);
    expect(fetchMock).toHaveBeenCalledTimes(2); // currentConditions (429) -> history fallback

    // Cached hit avoids network entirely
    const cached = await fetchGoogleCurrentAqi(19.0653, 72.8681, 'test-key');
    expect(cached.indexes?.[0].aqi).toBe(121);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Fresh fetch while on 429 cooldown skips currentConditions and queries history directly
    const fresh = await fetchGoogleCurrentAqi(19.0653, 72.8681, 'test-key', { fresh: true });
    expect(fresh.indexes?.[0].aqi).toBe(121);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('processes async workloads with controlled batch concurrency', async () => {
    const items = [1, 2, 3, 4, 5];
    const settled = await mapInBatches(items, 2, async (n) => {
      if (n === 3) throw new Error('boom');
      return n * 10;
    });

    expect(settled).toHaveLength(5);
    expect(settled[0]).toEqual({ status: 'fulfilled', value: 10 });
    expect(settled[2].status).toBe('rejected');
    expect(settled[4]).toEqual({ status: 'fulfilled', value: 50 });
  });
});
