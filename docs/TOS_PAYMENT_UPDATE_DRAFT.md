# Terms of Service -- drafted payment-section update (NOT YET PUBLISHED)

Drafted now, at your request, so it's ready the moment you decide to go
live -- see `docs/PAYMENTS.md`'s "Going live" section for everything else
that also needs to happen first. **This has not been published**:
`app/terms/page.tsx` still shows the current, accurate "Cost" section
below, and should keep doing so until paid plans actually become
purchasable (`Free_Tier=false` and `PAYMENT_MODE=live`).

**This is drafted language, not legal advice.** I'm not a lawyer; have
this reviewed by one (and by whoever handles GST/consumer-protection
compliance) before publishing, especially the refund/cancellation and
auto-renewal language, which India's Consumer Protection (E-Commerce)
Rules and RBO e-mandate rules both touch.

## Current "Cost" section (still live, still accurate today)

> **Cost**
>
> findmyVybe is free -- there's no paid tier or subscription today, and
> every feature (matching, chat, Vybe Check, verification, location
> distance) is available to everyone at no cost. If that changes in the
> future, we'll update these terms and tell members clearly before
> anything is ever charged.

## Drafted replacement, for when paid plans go live

> **Cost and paid plans**
>
> Every safety feature -- identity verification, reporting and blocking,
> Vybe Check, and anything else that keeps you and other members safe --
> is free for everyone and always will be. We never put a safety feature
> behind a paywall.
>
> findmyVybe also offers optional paid plans (currently Vybe Plus, Real
> Plus, and Rishta Premium, one for each of the Just Vibing / Something
> Real / Rishta Ready paths, plus optional one-off credit packs for
> things like profile boosts) that unlock extra, non-safety features --
> things like seeing who liked you, advanced filters, or priority
> placement. The current plans, their prices, and what each one includes
> are always shown in the app before you pay for anything; prices include
> GST where applicable.
>
> **Billing.** A subscription renews automatically at the end of each
> billing period (monthly, quarterly, or annual, depending on the plan
> you chose) until you cancel. You can cancel anytime from the app;
> cancelling stops future renewals but doesn't refund the period you've
> already paid for, and you keep your plan's features through the end of
> that period. Credit packs are one-time purchases with no renewal.
>
> **Refunds.** [Placeholder -- needs your actual refund policy. A typical
> approach: refunds for a failed or duplicate charge, or within a short
> window (e.g. 24-48 hours) of an unused purchase; no refund for a
> partially- or fully-used billing period or credit pack. This needs
> sign-off, not just a template.]
>
> **Promo codes and price changes.** We may offer promotional discounts
> from time to time; their terms are shown when you redeem one. We may
> change plan prices going forward -- an active subscription keeps the
> price you agreed to until you cancel or the plan itself is
> discontinued; we'll tell you before any price change affects your
> renewal.
>
> **Payment processing.** Payments are processed by a third-party payment
> gateway [name the gateway once one is actually confirmed and live --
> see docs/PAYMENTS.md]. We never see or store your full card number,
> UPI PIN, or bank credentials -- the gateway handles those directly.
>
> If anything above changes, we'll update these terms and tell members
> clearly before it takes effect.

## What still needs a decision before this can be published

1. The actual refund policy (marked as a placeholder above).
2. Which gateway ends up live, so "Payment processing" can name it.
3. Legal review of the billing/auto-renewal language against the
   Consumer Protection (E-Commerce) Rules, 2020 and the RBI's e-mandate
   (recurring-payment) framework -- both are flagged as compliance items
   in the original findings doc.
