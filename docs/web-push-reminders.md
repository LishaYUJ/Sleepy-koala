# Sleep reminders

Sleepy Koala supports optional Web Push during registration setup (the bedtime onboarding
step) and in Settings for existing users. One opt-in enables both the 21:00 check-in
reminder and the reminder 30 minutes before the saved bedtime. No individual time
checkboxes or email delivery are added. Declining reminders never blocks registration.

## Behaviour

- Permission is requested only after clicking **Enable on this device**. An iPhone/iPad
  browser tab shows Home Screen installation steps; iOS/iPadOS 16.4+ is required.
- A service worker displays system notifications while the page is closed. Clicking
  one opens `/dashboard`; an expired login follows the existing sign-in flow.
- Already checked-in sleep dates are skipped. Reminders less than 15 minutes apart
  merge at the earlier time. A 21:00 goal has a 20:30 wind-down reminder; midnight
  has a 23:30 reminder on the same evening.
- Time zones are stored on push devices, separate from the existing device-local
  check-in calendar. DST follows the time-zone database. Returning to a visible app
  updates that device's zone. Travel cannot be detected while the app stays closed.
- Devices can send one test per minute or unsubscribe. Logout also
  unsubscribes the browser; server cleanup is best-effort for an expired/offline session.
  Account deletion cascades subscriptions and delivery records.
- Database claims prevent concurrent workers sending the same delivery. Transient
  failures retry up to three attempts within a five-minute due window; permanent
  failures stop that delivery, and HTTP 404/410 removes an expired subscription.
  An ambiguous network failure/crash can still cause a repeat delivery: stable push
  topics and notification tags replace duplicates rather than promise exactly-once.
- Push service TTL is five minutes. No morning catch-up. Delivery logs are retained
  for 14 days. No private notification endpoints or keys are written to HTTP logs.
- Permission, Focus mode, device connectivity, browser restrictions and service
  availability affect delivery. Push service acceptance is not proof of screen display.

## Backend configuration

Generate a persistent VAPID pair and independent dispatch secret once:

```sh
node scripts/generate-push-config.mjs https://my-sleepy-koala.vercel.app
```

This creates `.env.push.local` with mode 0600, excluded by `.gitignore`. The script
refuses to overwrite an existing file. The file is configuration input, not a file
the application automatically reads. Put its values into the backend's environment:

| Setting | Purpose |
| --- | --- |
| `WebPush__Enabled` | `true` after migration and scheduler setup; defaults to false |
| `WebPush__PublicKey` | Public VAPID key returned to authenticated clients |
| `WebPush__PrivateKey` | Secret key, backend only |
| `WebPush__Subject` | Real HTTPS contact URL or `mailto:` address |
| `WebPush__RunWorker` | `true` for a continuously running API; `false` with the external timer |
| `WebPush__DispatchKey` | At least 32 random characters; shared only with the timer |

Do not rotate VAPID keys on every deployment. Existing devices must resubscribe
after a rotation. Invalid enabled configuration fails startup rather than showing
users a non-working enabled switch.

Apply the new EF migration before exposing the push APIs:

```sh
dotnet ef database update --project backend/SleepyKoala.Api.csproj
```

The design-time factory uses `Database__Provider` and
`ConnectionStrings__DefaultConnection`. The new tables support SQLite and SQL Server.
Production should use deployment secrets/managed identity, never credentials in commands.

## Scheduling for the current F1 deployment

The existing `sleepy-koala-lisa` app uses Azure F1, which can idle. Its in-process
worker alone is not sufficient. The `reminder-timer` directory is an independent
Azure Functions Python timer, firing once per minute and calling the authenticated
internal dispatch endpoint. Use `WebPush__RunWorker=false` on the API for this mode.

`reminder-timer/infra/main.bicep` provisions a separate Flex Consumption function app,
plan, private storage account/container, and a system identity with access only to
that storage account. It does not change the existing App Service plan or SQL data.
No always-ready instances are configured. These are new metered Azure resources;
confirm the subscription, region availability and budget before provisioning. The
minimum scale ceiling of 40 is a limit, not 40 reserved/running instances.

Deployment sequence:

1. Build/test the API and frontend. Apply the database migration, deploy backend
   with push disabled, and deploy frontend.
2. Generate persistent production keys securely. Configure the backend environment
   above with `WebPush__RunWorker=false` and `WebPush__Enabled=true`.
3. Provision `main.bicep` in the intended resource group with `location`, `apiUrl`,
   and secure `dispatchKey` parameters. Pass the secret through a protected parameter
   file or deployment secret, never a literal in shell history. Choose a region
   listed by `az functionapp list-flexconsumption-locations` for this subscription.
4. The template sets `REMINDER_API_URL` and `REMINDER_DISPATCH_KEY`; the latter must
   exactly match the API's `WebPush__DispatchKey`. Allow managed-identity role
   assignments to propagate before publishing.
5. From `reminder-timer`, publish using Azure Functions Core Tools v4:
   `func azure functionapp publish <function-app-name>`. Python requirements are
   installed by the remote build. Verify `dispatch_reminders` is indexed and executes.
6. Observe successful internal dispatch calls (204) and timer invocations. A 401 means
   mismatched secrets; a 404 means dispatch disabled; repeated 5xx needs API/SQL checks.
   Configure Azure monitoring/alerts for timer failures and app quota exhaustion.

The timer can wake an idle API, but cannot overcome F1 daily CPU quotas or an outage.
This remains a best-effort small-product deployment. If usage grows, move the API to
a suitable always-on plan or run the dispatcher against the database in a dedicated
worker. Do not describe the current setup as guaranteed exact-time delivery.

## Acceptance check on a real device

1. iPhone: add the deployed HTTPS site to Home Screen, open it, and sign in.
2. Open Settings → Sleep reminders. Enable notifications; both reminders are included.
3. Send a test notification; check notification centre and tap it to open the dashboard.
4. Close the app, wait for a scheduled reminder, and verify its arrival.
5. Check in before the next reminder and confirm it is suppressed. Test disabling,
   logout, another account on the same device, and a second device.

Automated tests validate scheduling, ownership, short TTL, modern `aes128gcm`
encryption/VAPID, retries, expired subscriptions, deletion, and UI permission states.
They do not substitute for a real iPhone/Android closed-app delivery check.

References: [Apple Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
[Azure timer triggers](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer),
[Flex Consumption deployment](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-how-to).
