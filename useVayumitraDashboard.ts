import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveAlertBanner } from '../components/WorkspaceToolbar';
import {
  didAqiCategoryWorsen,
  getNextWorseTier,
  getNotificationPermissionState,
  requestAqiNotificationPermission,
  sendAqiWorseningNotification,
  type BrowserNotificationPermission,
} from '../utils/aqiNotifications';
import type {
  AqiSeverityTier,
  AssistantPlanResponse,
  CityAqiReading,
  HouseholdProfile,
  LocationDetail,
} from '../types/aqi';

export interface SelectedCoords {
  id: string;
  name: string;
  country: string;
  region?: string;
  lat: number;
  lon: number;
  isMainCity?: boolean;
}

const DEFAULT_PROFILE: HouseholdProfile = {
  householdType: 'Family with young children',
  commuteMode: 'Metro / city bus transit',
  homeSetup: 'Cross-ventilation windows & LPG gas stove',
  primaryGoal: 'Protect family health & cut daily emissions',
};

async function fetchLocationDetailRequest(
  coords: SelectedCoords,
  fresh = false,
): Promise<LocationDetail> {
  const params = new URLSearchParams({
    id: coords.id,
    lat: String(coords.lat),
    lon: String(coords.lon),
    isMainCity: String(Boolean(coords.isMainCity)),
  });
  if (coords.name) params.set('name', coords.name);
  if (coords.country) params.set('country', coords.country);
  if (coords.region) params.set('region', coords.region);
  if (fresh) params.set('fresh', 'true');

  const res = await fetch(`/api/aqi/location?${params.toString()}`, {
    cache: 'no-store',
  });
  const data = (await res.json()) as { location?: LocationDetail; error?: string };
  if (!res.ok || !data.location) {
    throw new Error(data.error || 'Could not load location air quality');
  }
  return data.location;
}

/**
 * Manages Vayumitra dashboard state: Indian city telemetry, active location selection,
 * live worsening AQI polling/notifications, GPS geolocation, and GenAI action plans.
 */
export function useVayumitraDashboard() {
  const [cities, setCities] = useState<CityAqiReading[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const [activeLocation, setActiveLocation] = useState<LocationDetail | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [profile, setProfile] = useState<HouseholdProfile>(DEFAULT_PROFILE);
  const [plan, setPlan] = useState<AssistantPlanResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsFeedback, setGpsFeedback] = useState<string | null>(null);

  const [permissionState, setPermissionState] = useState<BrowserNotificationPermission>(
    getNotificationPermissionState,
  );
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(
    () => getNotificationPermissionState() === 'granted',
  );
  const [checkingLive, setCheckingLive] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [alertBanner, setAlertBanner] = useState<ActiveAlertBanner | null>(null);

  const lastTierByLocationRef = useRef<Record<string, AqiSeverityTier>>({});
  const planAbortRef = useRef<AbortController | null>(null);
  const profileRef = useRef<HouseholdProfile>(DEFAULT_PROFILE);
  profileRef.current = profile;

  const generatePlanForLocation = useCallback(
    async (loc: LocationDetail, currentProfile: HouseholdProfile, refresh = false) => {
      planAbortRef.current?.abort();
      const controller = new AbortController();
      planAbortRef.current = controller;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 55000);

      setLoadingPlan(true);
      setPlanError(null);
      try {
        const res = await fetch('/api/assistant/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: loc, profile: currentProfile, refresh }),
          signal: controller.signal,
        });

        let data: { plan?: AssistantPlanResponse; error?: string } = {};
        try {
          data = (await res.json()) as { plan?: AssistantPlanResponse; error?: string };
        } catch {
          // Non-JSON upstream error response
        }

        if (!res.ok || !data.plan) {
          throw new Error(
            data.error ||
              'Vayumitra AI is temporarily busy. Please wait a few seconds and click Refresh GenAI Plan.',
          );
        }
        setPlan(data.plan);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          if (timedOut) {
            setPlanError(
              'Plan generation took longer than expected. Click Refresh GenAI Plan to retry.',
            );
          }
          return;
        }
        setPlanError(
          err instanceof Error
            ? err.message
            : 'Unable to generate tailored guidance. Please retry.',
        );
      } finally {
        window.clearTimeout(timeoutId);
        if (planAbortRef.current === controller) {
          setLoadingPlan(false);
        }
      }
    },
    [],
  );

  const selectLocation = useCallback(
    async (coords: SelectedCoords) => {
      setLoadingLocation(true);
      setLocationError(null);
      setGpsFeedback(null);
      try {
        const nextLocation = await fetchLocationDetailRequest(coords);
        lastTierByLocationRef.current[nextLocation.id] = nextLocation.tier;
        setActiveLocation(nextLocation);
        setLastCheckedAt(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        );
        void generatePlanForLocation(nextLocation, profileRef.current, false);
      } catch (err) {
        setLocationError(err instanceof Error ? err.message : 'Failed to load location telemetry');
      } finally {
        setLoadingLocation(false);
      }
    },
    [generatePlanForLocation],
  );

  const checkActiveLocationLive = useCallback(async () => {
    if (!activeLocation || checkingLive) return;
    setCheckingLive(true);
    try {
      const [latest, citiesRes] = await Promise.all([
        fetchLocationDetailRequest(
          {
            id: activeLocation.id,
            name: activeLocation.name,
            country: activeLocation.country,
            region: activeLocation.region,
            lat: activeLocation.lat,
            lon: activeLocation.lon,
            isMainCity: activeLocation.isMainCity,
          },
          true,
        ),
        fetch('/api/aqi/cities?fresh=true', { cache: 'no-store' }).catch(() => null),
      ]);

      if (citiesRes && citiesRes.ok) {
        const citiesData = (await citiesRes.json()) as { cities?: CityAqiReading[] };
        if (citiesData.cities) {
          setCities(citiesData.cities);
        }
      }

      const previousTier = lastTierByLocationRef.current[latest.id] ?? activeLocation.tier;
      if (alertsEnabled && didAqiCategoryWorsen(previousTier, latest.tier)) {
        const result = sendAqiWorseningNotification({
          cityName: latest.name,
          previousTier,
          nextTier: latest.tier,
          aqi: latest.aqi,
          pm25: latest.pm25,
        });
        setAlertBanner({
          id: `alert-${Date.now()}`,
          title: result.title,
          body: result.body,
          nativeDispatched: result.dispatched,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }

      lastTierByLocationRef.current[latest.id] = latest.tier;
      setActiveLocation(latest);
      setLastCheckedAt(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      );
    } catch {
      // Keep current telemetry visible if background poll fails transiently
    } finally {
      setCheckingLive(false);
    }
  }, [activeLocation, alertsEnabled, checkingLive]);

  useEffect(() => {
    if (!alertsEnabled || !activeLocation) return;
    const intervalId = window.setInterval(() => {
      void checkActiveLocationLive();
    }, 60000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [alertsEnabled, activeLocation, checkActiveLocationLive]);

  useEffect(() => {
    let mounted = true;
    const loadInitialCities = async () => {
      setLoadingCities(true);
      setCitiesError(null);
      try {
        const res = await fetch('/api/aqi/cities', { cache: 'no-store' });
        const data = (await res.json()) as { cities?: CityAqiReading[]; error?: string };
        if (!res.ok || !data.cities) {
          throw new Error(data.error || 'Unable to load Indian city air quality feed');
        }
        if (!mounted) return;
        setCities(data.cities);

        if (data.cities.length > 0) {
          const initial = data.cities[0];
          await selectLocation({
            id: initial.id,
            name: initial.name,
            country: initial.country,
            region: initial.region,
            lat: initial.lat,
            lon: initial.lon,
            isMainCity: initial.isMainCity,
          });
        }
      } catch (err) {
        if (!mounted) return;
        setCitiesError(err instanceof Error ? err.message : 'Failed to load monitored Indian cities');
        setLoadingLocation(false);
      } finally {
        if (mounted) setLoadingCities(false);
      }
    };

    void loadInitialCities();
    return () => {
      mounted = false;
    };
  }, [selectLocation]);

  const handleToggleAlerts = async () => {
    if (alertsEnabled) {
      setAlertsEnabled(false);
      return;
    }

    const perm = await requestAqiNotificationPermission();
    setPermissionState(perm);
    setAlertsEnabled(true);
    if (activeLocation) {
      lastTierByLocationRef.current[activeLocation.id] = activeLocation.tier;
    }
  };

  const handleSendTestAlert = async () => {
    if (!activeLocation) return;
    let currentPerm = getNotificationPermissionState();
    if (currentPerm === 'default') {
      currentPerm = await requestAqiNotificationPermission();
      setPermissionState(currentPerm);
    }
    setAlertsEnabled(true);

    const simulatedWorseTier = getNextWorseTier(activeLocation.tier);
    const result = sendAqiWorseningNotification({
      cityName: activeLocation.name,
      previousTier: activeLocation.tier,
      nextTier: simulatedWorseTier,
      aqi: Math.max(activeLocation.aqi + 45, 225),
      pm25: Number((activeLocation.pm25 + 24).toFixed(1)),
      isTest: true,
    });

    setAlertBanner({
      id: `test-${Date.now()}`,
      title: result.title,
      body: result.body,
      nativeDispatched: result.dispatched,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGpsFeedback('Geolocation is not supported in this browser. Search your Indian city below.');
      return;
    }

    setLocatingGps(true);
    setGpsFeedback(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocatingGps(false);
        void selectLocation({
          id: `gps-${position.coords.latitude.toFixed(2)}-${position.coords.longitude.toFixed(2)}`,
          name: '',
          country: 'India',
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          isMainCity: false,
        });
      },
      () => {
        setLocatingGps(false);
        setGpsFeedback('Location permission denied. Pick a major Indian city or search below.');
      },
      { timeout: 10000 },
    );
  };

  const handleProfileChange = (nextProfile: HouseholdProfile) => {
    setProfile(nextProfile);
    if (activeLocation) {
      void generatePlanForLocation(activeLocation, nextProfile, false);
    }
  };

  const handleRefreshPlan = () => {
    if (activeLocation) {
      void generatePlanForLocation(activeLocation, profile, true);
    }
  };

  return {
    cities,
    loadingCities,
    citiesError,
    activeLocation,
    loadingLocation,
    locationError,
    profile,
    plan,
    loadingPlan,
    planError,
    locatingGps,
    gpsFeedback,
    permissionState,
    alertsEnabled,
    checkingLive,
    lastCheckedAt,
    alertBanner,
    setAlertBanner,
    selectLocation,
    checkActiveLocationLive,
    handleToggleAlerts,
    handleSendTestAlert,
    handleUseMyLocation,
    handleProfileChange,
    handleRefreshPlan,
  };
}
