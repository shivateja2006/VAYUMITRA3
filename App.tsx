import { useEffect, useState } from 'react';
import { LocateFixed, Loader2 } from 'lucide-react';
import { DangerousRunningBar } from './components/DangerousRunningBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import { TopCitiesBar } from './components/TopCitiesBar';
import { LocationHero } from './components/LocationHero';
import { AreaAirQualityMap } from './components/AreaAirQualityMap';
import { VayumitraPlanner } from './components/VayumitraPlanner';
import { VayumitraChat } from './components/VayumitraChat';
import { useAqiTheme } from './hooks/useAqiTheme';
import { useVayumitraDashboard } from './hooks/useVayumitraDashboard';
import type { AqiThemeMode } from './types/aqi';

/**
 * Root Vayumitra application shell combining live Indian CPCB NAQI telemetry,
 * AQI-adaptive theming, interactive spatial mapping, and GenAI family planning.
 */
export default function App() {
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const dashboard = useVayumitraDashboard();
  const activeTheme: AqiThemeMode = dashboard.activeLocation?.theme ?? 'good';
  const { themePreference, setThemePreference } = useAqiTheme(activeTheme);

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  return (
    <div
      data-aqi-theme={activeTheme}
      className="min-h-screen text-[var(--vayu-ink)] transition-colors duration-300"
    >
      {gmpQuotaExceeded && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
        >
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--vayu-accent)] focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-[var(--vayu-accent-ink)] focus:shadow-lg"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-[var(--vayu-border)] bg-[var(--vayu-surface)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <a
            href="#overview"
            className="font-display text-xl font-bold tracking-tight text-[var(--vayu-accent)] whitespace-nowrap shrink-0"
          >
            Vayumitra
          </a>

          <nav
            aria-label="Primary sections"
            className="hidden items-center gap-6 text-sm font-medium text-[var(--vayu-ink-muted)] md:flex"
          >
            <a
              href="#overview"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[var(--vayu-accent)] hover:underline"
            >
              Overview
            </a>
            <a
              href="#area-map"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[var(--vayu-accent)] hover:underline"
            >
              Area Map
            </a>
            <a
              href="#routines"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[var(--vayu-accent)] hover:underline"
            >
              Routines
            </a>
            <a
              href="#ask-vayumitra"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[var(--vayu-accent)] hover:underline"
            >
              Ask Vayumitra
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={dashboard.handleUseMyLocation}
              disabled={dashboard.locatingGps}
              className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-[var(--vayu-accent)] px-4 py-2 text-xs font-semibold text-[var(--vayu-accent-ink)] transition-colors hover:bg-[var(--vayu-accent-hover)] disabled:opacity-60"
            >
              {dashboard.locatingGps ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{dashboard.locatingGps ? 'Locating...' : 'Use My Location'}</span>
            </button>
          </div>
        </div>
      </header>

      <DangerousRunningBar
        cities={dashboard.cities}
        activeCityId={dashboard.activeLocation?.id ?? ''}
        onSelectCity={(city) =>
          void dashboard.selectLocation({
            id: city.id,
            name: city.name,
            country: city.country,
            region: city.region,
            lat: city.lat,
            lon: city.lon,
            isMainCity: city.isMainCity,
          })
        }
      />

      <WorkspaceToolbar
        themePreference={themePreference}
        activeAqiTheme={activeTheme}
        onChangeThemePreference={setThemePreference}
        alertsEnabled={dashboard.alertsEnabled}
        permissionState={dashboard.permissionState}
        onToggleAlerts={() => void dashboard.handleToggleAlerts()}
        onCheckLiveNow={() => void dashboard.checkActiveLocationLive()}
        onSendTestAlert={() => void dashboard.handleSendTestAlert()}
        checkingLive={dashboard.checkingLive}
        lastCheckedAt={dashboard.lastCheckedAt}
        activeLocation={dashboard.activeLocation}
        alertBanner={dashboard.alertBanner}
        onDismissAlertBanner={() => dashboard.setAlertBanner(null)}
      />

      {dashboard.gpsFeedback && (
        <div
          role="status"
          className="border-b border-[var(--vayu-border)] bg-[var(--vayu-surface-muted)] px-4 py-2 text-center text-xs text-[var(--vayu-ink)]"
        >
          {dashboard.gpsFeedback}
        </div>
      )}

      <main id="main-content">
        <TopCitiesBar
          cities={dashboard.cities}
          loadingCities={dashboard.loadingCities}
          citiesError={dashboard.citiesError}
          activeCityId={dashboard.activeLocation?.id ?? ''}
          onSelectCity={(city) => void dashboard.selectLocation(city)}
        />

        <LocationHero
          location={dashboard.activeLocation}
          loading={dashboard.loadingLocation}
          error={dashboard.locationError}
        />

        <ErrorBoundary fallbackTitle="Interactive air quality map unavailable">
          <AreaAirQualityMap
            activeLocation={dashboard.activeLocation}
            cities={dashboard.cities}
            onSelectLocationCoords={(loc) => void dashboard.selectLocation(loc)}
          />
        </ErrorBoundary>

        <ErrorBoundary fallbackTitle="Vayumitra action planner unavailable">
          <VayumitraPlanner
            location={dashboard.activeLocation}
            profile={dashboard.profile}
            onProfileChange={dashboard.handleProfileChange}
            plan={dashboard.plan}
            loading={dashboard.loadingPlan}
            error={dashboard.planError}
            onGeneratePlan={dashboard.handleRefreshPlan}
          />
        </ErrorBoundary>

        <ErrorBoundary fallbackTitle="Vayumitra chat assistant unavailable">
          <VayumitraChat location={dashboard.activeLocation} profile={dashboard.profile} />
        </ErrorBoundary>
      </main>

      <footer className="border-t border-[var(--vayu-border)] bg-[var(--vayu-surface)] py-6 text-xs text-[var(--vayu-ink-muted)]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            Vayumitra India · AQI-Adaptive Theme Engine: Good Air (0–100) · Caution Haze
            (101–200) · Bad Air Alert (&gt;200)
          </div>
          <div>
            CPCB NAQI (IN) telemetry via Google Air Quality API &amp; Open-Meteo · Maps &amp;
            heatmap tiles powered by Google Maps Platform
          </div>
        </div>
      </footer>
    </div>
  );
}
