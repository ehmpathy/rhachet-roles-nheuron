/**
 * .what = read the gmail service-account credentials keyrack placed in the env
 * .why = gmail has TWO auth mechanisms — a service account (ci/automation) and interactive
 *   oauth. this names which one is available, so the adapter can pick without a caller that
 *   must know either exists.
 *
 * .note = both values are declared under `env.test` in `.agent/keyrack.yml`, so this
 *   `process.env` read is the sanctioned one — keyrack itself placed them there
 *   (`rule.require.credentials-from-keyrack`).
 *
 * .note = a `null` here is NOT a swallowed credential failure. it says only "no service
 *   account", which routes to the oauth path — a different keyrack-sourced mechanism, never
 *   a non-keyrack fallback for the same secret. the oauth path fails loud on its own.
 *
 * .note = it lives beside the gmail adapter rather than in the shared `mail/` orchestrator
 *   so that a mechanism's auth strategy stays behind its own `GatherAuthAdapter` seam. the
 *   ses adapter keeps the same shape: `getSesConfig` is consulted only from inside
 *   `getSesAuthAdapter`, never from the caller.
 */
export const getGmailServiceAccountCredentials = (): {
  serviceAccountJson: string;
  subject: string;
} | null => {
  const serviceAccountJson = process.env.GMAIL_SERVICE_ACCOUNT_JSON;
  const subject = process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT;

  if (serviceAccountJson && subject) return { serviceAccountJson, subject };

  return null;
};
