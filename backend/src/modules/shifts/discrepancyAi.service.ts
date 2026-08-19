import { prisma } from "../../db/prisma";
import { formatRupiah } from "@lapak/shared";
import { AiUnavailableError, generateStructured, JsonSchema } from "../recap/claudeClient";

/**
 * One real, shift-scoped cash-contributing event that could plausibly
 * explain a discrepancy: either the cash leg of a `cash`/`split` sale, or a
 * successful PPOB transaction (assumed cash-collected, same rule
 * `computeRunningTotals` in shifts.service.ts already applies).
 */
export interface CashEvent {
  kind: "sale" | "ppob";
  /** Rupiah amount this single event contributed to the drawer. */
  amount: number;
  occurredAt: Date;
  /** Short human description — what was sold/paid — for Claude to ground its phrasing in, never anything outside this. */
  label: string;
}

export interface DiscrepancyCandidateSet {
  events: CashEvent[];
  sum: number;
}

/**
 * How close a candidate set's sum must land to the target to count as a
 * match. Rupiah amounts in this app are always whole numbers, so this isn't
 * about floating-point rounding — it's a small deliberate allowance for the
 * kind of near-miss a real till discrepancy can have (e.g. a few hundred
 * Rupiah of unrelated small change slop) without over-fitting to noise.
 * An exact match (tolerance 0) still passes since 0 <= 100.
 */
const DISCREPANCY_TOLERANCE_RUPIAH = 100;

/** At most this many candidate SETS are ever handed to Claude — keeps the prompt small and the explanation focused. */
const MAX_RETURNED_CANDIDATE_SETS = 3;

/**
 * Safety cap on how many individual events feed the combination search.
 * Pair/triple search is O(n^2)/O(n^3); a normal warung shift has at most a
 * few dozen to low-hundreds of transactions, so this cap is never expected
 * to bite in practice — it exists purely so a pathological shift (or a
 * runaway test) can't make `findDiscrepancyCandidates` hang. When it does
 * bite, the most recent events are kept (a bookkeeping slip is more likely
 * to involve a recent transaction than one from hours earlier).
 */
const MAX_CANDIDATE_POOL = 120;

function withinTolerance(sum: number, target: number): boolean {
  return Math.abs(sum - target) <= DISCREPANCY_TOLERANCE_RUPIAH;
}

/**
 * Loads this shift's real cash-contributing events (cash/split sales' cash
 * leg + successful PPOB transactions) and searches for a single event, or a
 * small combination of 2-3, whose amount(s) sum to `targetAmount` (normally
 * `abs(discrepancy)`) within `DISCREPANCY_TOLERANCE_RUPIAH`.
 *
 * Deliberately stops at the first tier (singles, then pairs, then triples)
 * that finds ANY match — a simpler explanation is both more likely to be
 * the true cause and more useful to a cashier than a contrived 3-way
 * combination when a single transaction already accounts for the gap.
 * Returns `[]` when nothing matches at any tier; callers must treat that as
 * "no genuine candidate" and MUST NOT fabricate one — see shifts.service.ts.
 */
export async function findDiscrepancyCandidates(
  merchantId: string,
  shiftId: string,
  targetAmount: number,
): Promise<DiscrepancyCandidateSet[]> {
  if (targetAmount <= 0) return [];

  const [sales, ppobTransactions] = await Promise.all([
    prisma.sale.findMany({
      where: { merchantId, shiftId, status: "completed", tenderType: { in: ["cash", "split"] }, cashAmount: { gt: 0 } },
      include: { lineItems: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ppobTransaction.findMany({
      where: { merchantId, shiftId, status: "success" },
      include: { biller: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const events: CashEvent[] = [
    ...sales.map((sale): CashEvent => {
      const items = sale.lineItems.map((li) => `${li.qty}× ${li.productNameSnapshot}`).join(", ");
      return {
        kind: "sale",
        amount: sale.cashAmount,
        occurredAt: sale.createdAt,
        label: items ? `Sale of ${items}` : `Sale #${sale.orderNo}`,
      };
    }),
    ...ppobTransactions.map(
      (t): CashEvent => ({
        kind: "ppob",
        amount: t.totalCharged,
        occurredAt: t.createdAt,
        label: `${t.biller.name} bill payment for ${t.customerName}`,
      }),
    ),
  ];

  // Cap the pool (see MAX_CANDIDATE_POOL doc), keeping the most recent events, then re-sort chronologically for readable labels.
  const pool = (events.length > MAX_CANDIDATE_POOL ? events.slice(0, MAX_CANDIDATE_POOL) : events).sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  const singles: DiscrepancyCandidateSet[] = [];
  for (const e of pool) {
    if (withinTolerance(e.amount, targetAmount)) {
      singles.push({ events: [e], sum: e.amount });
    }
  }
  if (singles.length > 0) return singles.slice(0, MAX_RETURNED_CANDIDATE_SETS);

  const pairs: DiscrepancyCandidateSet[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const sum = pool[i].amount + pool[j].amount;
      if (withinTolerance(sum, targetAmount)) {
        pairs.push({ events: [pool[i], pool[j]], sum });
        if (pairs.length >= MAX_RETURNED_CANDIDATE_SETS) return pairs;
      }
    }
  }
  if (pairs.length > 0) return pairs;

  const triples: DiscrepancyCandidateSet[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const sum = pool[i].amount + pool[j].amount + pool[k].amount;
        if (withinTolerance(sum, targetAmount)) {
          triples.push({ events: [pool[i], pool[j], pool[k]], sum });
          if (triples.length >= MAX_RETURNED_CANDIDATE_SETS) return triples;
        }
      }
    }
  }
  return triples;
}

const DISCREPANCY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    body: {
      type: "string",
      description:
        "One to two short, plain-language sentences explaining the drawer discrepancy to the shop owner, " +
        "grounded ONLY in the candidate transaction(s) given — name their real amount(s) and time(s) and suggest " +
        "the likely everyday cause (e.g. rung as the wrong tender type). Never mention any transaction, amount, " +
        "time, or product that is not explicitly present in the data you were given.",
    },
  },
  required: ["body"],
  additionalProperties: false,
};

const DISCREPANCY_SYSTEM_PROMPT =
  "You are the same warm, plain-spoken business analyst for a small Indonesian warung (corner shop) point-of-sale " +
  "app who writes the daily recap, now helping a cashier understand a cash-drawer discrepancy at shift close. " +
  "You are given the exact numeric gap and a short list of REAL transactions from this shift whose amount(s) sum " +
  "to that gap almost exactly — these are genuine candidates already computed by the backend by matching real " +
  "numbers, not guesses of yours to make. Phrase a short, specific, plausible explanation naming the transaction(s) " +
  "given (amount and time) and the most likely everyday cause (commonly: it was rung as cash but the customer " +
  "actually paid another way, or vice versa). Do NOT mention any transaction, amount, time, or product that is " +
  "not explicitly present in the JSON you were given — you have no way to know the true cause, only that these " +
  "real numbers happen to add up to the gap.";

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Asks Claude to phrase a specific-sounding discrepancy explanation, grounded
 * strictly in the given (already-matched) candidate set — the best (simplest)
 * one `findDiscrepancyCandidates` found. Returns `null` on any failure
 * (including `!aiEnabled`); callers fall back to Phase 5a's generic honest
 * message, exactly as the daily recap falls back to its deterministic
 * summary. Never throws.
 */
export async function explainDiscrepancyWithAi(
  discrepancy: number,
  candidates: DiscrepancyCandidateSet[],
): Promise<string | null> {
  if (candidates.length === 0) return null;
  const best = candidates[0];

  const user =
    "Shift-close discrepancy detail (already computed by the backend — do not recompute or second-guess it):\n" +
    JSON.stringify(
      {
        discrepancy: {
          amountRupiah: Math.abs(discrepancy),
          amountFormatted: formatRupiah(Math.abs(discrepancy)),
          direction: discrepancy > 0 ? "short (counted less than expected)" : "over (counted more than expected)",
        },
        candidateTransactions: best.events.map((e) => ({
          kind: e.kind,
          amountRupiah: e.amount,
          amountFormatted: formatRupiah(e.amount),
          time: formatTime(e.occurredAt),
          whatItWas: e.label,
        })),
      },
      null,
      2,
    );

  try {
    const result = await generateStructured<{ body: string }>({
      system: DISCREPANCY_SYSTEM_PROMPT,
      user,
      jsonSchema: DISCREPANCY_SCHEMA,
      toolName: "emit_discrepancy_explanation",
      maxTokens: 300,
    });
    return result.body;
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) {
      // eslint-disable-next-line no-console
      console.error("Claude discrepancy explanation failed; falling back to the generic honest message.", err);
    }
    return null;
  }
}
