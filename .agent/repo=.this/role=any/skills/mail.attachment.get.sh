#!/usr/bin/env bash
######################################################################
# ⛵ mail.attachment.get — pull the attachments of one inbound mail to disk
#
# .what = reads one raw rfc822 object from an env's mail bucket, parses it,
#         and writes each attachment as a file under .temp/mail.attachments/
#
# .why  = gather.mail keeps only attachment NAMES; a human who sends a photo
#         or a pdf wants it opened. the bytes live only in the raw object, so
#         this is the one read that reaches them, with no raw aws cli to approve
#
# usage:
#   rhx mail.attachment.get --env prod --key latest
#   rhx mail.attachment.get --env prod --key inbound/<object-id>
#   rhx mail.attachment.get help
#
# options:
#   --env ENV   the mailbox env: prep or prod (required)
#   --key KEY   the s3 object key, or `latest` = the newest object (required)
#
# guarantee:
#   - read-only on aws: s3 list + get only
#   - writes only under .temp/mail.attachments/<object-id>/ (gitignored)
#   - reads keyrack org=nheuron env=ENV for AWS_PROFILE + SES_MAIL_BUCKET
#   - exit 0 = written (or the mail holds none) · 1 = malfunction · 2 = constraint
######################################################################
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"

# emit a constraint refusal and exit 2
belay() {
  echo "🐈 belay that..."
  echo ""
  echo "⛵ mail.attachment.get"
  echo "   ├─ $1"
  echo "   └─ $2"
  exit 2
}

# parse arguments
ENV=""
KEY=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="${2:-}"
      shift 2
      ;;
    --key)
      KEY="${2:-}"
      shift 2
      ;;
    --skill|--repo|--role)
      shift 2 # rhx passthrough args
      ;;
    --)
      shift
      ;;
    help|--help|-h)
      echo "🐈 heres the deal..."
      echo ""
      echo "⛵ mail.attachment.get"
      echo "   ├─ usage: rhx mail.attachment.get --env <prep|prod> --key <latest|inbound/<id>>"
      echo "   └─ writes each attachment of one inbound mail under .temp/mail.attachments/"
      exit 0
      ;;
    *)
      belay "unknown argument: $1" "hint: rhx mail.attachment.get help"
      ;;
  esac
done
[[ "$ENV" == "prep" || "$ENV" == "prod" ]] || belay "invalid or absent --env: ${ENV:-(absent)}" "must be: prep or prod"
[[ -n "$KEY" ]] || belay "absent --key" "pass latest, or an object key from: rhx mail.inbound.status.get --env $ENV"

# one credential channel: the env's member profile + bucket from the nheuron slot
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN 2>/dev/null || true
PROFILE=$(rhx keyrack get --owner ehmpath --org nheuron --env "$ENV" --key AWS_PROFILE --output value 2>/dev/null || echo "")
[[ -n "$PROFILE" ]] || belay "absent: nheuron.$ENV.AWS_PROFILE" "fix: rhx keyrack unlock --owner ehmpath --org nheuron --env $ENV --key AWS_PROFILE"
BUCKET=$(rhx keyrack get --owner ehmpath --org nheuron --env "$ENV" --key SES_MAIL_BUCKET --output value 2>/dev/null || echo "")
[[ -n "$BUCKET" ]] || belay "absent: nheuron.$ENV.SES_MAIL_BUCKET" "fix: rhx keyrack unlock --owner ehmpath --org nheuron --env $ENV --key SES_MAIL_BUCKET"

# read, parse, write — via the sdk + mailparser the collector already depends on
cd "$REPO_ROOT"
AWS_PROFILE="$PROFILE" MAIL_BUCKET="$BUCKET" MAIL_KEY="$KEY" MAIL_ENV="$ENV" npx tsx -e "
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { simpleParser } from 'mailparser';
import { mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

const main = async () => {
  const s3 = new S3Client({ region: 'us-east-1' });
  const bucket = process.env.MAIL_BUCKET!;

  // the newest object, when asked for latest
  const key = process.env.MAIL_KEY === 'latest'
    ? (await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'inbound/' }))).Contents
        ?.filter((o) => o.Key && !o.Key.endsWith('/'))
        .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))[0]?.Key
    : process.env.MAIL_KEY;
  if (!key) throw new Error('no inbound object found');

  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const parsed = await simpleParser(await object.Body!.transformToString('utf-8'));

  const dir = join('.temp', 'mail.attachments', basename(key));
  mkdirSync(dir, { recursive: true });
  const written = parsed.attachments.map((attachment, index) => {
    const name = basename(attachment.filename ?? 'attachment-' + index);
    const path = join(dir, name);
    writeFileSync(path, attachment.content);
    return { path, type: attachment.contentType, bytes: attachment.size };
  });

  console.log('🐈 heres the haul...');
  console.log('');
  console.log('⛵ mail.attachment.get --env ' + process.env.MAIL_ENV + ' --key ' + key);
  console.log('   ├─ from: ' + (parsed.from?.text ?? '(none)'));
  console.log('   ├─ subject: ' + (parsed.subject ?? '(none)'));
  if (written.length === 0) { console.log('   └─ attachments: 0'); return; }
  console.log('   └─ attachments: ' + written.length);
  written.forEach((w, i) => console.log('      ' + (i === written.length - 1 ? '└─ ' : '├─ ') + w.path + ' (' + w.type + ', ' + w.bytes + ' bytes)'));
};
main().catch((error) => { console.error('💥 MalfunctionError: ' + error.message); process.exit(1); });
"
