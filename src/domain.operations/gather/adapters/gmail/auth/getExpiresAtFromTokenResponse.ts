/**
 * .what = compute expires_at date from token response expires_in seconds
 * .why = pure transformer for token expiry calculation
 */
export const getExpiresAtFromTokenResponse = (input: {
  expiresIn: number;
  now?: Date;
}): Date => {
  const baseTime = input.now ?? new Date();
  return new Date(baseTime.getTime() + input.expiresIn * 1000);
};
