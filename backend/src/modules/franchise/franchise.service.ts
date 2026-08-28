import {
  FranchiseAgreementDto,
  FranchiseRoyaltyStatementDto,
  GenerateStatementsRequest,
  GenerateStatementsResponse,
  UpsertFranchiseAgreementRequest,
} from "@lapak/shared";
import { RoyaltyStatementStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { badRequest, notFound } from "../../utils/errors";
import { requireFeature } from "../subscription/entitlements.service";

type AgreementRow = {
  id: string;
  outletId: string;
  royaltyPercent: number;
  feeMonthly: number;
  allowPriceOverride: boolean;
  startDate: Date;
  status: "active" | "ended";
  notes: string | null;
  outlet: { name: string; code: string };
};

function agreementDto(row: AgreementRow): FranchiseAgreementDto {
  return {
    id: row.id,
    outletId: row.outletId,
    outletName: row.outlet.name,
    outletCode: row.outlet.code,
    royaltyPercent: row.royaltyPercent,
    feeMonthly: row.feeMonthly,
    allowPriceOverride: row.allowPriceOverride,
    startDate: row.startDate.toISOString(),
    status: row.status,
    notes: row.notes,
  };
}

type StatementRow = {
  id: string;
  agreementId: string;
  outletId: string;
  periodStart: Date;
  periodEnd: Date;
  grossSales: number;
  royaltyDue: number;
  feeDue: number;
  totalDue: number;
  status: RoyaltyStatementStatus;
  issuedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  agreement: { outlet: { name: string } };
};

function statementDto(row: StatementRow): FranchiseRoyaltyStatementDto {
  return {
    id: row.id,
    agreementId: row.agreementId,
    outletId: row.outletId,
    outletName: row.agreement.outlet.name,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    grossSales: row.grossSales,
    royaltyDue: row.royaltyDue,
    feeDue: row.feeDue,
    totalDue: row.totalDue,
    status: row.status,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAgreements(merchantId: string): Promise<FranchiseAgreementDto[]> {
  await requireFeature(merchantId, "franchise");
  const rows = await prisma.franchiseAgreement.findMany({
    where: { merchantId },
    include: { outlet: { select: { name: true, code: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(agreementDto);
}

export async function upsertAgreement(
  merchantId: string,
  input: UpsertFranchiseAgreementRequest,
): Promise<FranchiseAgreementDto> {
  await requireFeature(merchantId, "franchise");

  const outlet = await prisma.outlet.findFirst({ where: { id: input.outletId, merchantId } });
  if (!outlet) throw notFound("Outlet");
  if (outlet.type !== "franchise") {
    throw badRequest("Outlet ini bukan tipe franchise. Ubah jenis outlet dulu.");
  }
  if (!Number.isInteger(input.royaltyPercent) || input.royaltyPercent < 0 || input.royaltyPercent > 100) {
    throw badRequest("Royalti harus 0–100 persen");
  }
  if (!Number.isInteger(input.feeMonthly) || input.feeMonthly < 0) {
    throw badRequest("Biaya bulanan tidak boleh negatif");
  }
  const startDate = input.startDate ? new Date(input.startDate) : new Date();
  if (Number.isNaN(startDate.getTime())) throw badRequest("Tanggal mulai tidak valid");

  const row = await prisma.franchiseAgreement.upsert({
    where: { outletId: input.outletId },
    update: {
      royaltyPercent: input.royaltyPercent,
      feeMonthly: input.feeMonthly,
      allowPriceOverride: input.allowPriceOverride ?? false,
      startDate,
      notes: input.notes?.trim() || null,
      status: "active",
    },
    create: {
      merchantId,
      outletId: input.outletId,
      royaltyPercent: input.royaltyPercent,
      feeMonthly: input.feeMonthly,
      allowPriceOverride: input.allowPriceOverride ?? false,
      startDate,
      notes: input.notes?.trim() || null,
    },
    include: { outlet: { select: { name: true, code: true } } },
  });
  return agreementDto(row);
}

export async function endAgreement(merchantId: string, agreementId: string): Promise<FranchiseAgreementDto> {
  await requireFeature(merchantId, "franchise");
  const existing = await prisma.franchiseAgreement.findFirst({ where: { id: agreementId, merchantId } });
  if (!existing) throw notFound("Franchise agreement");
  const row = await prisma.franchiseAgreement.update({
    where: { id: agreementId },
    data: { status: "ended" },
    include: { outlet: { select: { name: true, code: true } } },
  });
  return agreementDto(row);
}

/** Default period: the whole of last calendar month, [firstOfLastMonth, firstOfThisMonth). */
function defaultPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { start, end };
}

/**
 * POST /api/franchise/statements/generate — for every active agreement,
 * sums the outlet's completed-sale revenue in the period and writes (or
 * refreshes) a royalty statement. `royaltyDue = floor(grossSales *
 * royaltyPercent / 100)`, `feeDue = feeMonthly`. Idempotent on
 * (agreement, periodStart) — re-running recomputes an existing draft; an
 * already-issued/paid statement is left untouched.
 */
export async function generateStatements(
  merchantId: string,
  input: GenerateStatementsRequest,
): Promise<GenerateStatementsResponse> {
  await requireFeature(merchantId, "franchise");

  const period = defaultPeriod();
  const start = input.periodStart ? new Date(input.periodStart) : period.start;
  const end = input.periodEnd ? new Date(input.periodEnd) : period.end;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw badRequest("Rentang periode tidak valid");
  }

  const agreements = await prisma.franchiseAgreement.findMany({
    where: { merchantId, status: "active" },
    include: { outlet: { select: { name: true } } },
  });

  let created = 0;
  let updated = 0;
  const statements: FranchiseRoyaltyStatementDto[] = [];

  for (const agreement of agreements) {
    const agg = await prisma.sale.aggregate({
      where: { outletId: agreement.outletId, status: "completed", createdAt: { gte: start, lt: end } },
      _sum: { total: true },
    });
    const grossSales = agg._sum.total ?? 0;
    const royaltyDue = Math.floor((grossSales * agreement.royaltyPercent) / 100);
    const feeDue = agreement.feeMonthly;
    const totalDue = royaltyDue + feeDue;

    const existing = await prisma.franchiseRoyaltyStatement.findUnique({
      where: { agreementId_periodStart: { agreementId: agreement.id, periodStart: start } },
    });

    if (existing && existing.status !== "draft") {
      statements.push(statementDto({ ...existing, agreement: { outlet: agreement.outlet } }));
      continue;
    }

    const row = await prisma.franchiseRoyaltyStatement.upsert({
      where: { agreementId_periodStart: { agreementId: agreement.id, periodStart: start } },
      update: { periodEnd: end, grossSales, royaltyDue, feeDue, totalDue },
      create: {
        agreementId: agreement.id,
        merchantId,
        outletId: agreement.outletId,
        periodStart: start,
        periodEnd: end,
        grossSales,
        royaltyDue,
        feeDue,
        totalDue,
      },
    });
    if (existing) updated++;
    else created++;
    statements.push(statementDto({ ...row, agreement: { outlet: agreement.outlet } }));
  }

  return { created, updated, statements };
}

export async function listStatements(merchantId: string, limit = 50): Promise<FranchiseRoyaltyStatementDto[]> {
  await requireFeature(merchantId, "franchise");
  const rows = await prisma.franchiseRoyaltyStatement.findMany({
    where: { merchantId },
    include: { agreement: { include: { outlet: { select: { name: true } } } } },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map(statementDto);
}

export async function setStatementStatus(
  merchantId: string,
  statementId: string,
  status: "issued" | "paid",
): Promise<FranchiseRoyaltyStatementDto> {
  await requireFeature(merchantId, "franchise");
  const existing = await prisma.franchiseRoyaltyStatement.findFirst({ where: { id: statementId, merchantId } });
  if (!existing) throw notFound("Royalty statement");
  const row = await prisma.franchiseRoyaltyStatement.update({
    where: { id: statementId },
    data: {
      status,
      ...(status === "issued" && !existing.issuedAt ? { issuedAt: new Date() } : {}),
      ...(status === "paid" ? { paidAt: new Date(), ...(existing.issuedAt ? {} : { issuedAt: new Date() }) } : {}),
    },
    include: { agreement: { include: { outlet: { select: { name: true } } } } },
  });
  return statementDto(row);
}
