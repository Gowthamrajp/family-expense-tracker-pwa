/**
 * Privacy-mode state provider.
 *
 * Privacy mode lets a member quickly blur monetary amounts on screen (for use
 * in public/shared settings). The choice is persisted to `localStorage` so it
 * survives reloads, and exposed via {@link usePrivacy} to the top-bar toggle
 * and the {@link Money} component, which blurs itself while privacy mode is on.
 *
 * This is a presentation-only concern: it never affects stored data or what is
 * fetched, only how amounts are displayed.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Value exposed by {@link PrivacyContext} via {@link usePrivacy}. */
export interface PrivacyContextValue {
  /** Whether monetary amounts should be blurred on screen. */
  isPrivate: boolean;
  /** Toggle privacy mode on/off. */
  toggle: () => void;
  /** Set privacy mode explicitly. */
  setPrivate: (value: boolean) => void;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

/** localStorage key persisting the privacy-mode preference. */
const STORAGE_KEY = 'familyvault.privacyMode';

/** Read the persisted preference, defaulting to off. */
function readInitial(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Props for {@link PrivacyProvider}. */
export interface PrivacyProviderProps {
  children: ReactNode;
}

/**
 * Provide privacy-mode state to descendants.
 *
 * @see usePrivacy for consuming the provided value.
 */
export function PrivacyProvider({ children }: PrivacyProviderProps): JSX.Element {
  const [isPrivate, setIsPrivate] = useState<boolean>(readInitial);

  // Persist changes so the preference survives reloads.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, isPrivate ? '1' : '0');
    } catch {
      // Ignore storage failures (private browsing, quota); state still applies.
    }
  }, [isPrivate]);

  const toggle = useCallback(() => setIsPrivate((current) => !current), []);
  const setPrivate = useCallback((value: boolean) => setIsPrivate(value), []);

  const value = useMemo<PrivacyContextValue>(
    () => ({ isPrivate, toggle, setPrivate }),
    [isPrivate, toggle, setPrivate],
  );

  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}

/**
 * Access the current {@link PrivacyContextValue}.
 *
 * @throws Error when called outside of a {@link PrivacyProvider}.
 */
export function usePrivacy(): PrivacyContextValue {
  const value = useContext(PrivacyContext);
  if (value === null) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return value;
}
