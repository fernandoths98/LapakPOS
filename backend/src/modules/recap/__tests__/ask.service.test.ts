import { prisma } from "../../../db/prisma";
import * as askService from "../ask.service";

const TEST_MERCHANT_ID = "00000000-0000-0000-0000-000000000700";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000701";

describe("ask.service — degraded path (no ANTHROPIC_API_KEY in this sandbox)", () => {
  beforeAll(async () => {
    await prisma.merchant.upsert({
      where: { id: TEST_MERCHANT_ID },
      update: {},
      create: { id: TEST_MERCHANT_ID, name: "Ask Test Merchant" },
    });
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: { merchantId: TEST_MERCHANT_ID },
      create: {
        id: TEST_USER_ID,
        merchantId: TEST_MERCHANT_ID,
        name: "Test Owner",
        email: "ask-service-test@lapak.test",
        passwordHash: "not-a-real-hash",
        role: "owner",
      },
    });
  });

  afterEach(async () => {
    await prisma.aiChatMessage.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.merchant.deleteMany({ where: { id: TEST_MERCHANT_ID } });
    await prisma.$disconnect();
  });

  it("persists the real user question even though there's no AI to answer it", async () => {
    const result = await askService.postAsk(TEST_MERCHANT_ID, TEST_USER_ID, "How is my margin today?");

    expect(result.aiAvailable).toBe(false);
    expect(result.reply).toBe(askService.AI_UNAVAILABLE_REPLY);

    const rows = await prisma.aiChatMessage.findMany({
      where: { merchantId: TEST_MERCHANT_ID, userId: TEST_USER_ID },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ role: "user", content: "How is my margin today?" });
    expect(rows[1]).toMatchObject({ role: "assistant", content: askService.AI_UNAVAILABLE_REPLY });
  });

  it("rejects an empty/whitespace-only message without touching the database", async () => {
    await expect(askService.postAsk(TEST_MERCHANT_ID, TEST_USER_ID, "   ")).rejects.toMatchObject({ status: 400 });

    const rows = await prisma.aiChatMessage.findMany({ where: { merchantId: TEST_MERCHANT_ID, userId: TEST_USER_ID } });
    expect(rows).toHaveLength(0);
  });

  it("getAskHistory returns the persisted thread, oldest first", async () => {
    await askService.postAsk(TEST_MERCHANT_ID, TEST_USER_ID, "What should I restock?");
    await askService.postAsk(TEST_MERCHANT_ID, TEST_USER_ID, "When am I quiet?");

    const history = await askService.getAskHistory(TEST_MERCHANT_ID, TEST_USER_ID);

    expect(history.messages).toHaveLength(4); // 2 user + 2 assistant fallback turns
    expect(history.messages[0]).toMatchObject({ role: "user", content: "What should I restock?" });
    expect(history.messages[2]).toMatchObject({ role: "user", content: "When am I quiet?" });
    expect(history.messages.every((m) => new Date(m.createdAt).getTime() > 0)).toBe(true);
    // Chronological order.
    const times = history.messages.map((m) => new Date(m.createdAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("scopes chat history per-user, not just per-merchant", async () => {
    const OTHER_USER_ID = "00000000-0000-0000-0000-000000000702";
    await prisma.user.upsert({
      where: { id: OTHER_USER_ID },
      update: { merchantId: TEST_MERCHANT_ID },
      create: {
        id: OTHER_USER_ID,
        merchantId: TEST_MERCHANT_ID,
        name: "Other Cashier",
        email: "ask-service-other-test@lapak.test",
        passwordHash: "not-a-real-hash",
        role: "cashier",
      },
    });

    await askService.postAsk(TEST_MERCHANT_ID, TEST_USER_ID, "Question from owner");
    await askService.postAsk(TEST_MERCHANT_ID, OTHER_USER_ID, "Question from cashier");

    const ownerHistory = await askService.getAskHistory(TEST_MERCHANT_ID, TEST_USER_ID);
    expect(ownerHistory.messages.some((m) => m.content === "Question from cashier")).toBe(false);
    expect(ownerHistory.messages.some((m) => m.content === "Question from owner")).toBe(true);

    await prisma.aiChatMessage.deleteMany({ where: { merchantId: TEST_MERCHANT_ID, userId: OTHER_USER_ID } });
    await prisma.user.deleteMany({ where: { id: OTHER_USER_ID } });
  });
});
