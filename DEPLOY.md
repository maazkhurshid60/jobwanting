# Deploying this panel

A private email campaign tool. The front page at `/` is the only public page;
everything else is behind a session cookie checked in `proxy.ts`.

## 1. Environment variables

All sixteen must be set on the host. The app reads exactly these — nothing
else — and several fail closed rather than degrading, so a missing one shows
up as a locked-out panel rather than a warning.

| Variable | What breaks without it |
|---|---|
| `TURSO_DATABASE_URL` | Everything. No data at all. |
| `TURSO_AUTH_TOKEN` | Same. |
| `ADMIN_USERNAME` | Nobody can sign in. |
| `ADMIN_PASSWORD` | Same. |
| `SESSION_SECRET` | Sign-in succeeds, then every request is rejected: `proxy.ts` cannot verify the cookie it just issued. |
| `TOKEN_ENCRYPTION_KEY` | The vault cannot decrypt stored credentials. |
| `BREVO_API_KEY` | Campaigns fail at send. |
| `BREVO_SENDER_EMAIL` | Same. |
| `BREVO_SENDER_NAME` | Same. |
| `BREVO_REPLY_TO_EMAIL` | Same. |
| `CRON_SECRET` | The scheduler worker returns 401 to *everything*, including the cron. It fails closed on purpose — see `app/api/scheduler/run/route.ts`. |
| `TOPECHELON_CLIENT_ID` | Big Biller connect flow. |
| `TOPECHELON_CLIENT_SECRET` | Same. |
| `TOPECHELON_REDIRECT_URI` | Same — **and this one must change on deploy, see below.** |
| `TOPECHELON_AUTHORIZE_URL` | Same. |
| `TOPECHELON_TOKEN_URL` | Same. |

`NEW_TURSO_DATABASE_URL` and `NEW_TURSO_AUTH_TOKEN` are in the local env file
but nothing reads them. Leave them out unless something starts to.

## 2. The redirect URI has to change

`TOPECHELON_REDIRECT_URI` currently points wherever this panel used to live.
On deploy it must become:

```
https://<your-domain>/api/auth/callback
```

and the **same** URL has to be registered on the Top Echelon application. OAuth
compares them as exact strings; a trailing slash or `http` instead of `https`
is enough to fail, and it fails at the callback, after the user has already
approved — so it looks like the panel is broken rather than misconfigured.

## 3. Scheduled sends

`.github/workflows/scheduler.yml` POSTs to `/api/scheduler/run` every five
minutes. The worker authenticates the `Authorization: Bearer $CRON_SECRET`
header and takes one campaign per tick because sending is sequential.

**This used to be a `crons` block in `vercel.json`, and that is why nothing
deployed between 13 September and 16 October 2026.** Vercel's Hobby plan allows
daily crons only, and it does not warn about a more frequent one — it rejects
the entire deployment. Every push in that window was refused before it built,
so production stayed on the 11 September build for a month while the repo moved
on. If the project ever goes to Pro, the schedule can move back into
`vercel.json` and this workflow can be deleted.

The workflow needs two repository secrets, under Settings → Secrets and
variables → Actions:

| Secret | Value |
| --- | --- |
| `CRON_SECRET` | Identical to the `CRON_SECRET` environment variable in Vercel. If they drift, every tick gets a 401 and the run fails loudly, which is intended — a silently unauthorised tick is indistinguishable from "nothing was due". |
| `APP_URL` | The deployment origin, no trailing slash, e.g. `https://jobwanting.vercel.app`. |

Hobby also caps function execution at 60 seconds regardless of the
`maxDuration = 300` the route asks for. The route is written to survive being
killed part-way: it reaps its own stale claims after 15 minutes, and a late or
failed tick sends late rather than skipping, because each run claims whatever
is due at the moment it runs.

To trigger a run by hand:

```
curl "https://<your-domain>/api/scheduler/run?key=$CRON_SECRET"
```

## 4. After deploying

- Sign in at `/feb58da15ece`. The panel itself is at `/bd825db8c738`; visiting
  it without a session redirects to sign-in, and `/admin` returns 404 by
  design so scanners get nothing.
- Connect Big Biller at `/connect` if the client uses it.
- Send one campaign to a list of one address before handing over. Sending is
  the only path that touches Brevo, the tracking pixel and the unsubscribe
  link together, so it is the only check that exercises the whole chain.

## Notes

- The app is marked `noindex` in `app/layout.tsx`. Keep it that way.
- The sign-in link on the front page is the only place a private path appears
  in public HTML. It is fenced in one marked block in `app/page.tsx`; deleting
  that block leaves the tool reachable only to someone who already has the
  URL, which is the stronger setting if the client is happy to bookmark it.
- `.env.local` is gitignored and has never been committed. Keep it that way,
  and set the values through the host's own environment settings.
