# howto: create gmail service account

## .what

guide for create a google service account with domain-wide delegation for gmail api access.

## .why

service accounts enable automated gmail access without browser oauth flow:
- no token expiry concerns (jwt-based auth)
- no human interaction needed
- works for ci/cd pipelines
- can impersonate any workspace user

## .requirements

- google workspace domain (not personal @gmail.com)
- workspace admin access
- google cloud project

---

## step 1: create service account

1. go to [google cloud console](https://console.cloud.google.com)
2. select or create a project
3. navigate to **iam & admin** → **service accounts**
4. click **create service account**
5. name it (e.g., `gmail-collector`)
6. click **create and continue**
7. skip role assignment (not needed for gmail api)
8. click **done**

## step 2: create key

1. click the service account you created
2. go to **keys** tab
3. click **add key** → **create new key**
4. select **json** format
5. download the json file (this is `GMAIL_SERVICE_ACCOUNT_JSON`)

## step 3: enable gmail api

1. navigate to **apis & services** → **library**
2. search for **gmail api**
3. click **enable**

## step 4: enable domain-wide delegation

1. go back to **iam & admin** → **service accounts**
2. click your service account
3. expand **show domain-wide delegation**
4. check **enable google workspace domain-wide delegation**
5. save

## step 5: authorize in workspace admin

1. go to [google workspace admin](https://admin.google.com)
2. navigate to **security** → **access and data control** → **api controls**
3. click **manage domain-wide delegation**
4. click **add new**
5. enter:
   - **client id**: from service account details (numeric id)
   - **oauth scopes**: `https://www.googleapis.com/auth/gmail.readonly`
6. click **authorize**

---

## keyrack setup

add credentials to keyrack:

```yaml
# .agent/keyrack.yml
env.test:
  - GMAIL_SERVICE_ACCOUNT_JSON     # the downloaded json (as single line)
  - GMAIL_SERVICE_ACCOUNT_SUBJECT  # email to impersonate (e.g., test@yourdomain.com)
```

fill the credentials:

```bash
rhx keyrack fill --owner ehmpath --env test
# paste json as single line for GMAIL_SERVICE_ACCOUNT_JSON
# enter email address for GMAIL_SERVICE_ACCOUNT_SUBJECT
```

---

## verify setup

```bash
rhx keyrack unlock --owner ehmpath --env test
rhx gather.mail --from gmail --address $GMAIL_SERVICE_ACCOUNT_SUBJECT
```

---

## common errors

| error | cause | fix |
|-------|-------|-----|
| `token exchange failed` | delegation not configured | complete step 5 in workspace admin |
| `invalid_grant` | wrong subject email | ensure subject is in the workspace domain |
| `access_denied` | scope not authorized | verify scope in step 5 matches exactly |
| `invalid_client` | wrong client id | use numeric client id, not email |

---

## security notes

- service account json contains private key — treat as secret
- store only in keyrack, never commit to git
- limit scope to `gmail.readonly` for collector use
- revoke key immediately if compromised

