/**
 * Shared visual language for cash-flow direction.
 *
 * Income (money in) and Expense (money out) must look consistent everywhere:
 * income is green with a downward in-arrow, expense is red with an upward
 * out-arrow. Centralizing the icon/color here keeps the dashboard tiles, the
 * transactions list, and any future surfaces in sync.
 */

/** Cash-flow direction of a record. */
export type FlowDirection = 'income' | 'expense';

/** Material Symbols arrow for a direction: income points down-in, expense up-out. */
export function flowArrowIcon(direction: FlowDirection): string {
  return direction === 'income' ? 'arrow_downward' : 'arrow_upward';
}

/**
 * Tailwind text-color class for a direction. Income is green; expense is the
 * theme's error/red. Used for the amount and the arrow so they always agree.
 */
export function flowColorClass(direction: FlowDirection): string {
  return direction === 'income' ? 'text-emerald-400' : 'text-error';
}

/** Tinted version of {@link flowColorClass} for subtle background chips/icons. */
export function flowColorClassDim(direction: FlowDirection): string {
  return direction === 'income' ? 'text-emerald-400/30' : 'text-error/30';
}
