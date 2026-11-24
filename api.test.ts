// @vitest-environment node
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.ts';
import { clearCitiesCache } from '../server/cities.ts';

describe('Vayumitra Backend API Routes', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearCitiesCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('GET /api/health returns service health with security headers', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'vayumitra-india' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('GET /api/aqi/areas validates latitude and longitude', async () => {
    const app = createApp();
    const invalid = await request(app).get('/api/aqi/areas?lat=999&lon=77.2');
    expect(invalid.status).toBe(400);

    const missing = await request(app).get('/api/aqi/areas');
    expect(missing.status).toBe(400);
  });

  it('GET /api/aqi/areas returns neighborhood zones sorted by NAQI descending', async () => {
    const mockStations = Array.from({ length: 9 }, (_, idx) => ({
      current: {
        pm2_5: 30 + idx * 15,
        pm10: 60 + idx * 10,
        nitrogen_dioxide: 25,
        ozone: 30,
      },
    }));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStations,
    } as unknown as Response);

    const app = createApp();
    const res = await request(app).get(
      '/api/aqi/areas?lat=28.6139&lon=77.209&cityId=delhi&name=Delhi',
    );

    expect(res.status).toBe(200);
    expect(res.body.areas).toHaveLength(9);
    expect(res.body.areas[0].aqi).toBeGreaterThanOrEqual(res.body.areas[8].aqi);
  });

  it('GET /api/cities/search filters strictly for Indian cities and skips short queries', async () => {
    const app = createApp();
    const shortRes = await request(app).get('/api/cities/search?q=a');
    expect(shortRes.status).toBe(200);
    expect(shortRes.body.results).toEqual([]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: 1, name: 'Varanasi', country: 'India', country_code: 'IN', admin1: 'Uttar Pradesh', latitude: 25.31, longitude: 82.97 },
          { id: 2, name: 'ForeignTown', country: 'Other', country_code: 'US', latitude: 40, longitude: -74 },
        ],
      }),
    } as unknown as Response);

    const searchRes = await request(app).get('/api/cities/search?q=Varanasi');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.results).toHaveLength(1);
    expect(searchRes.body.results[0].name).toBe('Varanasi');
  });

  it('GET /api/maps/aq-tile rejects unsupported map types and invalid zoom/coordinates', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-placeholder';
    const app = createApp();

    const badType = await request(app).get('/api/maps/aq-tile/INVALID/5/10/10');
    expect(badType.status).toBe(400);

    const badZoom = await request(app).get('/api/maps/aq-tile/IND_CPCB/99/10/10');
    expect(badZoom.status).toBe(400);

    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it('POST /api/assistant/plan validates input and returns structured GenAI plan', async () => {
    const mockPlan = {
      locationBrief: 'Delhi faces Very Poor winter smog today.',
      winterSmogDynamics: 'Calm morning boundary-layer inversion traps PM2.5.',
      maskAndOutdoorRule: 'Wear fitted N95 outdoors during morning/evening peaks.',
      dailyRoutines: [
        {
          id: 'r1',
          timeWindow: '14:00–16:00',
          title: 'Midday cross-ventilation',
          action: 'Open windows briefly when mixing height peaks.',
          whyItMatters: 'Flushes indoor CO2 while outdoor PM2.5 dips.',
          exposureReductionPct: 22,
          co2SavedKgPerWeek: 3,
        },
      ],
      indoorHacks: [
        {
          id: 'h1',
          title: 'Wet mop floors',
          costTier: 'Zero-cost',
          steps: 'Wet mop twice daily instead of dry sweeping.',
          indoorPmReductionPct: 25,
          directImpact: 'Prevents settled road dust resuspension.',
        },
      ],
      sustainableAlternatives: [
        {
          id: 's1',
          category: 'Commute',
          replaces: 'Solo petrol car trip',
          alternative: 'Delhi Metro + e-rickshaw',
          directHealthImpact: 'Cuts in-cabin exhaust peak exposure.',
          communityEmissionImpact: 'Removes tailpipe PM & NO2 near schools.',
          co2SavedKgPerWeek: 12,
        },
      ],
      impactSummary: 'Significantly cuts household PM2.5 intake and weekly CO2e.',
    };

    const generateMock = vi.fn().mockResolvedValue({
      text: JSON.stringify(mockPlan),
    });

    const app = createApp({
      aiClientProvider: () => ({
        models: {
          generateContent: generateMock,
        } as unknown as never,
      }),
    });

    const badRes = await request(app).post('/api/assistant/plan').send({});
    expect(badRes.status).toBe(400);

    const payload = {
      location: { name: 'Delhi', region: 'NCR', aqi: 315, pm25: 140, pm10: 210, no2: 60, o3: 25 },
      profile: { householdType: 'Family with young children' },
    };

    const goodRes = await request(app).post('/api/assistant/plan').send(payload);
    expect(goodRes.status).toBe(200);
    expect(goodRes.body.plan.city).toBe('Delhi');
    expect(goodRes.body.plan.dailyRoutines).toHaveLength(1);
    expect(generateMock).toHaveBeenCalledTimes(1);

    const cachedRes = await request(app).post('/api/assistant/plan').send(payload);
    expect(cachedRes.status).toBe(200);
    expect(cachedRes.body.cached).toBe(true);
    expect(generateMock).toHaveBeenCalledTimes(1);

    const refreshedRes = await request(app)
      .post('/api/assistant/plan')
      .send({ ...payload, refresh: true });
    expect(refreshedRes.status).toBe(200);
    expect(generateMock).toHaveBeenCalledTimes(2);
  });

  it('POST /api/assistant/chat validates empty questions and handles 403 cleanly', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp({
      aiClientProvider: () => ({
        models: {
          generateContent: vi
            .fn()
            .mockRejectedValue(new Error('{"error":{"code":403,"status":"PERMISSION_DENIED"}}')),
        } as unknown as never,
      }),
    });

    const emptyRes = await request(app).post('/api/assistant/chat').send({ question: '   ' });
    expect(emptyRes.status).toBe(400);

    const errRes = await request(app)
      .post('/api/assistant/chat')
      .send({ question: 'When should we ventilate?' });
    expect(errRes.status).toBe(403);
    expect(errRes.body.error).toContain('Settings > Secrets');
  });

  it('GET /api/aqi/location uses Google Air Quality ind_cpcb exact telemetry when Maps key is configured', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-placeholder';
    global.fetch = vi.fn().mockImplementation(async (input: string) => {
      if (input.includes('currentConditions:lookup')) {
        return {
          ok: true,
          json: async () => ({
            dateTime: '2026-11-24T10:00:00Z',
            indexes: [
              { code: 'ind_cpcb', aqi: 42, dominantPollutant: 'pm10' },
              { code: 'uaqi', aqi: 49 },
            ],
            pollutants: [
              { code: 'pm25', concentration: { value: 21.85, units: 'MICROGRAMS_PER_CUBIC_METER' } },
              { code: 'pm10', concentration: { value: 68.85, units: 'MICROGRAMS_PER_CUBIC_METER' } },
              { code: 'no2', concentration: { value: 15.58, units: 'PARTS_PER_BILLION' } },
            ],
          }),
        } as unknown as Response;
      }
      if (input.includes('history:lookup')) {
        return {
          ok: true,
          json: async () => ({
            hoursInfo: [
              {
                dateTime: '2026-11-24T09:00:00Z',
                indexes: [{ code: 'ind_cpcb', aqi: 45 }],
                pollutants: [{ code: 'pm25', concentration: { value: 23, units: 'MICROGRAMS_PER_CUBIC_METER' } }],
              },
              {
                dateTime: '2026-11-24T08:00:00Z',
                indexes: [{ code: 'ind_cpcb', aqi: 38 }],
                pollutants: [{ code: 'pm25', concentration: { value: 19, units: 'MICROGRAMS_PER_CUBIC_METER' } }],
              },
            ],
          }),
        } as unknown as Response;
      }
      throw new Error(`Unexpected fetch URL: ${input}`);
    });

    const app = createApp();
    const res = await request(app).get(
      '/api/aqi/location?lat=9.9312&lon=76.2673&id=kochi&name=Kochi',
    );

    delete process.env.GOOGLE_MAPS_API_KEY;

    expect(res.status).toBe(200);
    expect(res.body.location.aqi).toBe(42);
    expect(res.body.location.tier).toBe('Good');
    expect(res.body.location.dominantPollutant).toBe('PM10');
    expect(res.body.location.dataSource).toBe('Google Air Quality · CPCB NAQI (IN)');
    expect(res.body.location.livePm25).toBe(21.9);
    expect(res.body.location.pm25).toBeCloseTo(21.3, 1);
    expect(res.body.location.hourly).toHaveLength(2);
    expect(res.body.location.hourly[0].aqi).toBe(32);
    expect(res.body.location.hourly[1].aqi).toBe(38);
  });

  it('GET /api/aqi/location seamlessly falls back to Google history:lookup on 429 currentConditions quota', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-placeholder';
    global.fetch = vi.fn().mockImplementation(async (input: string) => {
      if (input.includes('currentConditions:lookup')) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }),
        } as unknown as Response;
      }
      if (input.includes('history:lookup')) {
        return {
          ok: true,
          json: async () => ({
            hoursInfo: [
              {
                dateTime: '2026-11-24T09:00:00Z',
                indexes: [{ code: 'ind_cpcb', aqi: 304, dominantPollutant: 'pm25' }],
                pollutants: [
                  { code: 'pm25', concentration: { value: 125, units: 'MICROGRAMS_PER_CUBIC_METER' } },
                ],
              },
            ],
          }),
        } as unknown as Response;
      }
      throw new Error(`Unexpected fetch URL: ${input}`);
    });

    const app = createApp();
    const res = await request(app).get(
      '/api/aqi/location?lat=28.6139&lon=77.209&id=delhi&name=Delhi',
    );

    delete process.env.GOOGLE_MAPS_API_KEY;

    expect(res.status).toBe(200);
    expect(res.body.location.aqi).toBe(304);
    expect(res.body.location.tier).toBe('Very Poor');
    expect(res.body.location.dataSource).toBe('Google Air Quality · CPCB NAQI (IN)');
  });
});
