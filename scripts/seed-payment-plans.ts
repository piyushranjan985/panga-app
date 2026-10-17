/**
 * Seeds a starter plan catalog for the hybrid pricing model (base
 * subscription per intent + optional one-off credit packs) so the
 * payments system has something real to check out against end-to-end.
 *
 * These are STARTER DEFAULTS, not final pricing -- every number here is
 * admin-editable from the Payments > Plans & pricing screen the moment
 * after this runs (each edit creates a new version, see
 * prisma/schema.prisma's PaymentPlan comment). They're placed in a rough,
 * defensible band given the Tinder/Bumble/Hinge and Jeevansathi/Shaadi/
 * BharatMatrimony research in the findings doc, but have not been
 * individually re-confirmed against that doc's exact figures -- treat
 * them as "enough to build and test against", not as the final sign-off
 * numbers.
 *
 * Idempotent: skips any slug that already has a version. Safe to re-run.
 *
 * Run with: npm run db:seed:payments
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const STARTER_PLANS = [
  {
    slug: 'vybe-plus',
    intent: 'JUST_VIBING' as const,
    kind: 'SUBSCRIPTION' as const,
    name: 'Vybe Plus',
    description: 'For Just Vibing -- unlimited swipes and see who liked you.',
    priceInPaise: 29900, // ₹299/mo
    billingInterval: 'MONTHLY' as const,
    creditAmount: null,
    features: { unlimited_swipes: true, see_who_liked_you: true, rewind_last_swipe: true },
  },
  {
    slug: 'real-plus',
    intent: 'SOMETHING_REAL' as const,
    kind: 'SUBSCRIPTION' as const,
    name: 'Real Plus',
    description: 'For Something Real -- everything in Vybe Plus, plus advanced filters and read receipts.',
    priceInPaise: 49900, // ₹499/mo
    billingInterval: 'MONTHLY' as const,
    creditAmount: null,
    features: { unlimited_swipes: true, see_who_liked_you: true, advanced_filters: true, rewind_last_swipe: true, read_receipts: true },
  },
  {
    slug: 'rishta-premium',
    intent: 'RISHTA_READY' as const,
    kind: 'SUBSCRIPTION' as const,
    name: 'Rishta Premium',
    description: 'For Rishta Ready -- priority placement, advanced filters, and extra Vybe Vouch invites.',
    priceInPaise: 149900, // ₹1,499/mo
    billingInterval: 'MONTHLY' as const,
    creditAmount: null,
    features: { advanced_filters: true, priority_placement: true, extra_vybe_vouch_invites: true, read_receipts: true },
  },
  {
    slug: 'boost-pack-5',
    intent: null,
    kind: 'CREDIT_PACK' as const,
    name: 'Boost Pack -- 5 credits',
    description: 'One-off credits for profile boosts, super likes, and spotlight -- usable regardless of plan or intent.',
    priceInPaise: 19900, // ₹199
    billingInterval: null,
    creditAmount: 5,
    features: {},
  },
  {
    slug: 'boost-pack-15',
    intent: null,
    kind: 'CREDIT_PACK' as const,
    name: 'Boost Pack -- 15 credits',
    description: 'Better per-credit value for frequent boosters.',
    priceInPaise: 49900, // ₹499
    billingInterval: null,
    creditAmount: 15,
    features: {},
  },
];

async function main() {
  for (const plan of STARTER_PLANS) {
    const existing = await db.paymentPlan.findFirst({ where: { slug: plan.slug } });
    if (existing) {
      console.log(`skip ${plan.slug} -- already seeded (v${existing.version})`);
      continue;
    }
    const created = await db.paymentPlan.create({
      data: {
        slug: plan.slug,
        intent: plan.intent,
        kind: plan.kind,
        name: plan.name,
        description: plan.description,
        priceInPaise: plan.priceInPaise,
        billingInterval: plan.billingInterval,
        creditAmount: plan.creditAmount,
        features: plan.features,
        isActive: true,
        version: 1,
      },
    });
    console.log(`created ${created.slug} v${created.version} (${created.id})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
