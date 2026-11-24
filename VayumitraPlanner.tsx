import { useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, Sparkles } from 'lucide-react';
import type { AssistantPlanResponse, HouseholdProfile, LocationDetail } from '../types/aqi';
import {
  COMMUTE_OPTIONS,
  DailyRoutinesGrid,
  GOAL_OPTIONS,
  HOME_SETUP_OPTIONS,
  HOUSEHOLD_OPTIONS,
  IndoorHacksGrid,
  SustainableSwapsList,
} from './planner/PlannerActionSections';

interface VayumitraPlannerProps {
  location: LocationDetail | null;
  profile: HouseholdProfile;
  onProfileChange: (next: HouseholdProfile) => void;
  plan: AssistantPlanResponse | null;
  loading: boolean;
  error: string | null;
  onGeneratePlan: () => void;
}

/**
 * Interactive household action planner adapting daily routines, indoor PM2.5 hacks,
 * sustainable swaps, and live exposure/CO2e savings to the active city's CPCB NAQI.
 */
export function VayumitraPlanner({
  location,
  profile,
  onProfileChange,
  plan,
  loading,
  error,
  onGeneratePlan,
}: VayumitraPlannerProps) {
  const [checkedRoutines, setCheckedRoutines] = useState<Record<string, boolean>>({});
  const [checkedHacks, setCheckedHacks] = useState<Record<string, boolean>>({});
  const [checkedSwaps, setCheckedSwaps] = useState<Record<string, boolean>>({});
  const [copiedPlan, setCopiedPlan] = useState(false);

  useEffect(() => {
    setCheckedRoutines({});
    setCheckedHacks({});
    setCheckedSwaps({});
  }, [plan]);

  const toggleItem = (
    setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    id: string,
  ) => {
    setter((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedExposureReduction = Math.min(
    85,
    (plan?.dailyRoutines ?? []).reduce(
      (sum, r) => sum + (checkedRoutines[r.id] ? r.exposureReductionPct : 0),
      0,
    ) +
      (plan?.indoorHacks ?? []).reduce(
        (sum, h) => sum + (checkedHacks[h.id] ? Math.round(h.indoorPmReductionPct * 0.45) : 0),
        0,
      ),
  );

  const selectedCo2Saved =
    (plan?.dailyRoutines ?? []).reduce(
      (sum, r) => sum + (checkedRoutines[r.id] ? r.co2SavedKgPerWeek : 0),
      0,
    ) +
    (plan?.sustainableAlternatives ?? []).reduce(
      (sum, s) => sum + (checkedSwaps[s.id] ? s.co2SavedKgPerWeek : 0),
      0,
    );

  const totalActionsSelected =
    Object.values(checkedRoutines).filter(Boolean).length +
    Object.values(checkedHacks).filter(Boolean).length +
    Object.values(checkedSwaps).filter(Boolean).length;

  const handleCopySummary = async () => {
    if (!plan) return;
    const text = [
      `Vayumitra Air Quality Plan — ${plan.city} (AQI ${plan.aqi})`,
      plan.locationBrief,
      '',
      `Mask & Outdoor Rule: ${plan.maskAndOutdoorRule}`,
      '',
      'Daily Routines:',
      ...plan.dailyRoutines.map((r) => `- [${r.timeWindow}] ${r.title}: ${r.action}`),
      '',
      'Indoor Air Hacks:',
      ...plan.indoorHacks.map((h) => `- [${h.costTier}] ${h.title}: ${h.steps}`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedPlan(true);
      setTimeout(() => setCopiedPlan(false), 2200);
    } catch {
      // Clipboard blocked in sandboxed iframe; ignore gracefully
    }
  };

  return (
    <section
      aria-labelledby="planner-heading"
      className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6"
    >
      {/* Lifestyle & Household Tailor Bar */}
      <div className="rounded-2xl border border-[var(--vayu-border)] bg-[var(--vayu-surface)] p-6">
        <div className="flex flex-col gap-4 border-b border-[var(--vayu-border)] pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="planner-heading" className="font-display text-xl font-bold text-[var(--vayu-ink)]">
              Tailor Vayumitra to Your Household & Commute
            </h2>
            <p className="mt-1 text-sm text-[var(--vayu-ink-muted)]">
              Configure your daily routine so Vayumitra adapts low-emission habits, indoor hacks,
              and swaps to {location ? `${location.name} (AQI ${location.aqi})` : 'your Indian city'}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {plan && (
              <button
                type="button"
                onClick={() => void handleCopySummary()}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-[var(--vayu-border)] bg-[var(--vayu-bg)] px-4 py-2.5 text-xs font-semibold text-[var(--vayu-ink)] transition-colors hover:border-[var(--vayu-accent)]"
              >
                {copiedPlan ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                    <span>Copied Plan</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copy Family Plan</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onGeneratePlan}
              disabled={loading || !location}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-[var(--vayu-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--vayu-accent-ink)] transition-colors hover:bg-[var(--vayu-accent-hover)] disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{loading ? 'Updating Plan...' : 'Refresh GenAI Plan'}</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--vayu-ink-muted)]">
              Household Profile
            </span>
            <select
              value={profile.householdType}
              onChange={(e) => onProfileChange({ ...profile, householdType: e.target.value })}
              className="w-full rounded-lg border border-[var(--vayu-border)] bg-[var(--vayu-bg)] px-3 py-2 text-sm text-[var(--vayu-ink)] focus:border-[var(--vayu-accent)] focus:outline-none"
            >
              {HOUSEHOLD_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--vayu-ink-muted)]">
              Daily Commute Mode
            </span>
            <select
              value={profile.commuteMode}
              onChange={(e) => onProfileChange({ ...profile, commuteMode: e.target.value })}
              className="w-full rounded-lg border border-[var(--vayu-border)] bg-[var(--vayu-bg)] px-3 py-2 text-sm text-[var(--vayu-ink)] focus:border-[var(--vayu-accent)] focus:outline-none"
            >
              {COMMUTE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--vayu-ink-muted)]">
              Indoor & Cooking Setup
            </span>
            <select
              value={profile.homeSetup}
              onChange={(e) => onProfileChange({ ...profile, homeSetup: e.target.value })}
              className="w-full rounded-lg border border-[var(--vayu-border)] bg-[var(--vayu-bg)] px-3 py-2 text-sm text-[var(--vayu-ink)] focus:border-[var(--vayu-accent)] focus:outline-none"
            >
              {HOME_SETUP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--vayu-ink-muted)]">
              Priority Focus
            </span>
            <select
              value={profile.primaryGoal}
              onChange={(e) => onProfileChange({ ...profile, primaryGoal: e.target.value })}
              className="w-full rounded-lg border border-[var(--vayu-border)] bg-[var(--vayu-bg)] px-3 py-2 text-sm text-[var(--vayu-ink)] focus:border-[var(--vayu-accent)] focus:outline-none"
            >
              {GOAL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--vayu-border)] bg-[var(--vayu-surface-muted)] px-3.5 py-2.5 text-xs text-[var(--vayu-ink)]"
          >
            <span>{error}</span>
            {!loading && location && (
              <button
                type="button"
                onClick={onGeneratePlan}
                className="shrink-0 rounded-md bg-[var(--vayu-accent)] px-3 py-1 font-semibold text-[var(--vayu-accent-ink)] transition-colors hover:bg-[var(--vayu-accent-hover)]"
              >
                Retry Plan
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inline Updating Banner when regenerating over an existing plan */}
      {loading && plan && (
        <div
          role="status"
          aria-live="polite"
          className="mt-6 flex items-center gap-2.5 rounded-xl border border-[var(--vayu-border)] bg-[var(--vayu-surface)] px-4 py-3 text-sm font-medium text-[var(--vayu-ink)]"
        >
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-[var(--vayu-accent)]" aria-hidden="true" />
          <span>
            Tailoring Vayumitra plan for{' '}
            {location ? `${location.name} (AQI ${location.aqi})` : 'your city'}...
          </span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !plan && (
        <div role="status" aria-live="polite" className="mt-6 space-y-4">
          <div className="flex items-center gap-2 text-sm text-[var(--vayu-ink-muted)]">
            <RefreshCw className="h-4 w-4 animate-spin text-[var(--vayu-accent)]" aria-hidden="true" />
            <span>
              Generating Vayumitra plan for{' '}
              {location ? `${location.name} (AQI ${location.aqi})` : 'your city'}...
            </span>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--vayu-surface-muted)]" />
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--vayu-surface-muted)]" />
          </div>
        </div>
      )}

      {/* Populated Plan */}
      {plan && (
        <div
          className={`mt-8 space-y-9 transition-opacity duration-200 ${
            loading ? 'pointer-events-none opacity-60' : 'opacity-100'
          }`}
        >
          {/* Briefing & Live Direct Impact Calculator */}
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="rounded-2xl border border-[var(--vayu-border)] bg-[var(--vayu-surface)] p-6 lg:col-span-8">
              <div className="text-xs font-semibold text-[var(--vayu-accent)]">
                Location Briefing · {plan.city} (AQI {plan.aqi})
              </div>
              <p className="mt-2 font-display text-lg font-semibold leading-snug text-[var(--vayu-ink)]">
                {plan.locationBrief}
              </p>
              <div className="mt-4 grid gap-4 border-t border-[var(--vayu-border)] pt-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-[var(--vayu-ink-muted)]">
                    Local Airshed & Smog Dynamics
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--vayu-ink)]">
                    {plan.winterSmogDynamics}
                  </p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[var(--vayu-ink-muted)]">
                    Mask & Outdoor Exposure Rule
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--vayu-ink)]">
                    {plan.maskAndOutdoorRule}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-[var(--vayu-border)] bg-[var(--vayu-surface-muted)] p-6 lg:col-span-4">
              <div>
                <div className="text-xs font-semibold text-[var(--vayu-accent)]">
                  Your Direct Choice Impact
                </div>
                <p className="mt-1 text-xs text-[var(--vayu-ink-muted)]">
                  Check off routines, indoor hacks, and swaps below to quantify your family impact.
                </p>

                <div aria-live="polite" className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="font-mono text-3xl font-bold tabular-nums text-[var(--vayu-ink)]">
                      -{selectedExposureReduction}%
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--vayu-ink-muted)]">
                      PM2.5 exposure drop
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-3xl font-bold tabular-nums text-[var(--vayu-ink)]">
                      {selectedCo2Saved.toFixed(1)}{' '}
                      <span className="text-sm font-normal">kg</span>
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--vayu-ink-muted)]">
                      CO₂e avoided / week
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-[var(--vayu-border)] pt-3 text-xs leading-relaxed text-[var(--vayu-ink)]">
                <span className="font-mono font-semibold tabular-nums">
                  {totalActionsSelected}
                </span>{' '}
                actions committed · {plan.impactSummary}
              </div>
            </div>
          </div>

          <DailyRoutinesGrid
            routines={plan.dailyRoutines}
            checkedRoutines={checkedRoutines}
            onToggle={(id) => toggleItem(setCheckedRoutines, id)}
          />

          <IndoorHacksGrid
            hacks={plan.indoorHacks}
            checkedHacks={checkedHacks}
            onToggle={(id) => toggleItem(setCheckedHacks, id)}
          />

          <SustainableSwapsList
            swaps={plan.sustainableAlternatives}
            checkedSwaps={checkedSwaps}
            onToggle={(id) => toggleItem(setCheckedSwaps, id)}
          />
        </div>
      )}
    </section>
  );
}
