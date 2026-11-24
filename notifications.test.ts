// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  didAqiCategoryWorsen,
  getAqiSeverityRank,
  getNextWorseTier,
  sendAqiWorseningNotification,
} from '../src/utils/aqiNotifications.ts';

describe('Browser AQI Worsening Notification System', () => {
  const originalNotification = window.Notification;

  afterEach(() => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: originalNotification,
    });
    vi.restoreAllMocks();
  });

  it('ranks severity tiers monotonically from Good to Severe', () => {
    expect(getAqiSeverityRank('Good')).toBeLessThan(getAqiSeverityRank('Satisfactory'));
    expect(getAqiSeverityRank('Moderate')).toBeLessThan(getAqiSeverityRank('Poor'));
    expect(getAqiSeverityRank('Poor')).toBeLessThan(getAqiSeverityRank('Very Poor'));
    expect(getAqiSeverityRank('Very Poor')).toBeLessThan(getAqiSeverityRank('Severe'));
  });

  it('detects worsening AQI transitions accurately', () => {
    expect(didAqiCategoryWorsen('Moderate', 'Poor')).toBe(true);
    expect(didAqiCategoryWorsen('Good', 'Satisfactory')).toBe(true);
    expect(didAqiCategoryWorsen('Poor', 'Poor')).toBe(false);
    expect(didAqiCategoryWorsen('Very Poor', 'Moderate')).toBe(false);
  });

  it('computes the next worse severity tier for test alert simulation', () => {
    expect(getNextWorseTier('Good')).toBe('Satisfactory');
    expect(getNextWorseTier('Moderate')).toBe('Poor');
    expect(getNextWorseTier('Severe')).toBe('Severe');
  });

  it('dispatches native Notification when permission is granted', () => {
    const notificationSpy = vi.fn();
    function MockNotification(title: string, options?: NotificationOptions) {
      notificationSpy(title, options);
    }
    (MockNotification as unknown as { permission: NotificationPermission }).permission = 'granted';

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: MockNotification,
    });

    const result = sendAqiWorseningNotification({
      cityName: 'Delhi',
      previousTier: 'Poor',
      nextTier: 'Very Poor',
      aqi: 325,
      pm25: 148.5,
    });

    expect(result.dispatched).toBe(true);
    expect(result.title).toContain('Delhi NAQI worsened to Very Poor');
    expect(notificationSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back cleanly without crashing when permission is denied', () => {
    function MockNotification() {}
    (MockNotification as unknown as { permission: NotificationPermission }).permission = 'denied';

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: MockNotification,
    });

    const result = sendAqiWorseningNotification({
      cityName: 'Kochi',
      previousTier: 'Good',
      nextTier: 'Moderate',
      aqi: 145,
      pm25: 71.2,
      isTest: true,
    });

    expect(result.dispatched).toBe(false);
    expect(result.title).toMatch(/^\[Test\]/);
  });
});
