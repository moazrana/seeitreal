# User App — Subscriptions, Payments & UI Enhancement

**For:** Claude Code to implement.
**Relation to other specs:** Extends the **main SeeItReal spec** (billing, security §7) and the **Design Spec** (visual system). The Root App spec owns package/promo **management**; this doc owns how the client **subscribes, pays, and what happens to their content when payment lapses**.

---

## 1. Objective

Make SeeItReal fully **subscription-based** with two payment gateways, and enforce one core rule:

> **If a client's payment fails, their dish 3D/AR links stop working. When they pay, the links come back on.**

Plus: raise the UI so it feels innovative and premium, not a generic dashboard.

---

## 2. Subscription model

- Each restaurant is on a **subscription package** (defined and managed in the Root App — see that spec). A package carries: name, `price_pkr`, `price_usd`, billing interval (monthly/yearly), and limits (e.g. max items).
- Billing is **recurring**. The subscription has a status: `active` | `past_due` | `canceled` | `expired`, and a `current_period_end`.
- The one-time per-item setup fee and on-demand deal campaigns (from the main spec) are separate charges layered on top of the recurring subscription.

## 3. Payment gateways (two)

- **Safepay** → **Pakistani clients**, billed in **PKR**.
- **Stripe** → **international clients**, billed in **USD**.
- Route by **IP geolocation for the default**, but confirm by **billing country** at checkout (IP is a guess; billing country is truth). Store the resolved gateway on the subscription.
- Build both behind a **single payment abstraction** (`createSubscription`, `chargeSetupFee`, `cancel`, `handleWebhook`) with a Safepay implementation and a Stripe implementation, so app logic never branches on gateway.
- **Confirm subscription state only from verified gateway webhooks** (signature-checked). Never trust payment status sent from the browser.
- Verify whether Safepay supports recurring/subscription billing for your account; if it only does one-off charges cleanly, implement PKR recurring as scheduled invoices + retry rather than native subscriptions.

## 4. THE LIFECYCLE RULE — payment ↔ 3D-link state (core of this doc)

State machine driven by gateway webhooks:

1. **Payment succeeds / subscription active** → restaurant is `active`; all its dish AR/QR links resolve normally.
2. **Payment fails** → gateway sends a failed/`past_due` webhook → move restaurant to `past_due`. Apply a short **grace period** (configurable, e.g. 3–7 days, value from config) with dunning (retry + notify the owner) before expiring.
3. **Grace period ends without payment** → restaurant `expired` → **its dish links stop serving the model.**
4. **Payment succeeds again** → webhook → restaurant back to `active` → **links immediately serve again.**

How "links expire" must behave — important:
- **Do NOT delete the models, QR codes, or data.** Expiry only **gates access**. The GLB/USDZ, items, and QR codes stay intact so reactivation is instant and lossless.
- The **AR viewer page and QR resolver check the restaurant's subscription status** on each request. When `expired`, instead of the 3D model they return a **branded "This menu is temporarily unavailable" page** (clean, not a broken/500 error) — so a diner who scans an expired code sees something graceful, and the restaurant feels the pressure to pay.
- Reactivation is a **status flip**, not a rebuild — the same links light back up the moment payment clears.
- The Root App can also **manually reactivate/suspend** a restaurant (admin override).

Data model:
- `Subscription` — `restaurant_id`, `package_id`, `gateway`, `status`, `current_period_end`, `grace_until`, gateway references, timestamps.
- Restaurant gains an effective `is_active` derived from subscription status (used by the AR/QR resolver).
- Reuse the main spec's `Invoice/Charge` for the money records.

## 5. Client-facing subscription UX

- A **billing/subscription page** in the dashboard: current package, price in the client's currency, renewal date, payment method, invoice history, upgrade/downgrade.
- **Promo code entry** at checkout (validated against active codes — see Root App spec).
- Clear **status banners**: active (quiet), `past_due` (warning + "update payment" CTA), `expired` ("your menus are offline — reactivate" CTA). Honest, not alarmist.
- Dunning emails on failed payment, and a confirmation when links reactivate.

## 6. UI enhancement — make it innovative & attractive

Apply the approved **Design Spec** (dark midnight-navy theme, blue→violet→teal gradient as light, Space Grotesk + Inter) across the whole app, and lift it with these:

- **3D everywhere it matters.** Dashboard item cards show **live rotating 3D thumbnails** (`<model-viewer>`), not flat images — the product's magic should be visible while managing the menu, not just on the marketing site.
- **A "wow" onboarding moment.** First dish a restaurant uploads → show the finished 3D model spinning with a subtle reveal + "scan to see it on your table" — the aha moment early.
- **Live AR preview in the dashboard** — owners can rotate/preview each dish exactly as diners will, inline.
- **Motion with restraint** — micro-interactions on hover/upload/generation-complete; a satisfying state when a model finishes generating; gradient glow accents; glassmorphism on elevated panels. One orchestrated moment per screen, not animation everywhere (respect `prefers-reduced-motion`).
- **Bento-style dashboard** — asymmetric, varied hierarchy (not a grid of identical cards): a hero "most-viewed dish" tile, analytics sparkline, subscription status, QA status.
- **QR reveal** — generating a dish's QR animates it into view; downloadable as a styled, branded QR (not a plain black square).
- **Empty/expired states designed, not default** — the "menus temporarily unavailable" page and empty dashboards should look intentional and on-brand.

## 7. Security (reuse, don't relax)

- All gateway keys/secrets in `.env` (main spec §7.1); never in the frontend.
- **Webhook signature verification** for both Safepay and Stripe; reject unsigned/invalid.
- Subscription state changes only via verified webhooks or admin action — never from a client request.
- Rate limiting on checkout/webhook endpoints; input validation; parameterized DB access (main spec §7).

## 8. Acceptance criteria

- A restaurant can subscribe and pay via **Safepay (PKR)** or **Stripe (USD)**, routed by IP default + billing-country confirmation.
- On a **failed payment webhook**, after the grace period the restaurant's dish AR/QR links serve the **branded unavailable page**, with models/data preserved.
- On a **successful payment webhook**, the links **reactivate immediately** with no rebuild.
- Subscription status is driven only by verified webhooks (and admin override); never by client input.
- Promo codes entered at checkout validate against **active** codes.
- The dashboard shows live 3D thumbnails and clear subscription status; the app matches the Design Spec.
- All main-spec security rules hold; gateway keys are in `.env`.

## 9. Build order

1. `Subscription` model + migration; derive restaurant `is_active`.
2. Payment abstraction + Stripe implementation (subscribe, webhooks) → then Safepay implementation.
3. Subscription/billing page + promo entry + status banners.
4. **The lifecycle enforcement**: AR viewer + QR resolver check status → serve model or branded unavailable page; grace period + dunning; reactivation on payment.
5. UI enhancement pass (3D thumbnails, onboarding moment, motion, bento dashboard) per Design Spec.
