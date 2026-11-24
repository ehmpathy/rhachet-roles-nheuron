/**
 * .what = the account-delegation principal of an aws account, for a role trust policy
 * .why = `arn:aws:iam::<account>:root` does NOT mean the root user. it delegates the trust
 *   decision to the account's own iam: any principal in that account whose policy allows
 *   `sts:AssumeRole` on the role may assume it
 */
export const asIamRootPrincipalArn = (input: { account: string }): string =>
  `arn:aws:iam::${input.account}:root`;
