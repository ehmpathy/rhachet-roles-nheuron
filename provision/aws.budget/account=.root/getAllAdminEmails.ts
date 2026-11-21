import {
  type DeclaredAwsOrganizationAccount,
  type DeclaredAwsSsoInstance,
  type DeclaredAwsSsoPermissionSet,
  getAllSsoAccountAssignments,
  getAllSsoUsers,
  type getDeclastructAwsProvider,
  getOneSsoInstance,
} from 'declastruct-aws';
import { RefByPrimary, RefByUnique, refByUnique } from 'domain-objects';
import { UnexpectedCodePathError } from 'helpful-errors';

/**
 * .what = the aws context a declastruct-aws provider carries
 */
type ContextAwsProvider = Awaited<
  ReturnType<typeof getDeclastructAwsProvider>
>['context'];

/**
 * .what = the emails of every org admin — each sso user who holds the admin permission set on
 *   the management account
 * .why = spend alerts must reach whoever can act on them, and that set is exactly the admins.
 *   read live from identity center, so the alert list follows the admin roster with no second
 *   list to keep in sync, and no personal address ever lands in git or keyrack
 *
 * .note = read at plan time; a new admin hears alerts after the next budget apply
 */
export const getAllAdminEmails = async (
  input: { permissionSetName: string },
  context: ContextAwsProvider,
): Promise<string[]> => {
  // the identity center instance this org runs
  const ssoInstance = await getOneSsoInstance({ by: { auth: true } }, context);
  if (!ssoInstance)
    UnexpectedCodePathError.throw(
      'identity center is not enabled for this organization',
      { hint: 'enable it in us-east-1 first — see howto.bootstrap-aws-sso' },
    );
  const instance = refByUnique<typeof DeclaredAwsSsoInstance>(ssoInstance!);

  // the admins: every user assigned the admin permission set on the management account
  const assignments = await getAllSsoAccountAssignments(
    {
      where: {
        instance,
        permissionSet: RefByUnique.as<typeof DeclaredAwsSsoPermissionSet>({
          instance,
          name: input.permissionSetName,
        }),
        target: RefByPrimary.as<typeof DeclaredAwsOrganizationAccount>({
          id: context.aws.credentials.account,
        }),
      },
    },
    context,
  );
  const adminUserNames = new Set(
    assignments
      .filter((assignment) => assignment.principalType === 'USER')
      .map((assignment) => assignment.principal.userName),
  );

  // their emails, from the identity store
  const users = await getAllSsoUsers({ where: { instance } }, context);
  const emails = users
    .filter((user) => adminUserNames.has(user.userName))
    .map((user) => user.email);

  // an empty roster would silence every alert; fail loud instead
  if (emails.length === 0)
    UnexpectedCodePathError.throw('no org admin holds an email to alert', {
      permissionSetName: input.permissionSetName,
      hint: 'assign at least one sso user to the admin permission set on the management account',
    });
  return emails;
};
