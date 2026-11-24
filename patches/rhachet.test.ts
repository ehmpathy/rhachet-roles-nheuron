import { join } from 'path';
import { given, then, when } from 'test-fns';

// the patched dist module — rhachet's `exports` map hides it, so it is reached by file path
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { asSuggestedAwsSsoProfileName } = require(
  join(
    process.cwd(),
    'node_modules/rhachet/dist/domain.operations/keyrack/adapters/mechanisms/aws.sso/setupAwsSsoWithGuide.js',
  ),
);

/**
 * .what = clamps the rhachet patch that names a suggested sso profile `$awsOrg.$env.$owner`
 * .why = the unpatched suggestion was `$slotOrg.$account`, so the nheuron-root account, set
 *   through an ehmpathy slot, became `ehmpathy.nheuronroot` — and the sso portal picker, which
 *   labels each portal by the prefix its profiles share, then labeled nheuron's portal
 *   "ehmpathy". a reinstall that drops `patches/rhachet.patch` goes red here, not in the picker
 *
 * .note = remove once rhachet ships the fix upstream and the patch is dropped
 */
describe('rhachet patch: asSuggestedAwsSsoProfileName', () => {
  given('[case1] an account that names its own aws org', () => {
    when('[t0] it is set through a slot of the same org', () => {
      then('the name is $awsOrg.$env.$owner', () => {
        expect(
          asSuggestedAwsSsoProfileName({
            org: 'nheuron',
            env: 'prep',
            owner: 'ehmpath',
            accountName: 'nheuron-prep',
          }),
        ).toEqual('nheuron.prep.ehmpath');
      });
    });

    when('[t1] it is set through a slot of another org', () => {
      then('the aws org comes from the account, never the slot', () => {
        // the defect: this case once suggested `ehmpathy.nheuronroot`
        expect(
          asSuggestedAwsSsoProfileName({
            org: 'ehmpathy',
            env: 'sudo',
            owner: 'ehmpath',
            accountName: 'nheuron-root',
          }),
        ).toEqual('nheuron.sudo.ehmpath');
      });
    });
  });

  given('[case2] an account name with no org prefix', () => {
    when('[t0] the name is suggested', () => {
      then('the slot org stands in', () => {
        expect(
          asSuggestedAwsSsoProfileName({
            org: 'ehmpathy',
            env: 'prep',
            owner: 'ehmpath',
            accountName: 'Production',
          }),
        ).toEqual('ehmpathy.prep.ehmpath');
      });
    });
  });

  given('[case3] no keyrack owner', () => {
    when('[t0] the name is suggested', () => {
      then('the owner segment is dropped, never a blank', () => {
        expect(
          asSuggestedAwsSsoProfileName({
            org: 'nheuron',
            env: 'prod',
            owner: null,
            accountName: 'nheuron-prod',
          }),
        ).toEqual('nheuron.prod');
      });
    });
  });
});
