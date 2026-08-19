import { DailyRecapResponse, formatRupiah, RecapInsight, TopSeller, WeeklyBar, WeeklyReportsResponse } from "@lapak/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { aiEnabled } from "../../config/env";
import { badRequest } from "../../utils/errors";
import { dayBounds, dayRevenueTotal } from "../sales/sales.service";
import { buildRecapAggregation, RecapAggregationContext } from "./recapAggregation.service";
import { AiUnavailableError, generateStructured, JsonSchema, RECAP_MODEL } from "./claudeClient";
import { getTopSellersForWindow } from "./topSellers.queries";

const DAILY_STORY_KIND = "daily_story" as const;
const WEEKLY_TOP_SELLERS_LIMIT = 10;
const WEEKLY_BAR_DAYS = 7;

// ── Story tab: GET /api/recap/daily, POST /api/recap/daily/regenerate ──────

const DAILY_RECAP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description:
        'A short, warm, one-sentence headline for the day, in the register of "A good Friday, made in the last two hours." — plain language, no exclamation marks, no corporate tone.',
    },
    body: {
      type: "string",
      description:
        "One to two warm, plain-language sentences summarizing the day, written for the shop owner. " +
        "Every figure mentioned MUST come from the JSON data provided in the user message — never invent, " +
        "estimate, or round a number that isn't directly present in that data.",
    },
    insights: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      description:
        "1-3 short, genuinely useful observations grounded ONLY in the provided data (low stock, cost increases, " +
        "a quiet hour, a strong top seller, etc). Skip anything the data doesn't actually support — an empty-ish " +
        "day with nothing notable should have fewer insights, not invented ones.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: 'Short heading, e.g. "Two items run out before Sunday"' },
          body: { type: "string", description: "One sentence of grounded detail." },
          action: { type: "string", description: 'A short suggested next step, e.g. "Suggest Rp 19.500 →"' },
        },
        required: ["title", "body", "action"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "body", "insights"],
  additionalProperties: false,
};

interface StoryContent {
  headline: string;
  body: string;
  insights: RecapInsight[];
}

const SYSTEM_PROMPT =
  "You are a warm, plain-spoken business analyst for a small Indonesian warung (corner shop) point-of-sale app. " +
  "You write a short daily recap for the shop owner: one warm headline, a short body, and a few grounded insights. " +
  "You are given a JSON object of real numbers already computed from the shop's database (sales, stock, costs). " +
  "You must ONLY use figures that appear in that JSON — never invent, estimate, or round a number that isn't " +
  "directly present in it. If the data is thin (a quiet day, no notable changes), write a short, honest recap " +
  "rather than padding it with invented detail. Keep the tone calm and specific, like a trusted assistant who " +
  "actually read the numbers — not hype, not generic encouragement.";

/** Parses a validated `YYYY-MM-DD` string into a Date at local midnight (used for both querying and cache keys). */
function parseDateParam(dateStr: string): Date {
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest("Invalid date — expected YYYY-MM-DD");
  }
  return parsed;
}

/** UTC-midnight Date for the given calendar day — the value stored in/queried against the `@db.Date` cache column. */
function toRecapDateKey(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function todayDateStr(): string {
  const { start } = dayBounds(new Date());
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

async function callClaudeForStory(context: RecapAggregationContext): Promise<StoryContent> {
  const user =
    "Here is today's real business data, computed directly from SQL. Write the recap from this data only:\n\n" +
    JSON.stringify(context, null, 2);
  return generateStructured<StoryContent>({
    system: SYSTEM_PROMPT,
    user,
    jsonSchema: DAILY_RECAP_SCHEMA,
    toolName: "emit_daily_recap",
  });
}

/**
 * The honest, non-AI fallback: a plain-language summary assembled directly
 * from the same aggregation numbers Claude would have been given, used both
 * when `!aiEnabled` and when a live Claude call fails. Never claims to be
 * AI-written — callers set `aiAvailable: false` on the response this feeds.
 */
function buildDeterministicStory(context: RecapAggregationContext): StoryContent {
  const { today, topSellers, lowStock, costIncreases } = context;

  const headline = `Takings today: ${formatRupiah(today.total)}`;

  const changeAbs = Math.abs(Math.round(today.pctChangeVsYesterday));
  const changeClause =
    today.count > 0 ? `, ${changeAbs}% ${today.pctChangeVsYesterday >= 0 ? "up" : "down"} on yesterday` : "";
  const bestSellerClause = topSellers[0] ? ` ${topSellers[0].name} led with ${topSellers[0].qty} sold.` : "";
  const body =
    today.count > 0
      ? `${formatRupiah(today.total)} from ${today.count} sale${today.count === 1 ? "" : "s"}${changeClause}.${bestSellerClause}`
      : "No sales recorded yet today.";

  const insights: RecapInsight[] = [];
  const lowest = lowStock[0];
  if (lowest) {
    insights.push({
      title: `${lowest.name} is low`,
      body:
        lowest.daysOfCover !== null
          ? `${lowest.stockQty} left — about ${lowest.daysOfCover} day${lowest.daysOfCover === 1 ? "" : "s"} of cover at the recent sale rate.`
          : `${lowest.stockQty} left.`,
      action: "Review restock",
    });
  }
  const costliest = costIncreases[0];
  if (costliest) {
    insights.push({
      title: `${costliest.name} cost rose ${costliest.pctIncrease}%`,
      body: `Up from ${formatRupiah(costliest.oldCost)} to ${formatRupiah(costliest.newCost)} at your supplier.`,
      action: "Review pricing",
    });
  }

  return { headline, body, insights };
}

function toDailyRecapResponse(context: RecapAggregationContext, story: StoryContent, aiAvailable: boolean): DailyRecapResponse {
  return {
    recapDate: context.recapDate,
    headline: story.headline,
    body: story.body,
    insights: story.insights,
    generatedAt: new Date().toISOString(),
    aiAvailable,
  };
}

/**
 * Generates the recap fresh (no cache lookup): tries Claude when AI is
 * enabled, falling back to the deterministic summary on any failure —
 * including `AiUnavailableError` (silent — the expected, everyday case in
 * this sandbox) and any transient API error (logged, since that's an
 * unexpected failure worth knowing about, but still must never surface as a
 * 500 to the merchant). Caches ONLY the real AI-generated response; see
 * the module-level note above `getDailyRecap` for why the degraded path is
 * deliberately never cached.
 */
async function generateFreshDailyRecap(
  merchantId: string,
  context: RecapAggregationContext,
  recapDateKey: Date,
): Promise<DailyRecapResponse> {
  if (!aiEnabled) {
    return toDailyRecapResponse(context, buildDeterministicStory(context), false);
  }

  try {
    const story = await callClaudeForStory(context);
    const response = toDailyRecapResponse(context, story, true);
    await prisma.aiRecapCache.upsert({
      where: { merchantId_recapDate_kind: { merchantId, recapDate: recapDateKey, kind: DAILY_STORY_KIND } },
      create: {
        merchantId,
        recapDate: recapDateKey,
        kind: DAILY_STORY_KIND,
        promptInputJson: context as unknown as Prisma.InputJsonValue,
        responseJson: response as unknown as Prisma.InputJsonValue,
        model: RECAP_MODEL,
      },
      update: {
        promptInputJson: context as unknown as Prisma.InputJsonValue,
        responseJson: response as unknown as Prisma.InputJsonValue,
        model: RECAP_MODEL,
      },
    });
    return response;
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) {
      // eslint-disable-next-line no-console
      console.error("Claude daily-recap generation failed; falling back to the deterministic summary.", err);
    }
    return toDailyRecapResponse(context, buildDeterministicStory(context), false);
  }
}

/**
 * GET /api/recap/daily — cache-first: a cached `daily_story` row for this
 * merchant + date is always a real AI response (see the note above about
 * never caching the degraded path), so a cache hit always returns
 * `aiAvailable: true`. On a miss, aggregates fresh data and either calls
 * Claude (caching the result) or returns the honest deterministic summary —
 * which is intentionally NOT written to the cache, so that once
 * `ANTHROPIC_API_KEY` is configured, the very next request for the same day
 * automatically gets a real AI recap without anyone having to call
 * `/regenerate` by hand.
 */
export async function getDailyRecap(merchantId: string, dateStr = todayDateStr()): Promise<DailyRecapResponse> {
  const date = parseDateParam(dateStr);
  const recapDateKey = toRecapDateKey(dateStr);

  const cached = await prisma.aiRecapCache.findUnique({
    where: { merchantId_recapDate_kind: { merchantId, recapDate: recapDateKey, kind: DAILY_STORY_KIND } },
  });
  if (cached) {
    return { ...(cached.responseJson as unknown as DailyRecapResponse), aiAvailable: true };
  }

  const context = await buildRecapAggregation(merchantId, date);
  return generateFreshDailyRecap(merchantId, context, recapDateKey);
}

/** POST /api/recap/daily/regenerate — clears any cached row for the date first, then always generates fresh. */
export async function regenerateDailyRecap(merchantId: string, dateStr = todayDateStr()): Promise<DailyRecapResponse> {
  const date = parseDateParam(dateStr);
  const recapDateKey = toRecapDateKey(dateStr);

  await prisma.aiRecapCache.deleteMany({ where: { merchantId, recapDate: recapDateKey, kind: DAILY_STORY_KIND } });

  const context = await buildRecapAggregation(merchantId, date);
  return generateFreshDailyRecap(merchantId, context, recapDateKey);
}

// ── Reports tab: GET /api/recap/reports/weekly — no AI, pure SQL ──────────

/**
 * Last 7 calendar days' revenue bars plus the window's top sellers. No AI
 * call anywhere in this path. `bars[].total` uses the exact same
 * debit-inclusive day-revenue rule as the Story tab and Home
 * (`dayRevenueTotal` in sales.service.ts); `ppobShare` is that same day's
 * PPOB-only component of it.
 *
 * Top-seller `margin` is `revenue - (product's CURRENT costPrice × qty)` —
 * a deliberate simplification, since `sale_line_items` only snapshots the
 * SELL price at time of sale, not the cost price, so there is no per-line
 * historical cost to compute a fully accurate margin from. For a product
 * whose cost changed mid-window this slightly misstates margin on the
 * pre-change units; acceptable for a "top sellers" glance, not presented as
 * an accounting figure.
 */
export async function getWeeklyReports(merchantId: string): Promise<WeeklyReportsResponse> {
  const { end } = dayBounds(new Date());
  const windowStart = new Date(end);
  windowStart.setDate(windowStart.getDate() - WEEKLY_BAR_DAYS);

  const dayRanges: { start: Date; end: Date }[] = [];
  for (let i = WEEKLY_BAR_DAYS - 1; i >= 0; i--) {
    const dStart = new Date(end);
    dStart.setDate(dStart.getDate() - (i + 1));
    const dEnd = new Date(end);
    dEnd.setDate(dEnd.getDate() - i);
    dayRanges.push({ start: dStart, end: dEnd });
  }

  const [dayRevenues, topSellerRows] = await Promise.all([
    Promise.all(dayRanges.map((r) => dayRevenueTotal(merchantId, r.start, r.end))),
    getTopSellersForWindow(merchantId, windowStart, end, WEEKLY_TOP_SELLERS_LIMIT),
  ]);

  const bars: WeeklyBar[] = dayRanges.map((r, i) => ({
    label: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(r.start),
    total: dayRevenues[i].total,
    ppobShare: dayRevenues[i].ppobRevenue,
  }));

  const topSellers: TopSeller[] = topSellerRows.map((r) => ({
    name: r.name,
    qty: r.qty,
    margin: r.revenue - r.costPrice * r.qty,
  }));

  return { bars, topSellers };
}
