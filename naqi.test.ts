import { describe, expect, it } from 'vitest';
import {
  buildCityReading,
  calcSubIndex,
  classifyNaqi,
  computeCpcbAveragesFromHourly,
  computeIndiaNaqi,
  computeWindows,
  formatHourLabel,
  formatPollutantName,
  getDominantPollutant,
  ppbToUgM3,
} from '../server/naqi.ts';

describe('Indian CPCB NAQI Calculations', () => {
  it('computes exact boundary values for PM2.5 breakpoints', () => {
    expect(calcSubIndex(0, [[0, 30, 0, 50]])).toBe(0);
    expect(calcSubIndex(-12, [[0, 30, 0, 50]])).toBe(0);
    expect(calcSubIndex(Number.NaN, [[0, 30, 0, 50]])).toBe(0);
    expect(computeIndiaNaqi(30, 0, 0, 0)).toBe(50);
    expect(computeIndiaNaqi(60, 0, 0, 0)).toBe(100);
    expect(computeIndiaNaqi(90, 0, 0, 0)).toBe(200);
    expect(computeIndiaNaqi(120, 0, 0, 0)).toBe(300);
    expect(computeIndiaNaqi(250, 0, 0, 0)).toBe(400);
    expect(computeIndiaNaqi(700, 0, 0, 0)).toBe(500);
  });

  it('uses the maximum sub-index across all 6 CPCB pollutants including CO and SO2', () => {
    const naqi = computeIndiaNaqi(20, 220, 35, 40);
    expect(naqi).toBeGreaterThan(100);
    expect(naqi).toBeLessThanOrEqual(200);

    // CO = 10000 ug/m3 (10 mg/m3) => CPCB sub-index 200
    expect(computeIndiaNaqi(10, 20, 15, 20, 10000, 10)).toBe(200);
    // SO2 = 380 ug/m3 => CPCB sub-index 200
    expect(computeIndiaNaqi(10, 20, 15, 20, 500, 380)).toBe(200);
  });

  it('classifies NAQI values into official CPCB tiers and adaptive UI themes', () => {
    expect(classifyNaqi(32)).toEqual({ tier: 'Good', theme: 'good', isDangerous: false });
    expect(classifyNaqi(88)).toEqual({ tier: 'Satisfactory', theme: 'good', isDangerous: false });
    expect(classifyNaqi(164)).toEqual({ tier: 'Moderate', theme: 'moderate', isDangerous: false });
    expect(classifyNaqi(245)).toEqual({ tier: 'Poor', theme: 'high', isDangerous: true });
    expect(classifyNaqi(355)).toEqual({ tier: 'Very Poor', theme: 'high', isDangerous: true });
    expect(classifyNaqi(440)).toEqual({ tier: 'Severe', theme: 'high', isDangerous: true });
  });

  it('identifies dominant pollutant by highest CPCB sub-index', () => {
    expect(getDominantPollutant(140, 180, 40, 30)).toBe('PM2.5');
    expect(getDominantPollutant(15, 220, 20, 25)).toBe('PM10');
    expect(getDominantPollutant(10, 20, 120, 20)).toBe('NO₂');
    expect(getDominantPollutant(10, 20, 20, 140)).toBe('O₃');
    expect(getDominantPollutant(10, 20, 15, 20, 12000, 10)).toBe('CO');
    expect(getDominantPollutant(10, 20, 15, 20, 400, 450)).toBe('SO₂');
  });

  it('converts ppb concentrations to ug/m3 and formats pollutant codes', () => {
    expect(ppbToUgM3('no2', 20)).toBeCloseTo(37.6, 1);
    expect(ppbToUgM3('o3', 10)).toBeCloseTo(19.6, 1);
    expect(ppbToUgM3('so2', 5)).toBeCloseTo(13.1, 1);
    expect(formatPollutantName('pm25')).toBe('PM2.5');
    expect(formatPollutantName('no2')).toBe('NO₂');
    expect(formatPollutantName('o3')).toBe('O₃');
    expect(formatPollutantName('so2')).toBe('SO₂');
  });

  it('computes CPCB 24h and 8h rolling averages from hourly telemetry', () => {
    const times = Array.from({ length: 24 }, (_, idx) => {
      const hh = String(idx).padStart(2, '0');
      return `2026-11-24T${hh}:00`;
    });
    const pm25 = times.map(() => 60);
    const o3 = times.map((_, idx) => (idx >= 16 ? 100 : 20)); // last 8h mean = 100

    const avg = computeCpcbAveragesFromHourly(
      { time: times, pm2_5: pm25, ozone: o3 },
      '2026-11-24T23:00',
    );
    expect(avg.pm2_5).toBe(60);
    expect(avg.ozone).toBe(100);
  });

  it('builds sanitized CityAqiReading objects', () => {
    const reading = buildCityReading(
      {
        id: 'delhi',
        name: 'Delhi',
        country: 'India',
        region: 'NCR · North',
        lat: 28.6139,
        lon: 77.209,
        isMainCity: true,
      },
      {
        us_aqi: 260,
        pm2_5: 135.44,
        pm10: 210.2,
        nitrogen_dioxide: 52.1,
        ozone: 28.4,
        carbon_monoxide: 980.0,
        sulphur_dioxide: 12.6,
        time: '2026-11-24T08:00',
      },
    );

    expect(reading.aqi).toBeGreaterThan(300);
    expect(reading.tier).toBe('Very Poor');
    expect(reading.theme).toBe('high');
    expect(reading.isDangerous).toBe(true);
    expect(reading.pm25).toBe(135.4);
    expect(reading.dominantPollutant).toBe('PM2.5');
  });

  it('formats hourly timestamps and identifies cleanest & peak smog windows', () => {
    expect(formatHourLabel('2026-11-24T14:00')).toBe('14:00');
    expect(formatHourLabel('invalid')).toBe('invalid');

    expect(computeWindows([])).toEqual({
      bestVentilationWindow: '13:00 – 16:00',
      peakSmogWindow: '06:00 – 09:00',
    });

    const windows = computeWindows([
      { time: '2026-11-24T07:00', hourLabel: '07:00', aqi: 340, pm25: 155 },
      { time: '2026-11-24T14:00', hourLabel: '14:00', aqi: 145, pm25: 72 },
      { time: '2026-11-24T22:00', hourLabel: '22:00', aqi: 290, pm25: 118 },
    ]);
    expect(windows).toEqual({
      bestVentilationWindow: '14:00 (NAQI ~145)',
      peakSmogWindow: '07:00 (NAQI ~340)',
    });
  });
});
