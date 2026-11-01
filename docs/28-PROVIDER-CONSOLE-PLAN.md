# 28 · Provider console (super admin business view) — brief, audit, plan, status

## Owner brief (verbatim, 2026-11-01)

> ak r kam krna hia super admin may ap nay sub shop ka as product owner mean i am kitnay logay k
> pasay aye hn mean software fee pay ki hai , kis shop ka kitna time rh gye hai , kon sa software
> package chl rha hai , total fee , pending fee, coming fee, kon online use kr rha kon offline use kr
> rha , kis nay kis chanel k through fee submit krwaye hai , keys k related info agr kise shopkeeper
> ko key bol gye ous ki key m dakh rha hun ous ko resend be kr skta hun. key renew , key generator ,
> magic link to show key agr ye kr sktay ho agr ye free hai tu phr . r khud say dakh lyna r kia chez
> honi chye is may add krna , phlay proper search kr k kam start krna

In English: as the product owner I want to see how many shops paid their software fee, how much
time each shop has left, which package each runs, total / pending / upcoming fees, who uses the
online (cloud) app and who the offline (one-PC) install, through which channel each fee came, and
the license keys — see a shop's key if they lost it, resend it, renew it, generate keys, and a magic
link that shows the key (if free). Add whatever else belongs here; research first.

## Research (2026-11-01)

SaaS owner dashboards centre on MRR (monthly recurring revenue), active / trial / churned
customers, ARPU, renewals and collections; billing admin views add past-due and upcoming charges
per customer. License-key tools offer resend (email / message), revoke ("immediately unusable"),
per-install activation lists and offline activation codes with a validity window. Sources:
segmetrics.io subscriptions dashboard, saaslogic "11 key metrics", Paddle metrics docs, Chariow
license tracking, Cryptlex reseller portal, LightBurn / LicenseSpring offline portals.

## What existed (audit)

| Need | Existed | Where | Action |
|---|---|---|---|
| Shop list with plan, fee, expiry, days left, status | yes | `admin/router._rows`, AdminPage | reuse |
| Pending proofs, approve / reject; this month's total | yes | `admin/fees` | reuse; add totals by channel, month and plan |
| Manual payments with receipts; payment channel | yes | `fees.record_manual`, `FeePayment.method` | reuse (channel = `method`) |
| Renewal codes (Ed25519, offline) | partial | `plan/renewal.py`; **issued codes were not stored**, only redeemed nonces | **add** `license_keys` table: every issued key kept with status, sends, views, magic link |
| Resend / revoke / renew a key; magic link | no | — | **add** routes + public page `/key/:token` (free: WhatsApp / SMS links, no paid gateway) |
| Which shop uses cloud vs one-PC install; online now | no | `users.last_login_at` only | **add** `organisations.deployment`, `last_active_at` (touched on API use, throttled), `install_last_seen_at`, `install_version`; one-PC heartbeat `POST /public/heartbeat` |
| One-PC redeem of a key | broken | code tied to the SaaS org id, the local org has its own id | **fix**: in `LOCAL_MODE` the first valid key binds `organisations.license_org_id`; later keys must match |
| Upcoming fees, overdue, MRR, collections by month | no | — | **add** `GET /admin/business/overview` |

## Plan / what was built

Built 2026-11-01 — see `docs/06-PROGRESS.md` "Phase 11" and ADR-039. One-PC installs report only when the shop PC has internet and `SAAS_URL` is set in its `.env` (e.g. `SAAS_URL=https://mobileshop.oopsolutions.com`).

## Assumptions
1. "Online" = cloud shops (the website / Android app); "offline" = the one-PC Windows install. A cloud
   shop is "active now" when its staff used the app in the last 10 minutes.
2. Fees counted are approved fee payments (`FeePayment.status = approved`); pending proofs are shown
   apart. "Coming fee" = the monthly fee of shops whose plan ends in the next 30 days (and of shops
   already overdue, shown separately).
3. MRR = sum of the monthly fee of shops on a paid plan that is not expired / locked.
4. A magic link is valid 7 days, shows only that one key, and every open is counted.
5. Revoking blocks a key on the cloud and in the one-PC heartbeat answer; a key already redeemed
   offline before the revoke cannot be taken back.
