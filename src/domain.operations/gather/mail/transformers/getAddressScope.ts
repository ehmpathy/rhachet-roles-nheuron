import { BadRequestError } from 'helpful-errors';

import { GatherAddressScope } from '@src/domain.objects/GatherAddressScope';

/**
 * .what = parse address string into { given, formed } + scope
 * .why = separates base address from mechanism-specific filters
 *
 * examples:
 *   'vlad@gmail.com' → { address: { given: 'vlad@gmail.com', formed: 'vlad@gmail.com' }, scope: null }
 *   'vlad@gmail.com/labels=work,urgent' → { address: { given: 'vlad@gmail.com/labels=work,urgent', formed: 'vlad@gmail.com' }, scope: { labels: ['work', 'urgent'] } }
 */
export const getAddressScope = (input: {
  address: string;
}): GatherAddressScope => {
  const given = input.address;

  // split on first '/' to separate base address from scope
  const slashIndex = given.indexOf('/');
  if (slashIndex === -1) {
    // no scope
    return new GatherAddressScope({
      address: { given, formed: given },
      scope: null,
    });
  }

  // parse base address and scope string
  const formed = given.slice(0, slashIndex);
  const scopeStr = given.slice(slashIndex + 1);

  // parse scope params via reduce (immutable)
  const params = scopeStr.split('&');
  const scope = params.reduce<Record<string, string[]>>((acc, param) => {
    // a stray separator (an '&' at the end) yields an empty segment — it names no scope, so skip it
    if (param === '') return acc;

    const eqIndex = param.indexOf('=');

    // ⚠️ a segment with no '=' is refused, never dropped. `vlad@gmail.com/inbox` reads as a
    // narrowed mailbox to the user, but `inbox` is not a key=value scope — a silent drop would
    // return the WHOLE mailbox while the user believes they filtered it. that is the same
    // parsed-then-dropped failhide the cli-flag guard closes one level up
    // (`rule.forbid.failhide`, `rule.require.failloud`).
    if (eqIndex === -1)
      return BadRequestError.throw(
        `address scope segment '${param}' is not a key=value pair`,
        {
          address: given,
          segment: param,
          hint: 'scope segments look like labels=work,urgent — separate multiple with &',
        },
      );

    const key = param.slice(0, eqIndex);
    const values = param.slice(eqIndex + 1).split(',');

    // immutable spread with new key
    return { ...acc, [key]: values };
  }, {});

  return new GatherAddressScope({
    address: { given, formed },
    scope: Object.keys(scope).length > 0 ? scope : null,
  });
};
