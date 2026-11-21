/**
 * .what = authentication state for a mechanism
 * .why = enables callers to check auth before operations
 */
export type GatherAuthStatus = 'authenticated' | 'expired' | 'anonymous';
