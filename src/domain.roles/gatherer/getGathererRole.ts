import { Role } from 'rhachet';

/**
 * .what = gatherer role definition
 * .why = enables mail collection from gmail and other async comms sources
 */
export const ROLE_GATHERER: Role = Role.build({
  slug: 'gatherer',
  name: 'Gatherer',
  purpose: 'collect mail and async comms from external sources',
  readme: { uri: `${__dirname}/readme.md` },
  traits: [],
  skills: {
    dirs: [{ uri: `${__dirname}/skills` }],
    refs: [],
  },
  // ⚠️ .note = NO role-local briefs DIR, deliberately. this once named `${__dirname}/briefs`
  //   — a directory that holds no file, and git does not track an empty directory, so it was
  //   absent on every fresh clone and in ci while it read as present here.
  //   the gatherer's knowledge lives at the repo level in `.agent/repo=.this/role=any/briefs/`,
  //   which the boot hook below already loads. name a dir here only alongside a brief that
  //   belongs to the gatherer ALONE (`rule.prefer.wet-over-dry` — carry no path with no content).
  briefs: {
    dirs: [],
  },
  hooks: {
    onBrain: {
      onBoot: [
        {
          command:
            './node_modules/.bin/rhachet roles boot --repo nheuron --role gatherer',
          timeout: 'PT60S',
        },
      ],
    },
  },
});
