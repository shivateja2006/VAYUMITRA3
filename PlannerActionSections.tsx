import { CheckCircle2, Circle, Home, Leaf, Route } from 'lucide-react';
import type {
  DailyRoutineItem,
  IndoorHackItem,
  SustainableAlternativeItem,
} from '../../types/aqi';

export const HOUSEHOLD_OPTIONS = [
  'Family with young children',
  'Elderly or asthma-sensitive household',
  'Daily office & school commuters',
  'Outdoor athletes & morning walkers',
];

export const COMMUTE_OPTIONS = [
  'Private car / cab rideshare',
  'Metro / city bus transit',
  'Two-wheeler / scooter',
  'Walking / cycling / work from home',
];

export const HOME_SETUP_OPTIONS = [
  'Cross-ventilation windows & LPG gas stove',
  'AC + HEPA air purifier',
  'High-rise apartment near main road',
  'Independent house with natural draft',
];

export const GOAL_OPTIONS = [
  'Protect family health & cut daily emissions',
  'Zero-cost indoor air quality hacks',
  'Lower household carbon & winter smog footprint',
];

export function DailyRoutinesGrid({
  routines,
  checkedRoutines,
  onToggle,
}: {
  routines: DailyRoutineItem[];
  checkedRoutines: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <div id="routines" className="space-y-4">
      <div className="flex items-center gap-2">
        <Route className="h-5 w-5 text-[var(--vayu-accent)]" aria-hidden="true" />
        <h3 className="font-display text-xl font-bold text-[var(--vayu-ink)]">
          Low-Emission Daily Routines
        </h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {routines.map((routine) => {
          const checked = Boolean(checkedRoutines[routine.id]);
          return (
            <button
              key={routine.id}
              type="button"
              aria-pressed={checked}
              onClick={() => onToggle(routine.id)}
              className={`flex flex-col justify-between rounded-2xl border p-5 text-left transition-colors ${
                checked
                  ? 'border-[var(--vayu-accent)] bg-[var(--vayu-surface-muted)]'
                  : 'border-[var(--vayu-border)] bg-[var(--vayu-surface)] hover:border-[var(--vayu-accent)]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs font-medium text-[var(--vayu-ink-muted)]">
                    {routine.timeWindow}
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono font-semibold tabular-nums text-[var(--vayu-accent)]">
                      -{routine.exposureReductionPct}% exposure
                    </span>
                  </div>
                  {checked ? (
                    <CheckCircle2
                      className="h-5 w-5 shrink-0 text-[var(--vayu-accent)]"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-5 w-5 shrink-0 text-[var(--vayu-ink-muted)]"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <h4 className="mt-2 font-display text-base font-bold text-[var(--vayu-ink)]">
                  {routine.title}
                </h4>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--vayu-ink)]">
                  {routine.action}
                </p>
              </div>

              <div className="mt-4 border-t border-[var(--vayu-border)] pt-3 text-xs text-[var(--vayu-ink-muted)]">
                <strong className="text-[var(--vayu-ink)]">Direct impact:</strong>{' '}
                {routine.whyItMatters} (saves ~{routine.co2SavedKgPerWeek} kg CO₂e/wk)
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function IndoorHacksGrid({
  hacks,
  checkedHacks,
  onToggle,
}: {
  hacks: IndoorHackItem[];
  checkedHacks: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <div id="indoor-hacks" className="space-y-4">
      <div className="flex items-center gap-2">
        <Home className="h-5 w-5 text-[var(--vayu-accent)]" aria-hidden="true" />
        <h3 className="font-display text-xl font-bold text-[var(--vayu-ink)]">
          Indoor Air Quality Hacks
        </h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {hacks.map((hack) => {
          const checked = Boolean(checkedHacks[hack.id]);
          return (
            <button
              key={hack.id}
              type="button"
              aria-pressed={checked}
              onClick={() => onToggle(hack.id)}
              className={`flex flex-col justify-between rounded-2xl border p-5 text-left transition-colors ${
                checked
                  ? 'border-[var(--vayu-accent)] bg-[var(--vayu-surface-muted)]'
                  : 'border-[var(--vayu-border)] bg-[var(--vayu-surface)] hover:border-[var(--vayu-accent)]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs font-medium text-[var(--vayu-ink-muted)]">
                    {hack.costTier}
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono font-semibold tabular-nums text-[var(--vayu-accent)]">
                      -{hack.indoorPmReductionPct}% indoor PM2.5
                    </span>
                  </div>
                  {checked ? (
                    <CheckCircle2
                      className="h-5 w-5 shrink-0 text-[var(--vayu-accent)]"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-5 w-5 shrink-0 text-[var(--vayu-ink-muted)]"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <h4 className="mt-2 font-display text-base font-bold text-[var(--vayu-ink)]">
                  {hack.title}
                </h4>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--vayu-ink)]">
                  {hack.steps}
                </p>
              </div>

              <div className="mt-4 border-t border-[var(--vayu-border)] pt-3 text-xs text-[var(--vayu-ink-muted)]">
                <strong className="text-[var(--vayu-ink)]">Why it works:</strong> {hack.directImpact}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SustainableSwapsList({
  swaps,
  checkedSwaps,
  onToggle,
}: {
  swaps: SustainableAlternativeItem[];
  checkedSwaps: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <div id="alternatives" className="space-y-4">
      <div className="flex items-center gap-2">
        <Leaf className="h-5 w-5 text-[var(--vayu-accent)]" aria-hidden="true" />
        <h3 className="font-display text-xl font-bold text-[var(--vayu-ink)]">
          Sustainable Alternatives & Direct Impact
        </h3>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--vayu-border)] bg-[var(--vayu-surface)]">
        <div className="divide-y divide-[var(--vayu-border)]">
          {swaps.map((swap) => {
            const checked = Boolean(checkedSwaps[swap.id]);
            return (
              <div
                key={swap.id}
                className={`grid gap-4 p-5 transition-colors lg:grid-cols-12 lg:items-center ${
                  checked ? 'bg-[var(--vayu-surface-muted)]' : ''
                }`}
              >
                <div className="lg:col-span-4">
                  <div className="text-xs font-medium text-[var(--vayu-ink-muted)]">
                    {swap.category} · Replaces: {swap.replaces}
                  </div>
                  <div className="mt-1 font-display text-base font-bold text-[var(--vayu-ink)]">
                    {swap.alternative}
                  </div>
                </div>

                <div className="text-sm text-[var(--vayu-ink)] lg:col-span-3">
                  <div className="text-xs font-semibold text-[var(--vayu-ink-muted)]">
                    Direct Family Health Impact
                  </div>
                  <p className="mt-0.5">{swap.directHealthImpact}</p>
                </div>

                <div className="text-sm text-[var(--vayu-ink)] lg:col-span-3">
                  <div className="text-xs font-semibold text-[var(--vayu-ink-muted)]">
                    Community Airshed Impact
                  </div>
                  <p className="mt-0.5">{swap.communityEmissionImpact}</p>
                </div>

                <div className="flex items-center justify-between gap-3 lg:col-span-2 lg:justify-end">
                  <span className="font-mono text-xs font-semibold tabular-nums text-[var(--vayu-accent)]">
                    -{swap.co2SavedKgPerWeek} kg/wk
                  </span>
                  <button
                    type="button"
                    aria-pressed={checked}
                    onClick={() => onToggle(swap.id)}
                    className={`whitespace-nowrap shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      checked
                        ? 'border-[var(--vayu-accent)] bg-[var(--vayu-accent)] text-[var(--vayu-accent-ink)]'
                        : 'border-[var(--vayu-border)] bg-[var(--vayu-bg)] text-[var(--vayu-ink)] hover:border-[var(--vayu-accent)]'
                    }`}
                  >
                    {checked ? 'Adopted' : 'Adopt Swap'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
