/**
 * Payments, behind an interface with a mock adapter.
 *
 * MTN Mobile Money is the real target - it is how money actually moves in
 * Ghana. But the sandbox needs a merchant account and a callback URL, neither
 * of which exists during a pilot, and neither of which should block building
 * the screens that use it.
 *
 * So everything talks to `PaymentProvider`. Swapping the mock for the MoMo
 * sandbox is one new file implementing the same three methods, plus one line
 * in `provider` below. Nothing in the UI changes.
 *
 * BE HONEST ON STAGE: this is a mock. The claim is "payment is behind an
 * interface and the flow is built", not "we move real money". A judge who asks
 * gets the straight answer and a pointer at this file.
 */

export interface PaymentRequest {
  amountGhs: number
  /** MSISDN in local format, e.g. 024 000 0000. */
  phone: string
  reference: string
}

export interface PaymentResult {
  ok: boolean
  reference: string
  providerRef: string | null
  message: string
}

export interface PaymentProvider {
  readonly name: string
  readonly isMock: boolean
  /** Charge a payer - a sponsor funding trees. */
  collect(req: PaymentRequest): Promise<PaymentResult>
  /** Pay out to a payee - a planter withdrawing earnings. */
  disburse(req: PaymentRequest): Promise<PaymentResult>
}

/**
 * The mock. Deliberately imperfect: it fails roughly one call in twelve, and it
 * takes a realistic couple of seconds.
 *
 * A mock that always succeeds instantly produces a UI that has never rendered
 * its own failure state - and the first time anyone sees that state would be in
 * front of judges, or worse, in front of a user who has just lost money.
 */
class MockMomoProvider implements PaymentProvider {
  readonly name = 'MTN MoMo (mock)'
  readonly isMock = true

  private async settle(req: PaymentRequest, verb: string): Promise<PaymentResult> {
    await new Promise((r) => setTimeout(r, 1800 + Math.random() * 900))

    if (!/^0\d{2}\s?\d{3}\s?\d{4}$/.test(req.phone.trim())) {
      return {
        ok: false,
        reference: req.reference,
        providerRef: null,
        message: 'That does not look like a Ghanaian mobile number.',
      }
    }

    if (Math.random() < 0.08) {
      return {
        ok: false,
        reference: req.reference,
        providerRef: null,
        message: `The ${verb} was not confirmed. No money has moved - try again.`,
      }
    }

    return {
      ok: true,
      reference: req.reference,
      providerRef: `MOCK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      message: `${verb} confirmed.`,
    }
  }

  collect(req: PaymentRequest) {
    return this.settle(req, 'payment')
  }

  disburse(req: PaymentRequest) {
    return this.settle(req, 'payout')
  }
}

/** Swap this line for the sandbox adapter when the merchant account exists. */
export const payments: PaymentProvider = new MockMomoProvider()

/* -------------------------------------------------------------------------- */

/**
 * Pilot pricing. Establishment GH₵5 on the first verified check-in, then GH₵2
 * per later verified visit - mirrors `accrue_on_verified` in migration 0007.
 *
 * Deliberately back-loaded: paying most of the money on planting day is what
 * makes plant-and-abandon rational, and it is the failure mode of nearly every
 * reforestation grant.
 */
export const ESTABLISHMENT_GHS = 5
export const PER_VISIT_GHS = 2
export const VISITS_PER_YEAR = 4

/** What a sponsor commits per tree for a first year of monitoring. */
export function costPerTreeGhs(): number {
  return ESTABLISHMENT_GHS + PER_VISIT_GHS * (VISITS_PER_YEAR - 1)
}
