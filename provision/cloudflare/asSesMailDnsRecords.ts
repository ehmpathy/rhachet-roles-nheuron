/**
 * .what = one dns record a ses domain identity owes its dns provider
 * .note = declastruct-aws's own shape also carries a `purpose` string, for the copy-paste
 *   instructions its apply prints. this derivation only ever feeds a declared cloudflare
 *   record, so no caller reads a purpose — it is omitted rather than carried dead. the
 *   readmes document each record's purpose in prose instead.
 */
export interface SesMailDnsRecord {
  type: 'MX' | 'CNAME' | 'TXT';
  name: string;
  value: string;
}

/**
 * .what = derives the dns records a ses DOMAIN identity owes: the inbound MX, the SPF TXT, the
 *   3 easy-dkim CNAMEs, and the DMARC TXT
 * .why = the dns wish must declare exactly what ses expects. pure computation over the mail
 *   domain + its dkim tokens, so it unit-tests with no live-aws dependency.
 *
 * .note = a local copy of declastruct-aws's own `asSesEmailIdentityDnsRecords`, which that
 *   package keeps internal (it is absent from `declastruct-aws`'s public sdk exports). the
 *   record forms are a ses contract rather than a declastruct one, so the duplication tracks a
 *   stable external shape. if declastruct-aws later exports the helper, import it and drop this.
 *
 * .note = v2 easy dkim proves domain ownership via the 3 dkim CNAMEs ALONE — there is NO
 *   separate `_amazonses` TXT ownership token (that was the v1 shape).
 *
 * .note = dmarc `p=none` is monitor-only — it enforces no policy, so it is safe to emit. a
 *   consumer who wants aggregate reports adds their own `rua=mailto:...`.
 */
export const asSesMailDnsRecords = (input: {
  domain: string;
  region: string;
  dkimTokens: readonly string[];
}): SesMailDnsRecord[] => {
  const { domain, region, dkimTokens } = input;

  // the two records that sit on the mail domain ITSELF (no label prefix): the mx that routes
  // inbound mail to ses, and the spf that authorizes ses to send. one record per leg — they
  // group by NAME, not by leg, which is what a dns provider keys on
  const atDomainItself: SesMailDnsRecord[] = [
    {
      type: 'MX',
      name: domain,
      value: `10 inbound-smtp.${region}.amazonaws.com`,
    },
    {
      type: 'TXT',
      name: domain,
      value: 'v=spf1 include:amazonses.com ~all',
    },
  ];

  // the 3 easy-dkim cnames (domain ownership + dkim signature)
  const dkim: SesMailDnsRecord[] = dkimTokens.map((token) => ({
    type: 'CNAME',
    name: `${token}._domainkey.${domain}`,
    value: `${token}.dkim.amazonses.com`,
  }));

  // the dmarc policy record, in monitor mode
  const dmarc: SesMailDnsRecord[] = [
    {
      type: 'TXT',
      name: `_dmarc.${domain}`,
      value: 'v=DMARC1; p=none',
    },
  ];

  return [...atDomainItself, ...dkim, ...dmarc];
};
