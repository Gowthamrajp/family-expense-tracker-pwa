/**
 * Currency formatting helper and privacy-aware money display.
 *
 * The whole app uses INR (en-IN locale) as its single currency. `formatINR`
 * centralizes that formatting so every screen renders amounts identically
 * (e.g. ₹1,00,000.00). The {@link Money} component renders a formatted amount
 * and blurs itself while privacy mode is active ({@link usePrivacy}), so a
 * member can hide figures on a shared screen without affecting stored data.
 */
import { usePrivacy } from '../state/PrivacyProvider';

/** Shared INR currency formatter (Indian digit grouping). */
const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
});

/** Format a numeric amount as INR currency (e.g. ₹1,00,000.00). */
export function formatINR(amount: number): string {
  return inrFormatter.format(amount);
}

/** Props for {@link Money}. */
export interface MoneyProps {
  /** The amount to render, in rupees. */
  amount: number;
  /** Extra classes for the rendered element. */
  className?: string;
  /** Optional test id. */
  testId?: string;
}

/**
 * Render a formatted INR amount that blurs while privacy mode is active.
 *
 * The text content is always the real formatted amount (so layout is stable
 * and screen readers still read it); only a CSS blur is applied visually when
 * privacy mode is on.
 */
export function Money({ amount, className = '', testId }: MoneyProps): JSX.Element {
  const { isPrivate } = usePrivacy();
  return (
    <span
      data-testid={testId}
      data-private={isPrivate ? 'true' : undefined}
      className={`${isPrivate ? 'blur-[8px] select-none transition-[filter] duration-300' : 'transition-[filter] duration-300'} ${className}`}
    >
      {formatINR(amount)}
    </span>
  );
}
