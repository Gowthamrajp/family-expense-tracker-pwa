/**
 * Collapsible glass-card section used to declutter the Family settings screen.
 *
 * Renders the shared glass-card shell with a full-width header button that
 * toggles the body open/closed. The header shows an optional leading icon
 * chip, a title, an optional subtitle, an optional trailing badge (e.g. a
 * count), and an expand/collapse chevron. The body content is only rendered
 * while expanded, so several heavy management cards can sit on one screen
 * without overwhelming the member.
 *
 * Sections are collapsed by default (`defaultExpanded` overrides this) so the
 * page reads as a compact list of sections the member can open as needed.
 */
import { useId, useState } from 'react';

/** Props for {@link CollapsibleCard}. */
export interface CollapsibleCardProps {
  /** Section title shown in the header (rendered as an h2). */
  title: string;
  /** Optional supporting line beneath the title. */
  subtitle?: string;
  /** Optional Material Symbols icon name shown in a leading chip. */
  icon?: string;
  /** Optional trailing badge (e.g. an item count) shown before the chevron. */
  badge?: React.ReactNode;
  /** Whether the section starts expanded. Defaults to `false` (collapsed). */
  defaultExpanded?: boolean;
  /** Optional test id applied to the card section. */
  testId?: string;
  /** Section body, rendered only while expanded. */
  children: React.ReactNode;
}

/**
 * Render a collapsible glass-card section with a header toggle.
 *
 * The header is a single button (keyboard accessible, `aria-expanded` set) so
 * the entire title row is the affordance; the body is shown only when open.
 */
export function CollapsibleCard({
  title,
  subtitle,
  icon,
  badge,
  defaultExpanded = false,
  testId,
  children,
}: CollapsibleCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const headingId = useId();
  const regionId = useId();

  return (
    <section className="glass-card glass-card-hover" data-testid={testId}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={regionId}
        className="w-full flex items-center gap-3 p-card_padding text-left"
      >
        {icon && (
          <span className="shrink-0 w-10 h-10 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container">
            <span className="material-symbols-outlined" aria-hidden="true">
              {icon}
            </span>
          </span>
        )}
        <span className="flex-1 min-w-0">
          <h2 id={headingId} className="text-headline-md font-semibold text-on-surface">
            {title}
          </h2>
          {subtitle && (
            <span className="block text-sm text-on-surface-variant mt-0.5">{subtitle}</span>
          )}
        </span>
        {badge !== undefined && badge !== null && (
          <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-surface-container-high/60 text-on-surface-variant">
            {badge}
          </span>
        )}
        <span
          className="shrink-0 material-symbols-outlined text-on-surface-variant transition-transform"
          aria-hidden="true"
        >
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {expanded && (
        <div
          id={regionId}
          role="region"
          aria-labelledby={headingId}
          className="px-card_padding pb-card_padding flex flex-col gap-4"
        >
          {children}
        </div>
      )}
    </section>
  );
}
