// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DangerousRunningBar } from '../src/components/DangerousRunningBar.tsx';
import { ErrorBoundary } from '../src/components/ErrorBoundary.tsx';
import { LocationHero } from '../src/components/LocationHero.tsx';
import { StationListRow } from '../src/components/map/MapOverlays.tsx';
import { TopCitiesBar } from '../src/components/TopCitiesBar.tsx';
import { VayumitraChat } from '../src/components/VayumitraChat.tsx';
import { VayumitraPlanner } from '../src/components/VayumitraPlanner.tsx';
import { WorkspaceToolbar } from '../src/components/WorkspaceToolbar.tsx';
import type {
  AssistantPlanResponse,
  CityAqiReading,
  HouseholdProfile,
  LocationDetail,
} from '../src/types/aqi.ts';

const MOCK_CITIES: CityAqiReading[] = [
  {
    id: 'delhi',
    name: 'Delhi',
    country: 'India',
    region: 'NCR · North',
    lat: 28.6139,
    lon: 77.209,
    isMainCity: true,
    aqi: 330,
    usAqi: 260,
    pm25: 155,
    pm10: 245,
    no2: 65,
    o3: 30,
    co: 1100,
    so2: 14,
    tier: 'Very Poor',
    theme: 'high',
    isDangerous: true,
    dominantPollutant: 'PM2.5',
    updatedAt: '2026-11-24T08:00',
  },
  {
    id: 'kochi',
    name: 'Kochi',
    country: 'India',
    region: 'Kerala · South',
    lat: 9.9312,
    lon: 76.2673,
    isMainCity: true,
    aqi: 44,
    usAqi: 38,
    pm25: 14,
    pm10: 28,
    no2: 12,
    o3: 24,
    co: 320,
    so2: 4,
    tier: 'Good',
    theme: 'good',
    isDangerous: false,
    dominantPollutant: 'PM2.5',
    updatedAt: '2026-11-24T08:00',
  },
];

const MOCK_LOCATION: LocationDetail = {
  ...MOCK_CITIES[0],
  hourly: [
    { time: '2026-11-24T06:00', hourLabel: '06:00', aqi: 350, pm25: 162 },
    { time: '2026-11-24T14:00', hourLabel: '14:00', aqi: 185, pm25: 84 },
  ],
  bestVentilationWindow: '14:00 (NAQI ~185)',
  peakSmogWindow: '06:00 (NAQI ~350)',
};

const MOCK_PROFILE: HouseholdProfile = {
  householdType: 'Family with young children',
  commuteMode: 'Metro / city bus transit',
  homeSetup: 'Cross-ventilation windows & LPG gas stove',
  primaryGoal: 'Protect family health & cut daily emissions',
};

const MOCK_PLAN: AssistantPlanResponse = {
  city: 'Delhi',
  aqi: 330,
  locationBrief: 'Winter inversion keeps Delhi PM2.5 elevated through morning rush hour.',
  winterSmogDynamics: 'Low wind speeds trap particulates near street level.',
  maskAndOutdoorRule: 'Use fitted N95 masks outdoors and avoid pre-9 AM runs.',
  dailyRoutines: [
    {
      id: 'r-1',
      timeWindow: '14:00–15:30',
      title: 'Midday Cross-Ventilation',
      action: 'Open windows briefly during peak afternoon mixing.',
      whyItMatters: 'Cuts indoor stale air without peak smog inflow.',
      exposureReductionPct: 24,
      co2SavedKgPerWeek: 2.5,
    },
  ],
  indoorHacks: [
    {
      id: 'h-1',
      title: 'Wet Mop Dust Control',
      costTier: 'Zero-cost',
      steps: 'Wet mop tile floors instead of dry sweeping.',
      indoorPmReductionPct: 20,
      directImpact: 'Stops settled PM2.5/PM10 from resuspending indoors.',
    },
  ],
  sustainableAlternatives: [
    {
      id: 's-1',
      category: 'Commute',
      replaces: 'Short solo cab rides',
      alternative: 'Metro + shared e-rickshaw',
      directHealthImpact: 'Reduces roadside NO2 inhalation.',
      communityEmissionImpact: 'Cuts neighborhood tailpipe emissions.',
      co2SavedKgPerWeek: 8.5,
    },
  ],
  impactSummary: 'Combines immediate exposure protection with lower neighborhood emissions.',
};

describe('Vayumitra UI Components', () => {
  it('WorkspaceToolbar toggles themes and renders/dismisses worsening alert banner', () => {
    const onChangeTheme = vi.fn();
    const onDismiss = vi.fn();
    render(
      <WorkspaceToolbar
        themePreference="auto"
        activeAqiTheme="high"
        onChangeThemePreference={onChangeTheme}
        alertsEnabled={true}
        permissionState="granted"
        onToggleAlerts={vi.fn()}
        onCheckLiveNow={vi.fn()}
        onSendTestAlert={vi.fn()}
        checkingLive={false}
        lastCheckedAt="09:15"
        activeLocation={MOCK_LOCATION}
        alertBanner={{
          id: 'alert-1',
          title: 'Vayumitra Alert: Delhi NAQI worsened to Very Poor',
          body: 'Close windows and wear N95 outdoors.',
          nativeDispatched: true,
          timestamp: '09:15',
        }}
        onDismissAlertBanner={onDismiss}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Delhi NAQI worsened to Very Poor');
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(onChangeTheme).toHaveBeenCalledWith('light');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss AQI alert' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('DangerousRunningBar and TopCitiesBar allow switching between Indian cities', () => {
    const onSelect = vi.fn();
    render(
      <>
        <DangerousRunningBar
          cities={MOCK_CITIES}
          activeCityId="delhi"
          onSelectCity={onSelect}
        />
        <TopCitiesBar
          cities={MOCK_CITIES}
          loadingCities={false}
          citiesError={null}
          activeCityId="delhi"
          onSelectCity={onSelect}
        />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set Kochi as active location' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'kochi', name: 'Kochi' }));
  });

  it('LocationHero renders NAQI gauge, WHO progressbars, and ventilation windows', () => {
    render(<LocationHero location={MOCK_LOCATION} loading={false} error={null} />);

    expect(screen.getByRole('img', { name: 'Indian NAQI 330' })).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(screen.getByText('14:00 (NAQI ~185)')).toBeInTheDocument();
    expect(screen.getByText('06:00 (NAQI ~350)')).toBeInTheDocument();
  });

  it('VayumitraPlanner computes live PM2.5 exposure drop & weekly CO2e savings as choices are checked', () => {
    render(
      <VayumitraPlanner
        location={MOCK_LOCATION}
        profile={MOCK_PROFILE}
        onProfileChange={vi.fn()}
        plan={MOCK_PLAN}
        loading={false}
        error={null}
        onGeneratePlan={vi.fn()}
      />,
    );

    expect(screen.getByText('-0%')).toBeInTheDocument();
    expect(screen.getByText(/0\.0/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Midday Cross-Ventilation/i }));
    fireEvent.click(screen.getByRole('button', { name: /Wet Mop Dust Control/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Adopt Swap' }));

    // 24% routine + round(20 * 0.45) = 33% exposure drop; 2.5 + 8.5 = 11.0 kg CO2e/wk
    expect(screen.getByText('-33%')).toBeInTheDocument();
    expect(screen.getByText(/11\.0/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adopted' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('VayumitraChat sends questions and displays assistant response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Ventilate between 14:00 and 15:30 to minimize PM2.5 buildup.',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<VayumitraChat location={MOCK_LOCATION} profile={MOCK_PROFILE} />);

    const input = screen.getByLabelText('Ask Vayumitra a question');
    fireEvent.change(input, { target: { value: 'Best ventilation time?' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(
        screen.getByText('Ventilate between 14:00 and 15:30 to minimize PM2.5 buildup.'),
      ).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it('VayumitraPlanner shows updating status banner, handles retryable errors, and triggers profile updates', () => {
    const onProfileChange = vi.fn();
    const onGeneratePlan = vi.fn();
    const { rerender } = render(
      <VayumitraPlanner
        location={MOCK_LOCATION}
        profile={MOCK_PROFILE}
        onProfileChange={onProfileChange}
        plan={MOCK_PLAN}
        loading={true}
        error={null}
        onGeneratePlan={onGeneratePlan}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Tailoring Vayumitra plan for Delhi (AQI 330)...',
    );

    fireEvent.change(screen.getByLabelText(/Daily Commute Mode/i), {
      target: { value: 'Two-wheeler / scooter' },
    });
    expect(onProfileChange).toHaveBeenCalledWith(
      expect.objectContaining({ commuteMode: 'Two-wheeler / scooter' }),
    );

    rerender(
      <VayumitraPlanner
        location={MOCK_LOCATION}
        profile={MOCK_PROFILE}
        onProfileChange={onProfileChange}
        plan={MOCK_PLAN}
        loading={false}
        error="Temporary high demand across Gemini servers."
        onGeneratePlan={onGeneratePlan}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Temporary high demand');
    fireEvent.click(screen.getByRole('button', { name: 'Retry Plan' }));
    expect(onGeneratePlan).toHaveBeenCalledTimes(1);
  });

  it('ErrorBoundary isolates render failures and StationListRow triggers location selection', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const CrashWidget = () => {
      throw new Error('Widget crash test');
    };

    render(
      <ErrorBoundary fallbackTitle="Map panel paused">
        <CrashWidget />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Map panel paused');
    expect(screen.getByText('Widget crash test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Section' })).toBeInTheDocument();
    errorSpy.mockRestore();

    const onSelectStation = vi.fn();
    render(
      <StationListRow
        name="BKC"
        subtitle="Commercial Hub · PM2.5 54 µg/m³"
        aqi={132}
        tier="Moderate"
        theme="moderate"
        onSelect={onSelectStation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set BKC as active location' }));
    expect(onSelectStation).toHaveBeenCalledTimes(1);
  });
});
