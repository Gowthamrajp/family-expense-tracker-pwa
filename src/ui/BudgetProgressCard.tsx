/**
 * Monthly budget progress card for the Insights screen.
 *
 * Shows the current month's spend against the family's effective monthly limit
 * with a color-coded progress bar (under / warning / over), the remaining or
 * overspent amount, and the previous-month comparison. When percent-mode has no
 * previous-month baseline yet, it explains that the cap can't be derived. When
 * no budget is set, it shows a call-to-action pointing at Family settings.
 *
 * Pure presentation: it receives the already-computed status from
 * {@link useBudgetStatus}. Amounts honor privacy mode via {@link Money}.
 */
import type { Budget } from '../domain/types';
import type { BudgetStatus } from '../domain/budget';
import { Money, formatINR } from './Money';

/** Visual tokens per budget state. */
const STATE_STYLE: Record<
  BudgetStatus['state'],
  { bar: string; text: string; icon: string; chip: string }
> = {
  under: {
    bar: 'bg-primary-container',
    text: 'text-primary-container',
    icon: 'check_circle',
    chip: 'bg-primary-container/10 text-primary-container',
  },
  warning: {
    bar: 'bg-amber-400',
    text: 'text-amber-400',
    icon: 'warning',
    chip: 'bg-amber-400/10 text-amber-400',
  },
  over: {
    bar: 'bg-error',
    text: 'text-error',
    icon: 'error',
    chip: 'bg-error/10 text-error',
  },
};

/** Props for {@link BudgetProgressCard}. */
export interface BudgetProgressCardProps {
  budget: Budget | null;
  progress: BudgetStatus;
  currentTotal: number;
  previousTotal: number;
  monthKey: string;
}

function describeBudget(budget: Budget): string {
  if (budget.mode === 'amount') {
    return `${formatINR(budget.amount ?? 0)} / month`;
  }
  return `${budget.percent ?? 0}% of last month`;
}

/** Render the monthly budget progress card. */
export function BudgetProgressCard({
  budget,
  progress,
  currentTotal,
  previousTotal,
  monthKey,
}: BudgetProgressCardProps): JSX.Element {
  // No budget configured yet — invite the member to set one.
  if (budget === null) {
    return (
      <div className="col-span-12 glass-card glass-card-hover p-card_padding flex items-center gap-4">
        <span className="shrink-0 w-11 h-11 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container">
          <span className="material-symbols-outlined" aria-hidden="true">
            savings
          </span>
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-headline-md font-semibold text-on-surface">
            No monthly budget set
          </h2>
          <p className="text-sm text-on-surface-variant">
            Set a monthly budget in Family settings to track spending and get
            alerts as you add transactions.
          </p>
        </div>
      </div>
    );
  }

  const style = STATE_STYLE[progress.state];
  const hasLimit = progress.limit !== null && progress.limit > 0;
  // Percent-mode with no prior spend cannot derive a cap yet.
  const percentNoBaseline =
    budget.mode === 'percent' && previousTotal <= 0;
  const pct =
    progress.fraction === null ? 0 : Math.min(progress.fraction * 100, 100);

  return (
    <div className="col-span-12 glass-card glass-card-hover p-card_padding flex flex-col gap-4" data-testid="budget-progress-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-headline-md font-semibold text-on-surface">
            Monthly budget
          </h2>
          <p className="text-sm text-on-surface-variant">
            {describeBudget(budget)} · {monthKey}
          </p>
        </div>
        {hasLimit && (
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-full ${style.chip}`}
            data-testid="budget-state-chip"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {style.icon}
            </span>
            {progress.state === 'over'
              ? 'Over budget'
              : progress.state === 'warning'
                ? 'Almost there'
                : 'On track'}
          </span>
        )}
      </div>

      {percentNoBaseline ? (
        <p className="text-sm text-on-surface-variant">
          No spending recorded last month yet, so a {budget.percent}% cap can't
          be derived. The budget activates once last month has spend to compare
          against.
        </p>
      ) : (
        <>
          {/* Spent vs limit figures. */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="text-label-caps uppercase text-on-surface-variant">Spent</span>
              <Money
                amount={currentTotal}
                testId="budget-spent"
                className={`block text-[clamp(28px,6vw,40px)] leading-none font-extrabold tracking-tighter neon-glow ${style.text}`}
              />
            </div>
            {hasLimit && (
              <div className="text-right">
                <span className="text-label-caps uppercase text-on-surface-variant">Limit</span>
                <Money
                  amount={progress.limit ?? 0}
                  className="block font-mono-data text-lg text-on-surface mt-1"
                />
              </div>
            )}
          </div>

          {/* Progress bar. */}
          {hasLimit && (
            <div className="flex flex-col gap-1.5">
              <div className="h-3 w-full rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${style.bar}`}
                  style={{ width: `${pct}%` }}
                  data-testid="budget-bar"
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className={style.text}>
                  {progress.fraction !== null
                    ? `${(progress.fraction * 100).toFixed(0)}% used`
                    : ''}
                </span>
                {progress.remaining !== null && (
                  <span className="text-on-surface-variant">
                    {progress.remaining >= 0 ? (
                      <>
                        <Money amount={progress.remaining} className="text-on-surface" /> left
                      </>
                    ) : (
                      <>
                        <Money amount={-progress.remaining} className={style.text} /> over
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          )}

          {previousTotal > 0 && (
            <p className="text-xs text-on-surface-variant">
              Last month you spent {formatINR(previousTotal)}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
