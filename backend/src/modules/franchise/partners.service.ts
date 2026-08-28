import { randomBytes } from "crypto";
import {
  CreatePartnerInviteRequest,
  FranchiseMembershipResponse,
  FranchiseePartnerDto,
  FranchiseePartnerStatementDto,
  GenerateStatementsRequest,
} from "@lapak/shared";
import { RoyaltyStatementStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { badRequest, notFound } from "../../utils/errors";
import { requireFeature } from "../subscription/entitlements.service";

// ── DTO mappers ─────────────────────────────────────────────────────────

type PartnerRow = {
  id: string;
  label: string | null;
  joinCode: string;
  status: "pending" | "active" | "ended";
  royaltyPercent: number;
  feeMonthly: number;
  franchiseeMerchantId: string | null;
  joinedAt: Date | null;
  createdAt: Date;
  franchisee: { name: string } | null;
};

function monthRange(): { start: Date; end: Date } {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}

async function revenueForMerchant(merchantId: string, start: Date, end: Date): Promise<number> {
  const agg = await prisma.sale.aggregate({
    where: { merchantId, status: "completed", createdAt: { gte: start, lt: end } },
    _sum: { total: true },
  });
  return agg._sum.total ?? 0;
}

async function partnerDto(row: PartnerRow): Promise<FranchiseePartnerDto> {
  const { start, end } = monthRange();
  const revenueThisMonth =
    row.status === "active" && row.franchiseeMerchantId
      ? await revenueForMerchant(row.franchiseeMerchantId, start, end)
      : 0;
  return {
    id: row.id,
    label: row.label,
    joinCode: row.joinCode,
    status: row.status,
    royaltyPercent: row.royaltyPercent,
    feeMonthly: row.feeMonthly,
    franchiseeMerchantId: row.franchiseeMerchantId,
    franchiseeName: row.franchisee?.name ?? null,
    joinedAt: row.joinedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    revenueThisMonth,
  };
}

type StatementRow = {
  id: string;
  partnerId: string;
  franchiseeMerchantId: string;
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
  partner: { franchisee: { name: string } | null };
};

function statementDto(row: StatementRow): FranchiseePartnerStatementDto {
  return {
    id: row.id,
    partnerId: row.partnerId,
    franchiseeMerchantId: row.franchiseeMerchantId,
    franchiseeName: row.partner.franchisee?.name ?? null,
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

// ── Franchisor side ────────────────────────────────────────────────────

function generateJoinCode(): string {
  // 8 chars, no ambiguous 0/O/1/I, prefixed so it reads as a franchise code.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
  return `FR-${code}`;
}

export async function createPartnerInvite(
  franchisorMerchantId: string,
  input: CreatePartnerInviteRequest,
): Promise<FranchiseePartnerDto> {
  await requireFeature(franchisorMerchantId, "franchise");
  if (!Number.isInteger(input.royaltyPercent) || input.royaltyPercent < 0 || input.royaltyPercent > 100) {
    throw badRequest("Royalti harus 0–100 persen");
  }
  if (!Number.isInteger(input.feeMonthly) || input.feeMonthly < 0) {
    throw badRequest("Biaya bulanan tidak boleh negatif");
  }

  // Retry on the (astronomically unlikely) join-code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await prisma.franchiseePartner.create({
        data: {
          franchisorMerchantId,
          label: input.label?.trim() || null,
          joinCode: generateJoinCode(),
          royaltyPercent: input.royaltyPercent,
          feeMonthly: input.feeMonthly,
          status: "pending",
        },
        include: { franchisee: { select: { name: true } } },
      });
      return partnerDto(row);
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw badRequest("Gagal membuat kode undangan");
}

export async function listPartners(franchisorMerchantId: string): Promise<FranchiseePartnerDto[]> {
  await requireFeature(franchisorMerchantId, "franchise");
  const rows = await prisma.franchiseePartner.findMany({
    where: { franchisorMerchantId },
    include: { franchisee: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(rows.map(partnerDto));
}

export async function endPartner(franchisorMerchantId: string, partnerId: string): Promise<FranchiseePartnerDto> {
  await requireFeature(franchisorMerchantId, "franchise");
  const existing = await prisma.franchiseePartner.findFirst({ where: { id: partnerId, franchisorMerchantId } });
  if (!existing) throw notFound("Franchise partner");
  const row = await prisma.franchiseePartner.update({
    where: { id: partnerId },
    data: { status: "ended" },
    include: { franchisee: { select: { name: true } } },
  });
  return partnerDto(row);
}

// ── Franchisee side ────────────────────────────────────────────────────

export async function redeemJoinCode(
  franchiseeMerchantId: string,
  rawCode: string,
): Promise<FranchiseMembershipResponse> {
  const code = rawCode.trim().toUpperCase();
  if (!code) throw badRequest("Masukkan kode franchise");

  const partner = await prisma.franchiseePartner.findUnique({
    where: { joinCode: code },
    include: { franchisor: { select: { name: true } } },
  });
  if (!partner || partner.status === "ended") throw notFound("Kode franchise");
  if (partner.status === "active" || partner.franchiseeMerchantId) {
    throw badRequest("Kode ini sudah dipakai");
  }
  if (partner.franchisorMerchantId === franchiseeMerchantId) {
    throw badRequest("Tidak bisa menjadi franchise dari usaha sendiri");
  }
  const already = await prisma.franchiseePartner.findUnique({ where: { franchiseeMerchantId } });
  if (already) throw badRequest("Usaha ini sudah tergabung sebagai franchise");

  await prisma.franchiseePartner.update({
    where: { id: partner.id },
    data: { franchiseeMerchantId, status: "active", joinedAt: new Date() },
  });
  return getMembership(franchiseeMerchantId);
}

export async function getMembership(merchantId: string): Promise<FranchiseMembershipResponse> {
  const partner = await prisma.franchiseePartner.findUnique({
    where: { franchiseeMerchantId: merchantId },
    include: { franchisor: { select: { name: true } } },
  });
  if (!partner) {
    return { isFranchisee: false, franchisorName: null, status: null, royaltyPercent: null, feeMonthly: null, joinedAt: null, statements: [] };
  }
  const statements = await prisma.franchiseePartnerStatement.findMany({
    where: { partnerId: partner.id },
    include: { partner: { include: { franchisee: { select: { name: true } } } } },
    orderBy: { periodStart: "desc" },
    take: 24,
  });
  return {
    isFranchisee: true,
    franchisorName: partner.franchisor?.name ?? null,
    status: partner.status,
    royaltyPercent: partner.royaltyPercent,
    feeMonthly: partner.feeMonthly,
    joinedAt: partner.joinedAt?.toISOString() ?? null,
    statements: statements.map(statementDto),
  };
}

// ── Statements ─────────────────────────────────────────────────────────

function defaultPeriod(): { start: Date; end: Date } {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) };
}

export async function generatePartnerStatements(
  franchisorMerchantId: string,
  input: GenerateStatementsRequest,
): Promise<{ created: number; updated: number; statements: FranchiseePartnerStatementDto[] }> {
  await requireFeature(franchisorMerchantId, "franchise");
  const period = defaultPeriod();
  const start = input.periodStart ? new Date(input.periodStart) : period.start;
  const end = input.periodEnd ? new Date(input.periodEnd) : period.end;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw badRequest("Rentang periode tidak valid");
  }

  const partners = await prisma.franchiseePartner.findMany({
    where: { franchisorMerchantId, status: "active", franchiseeMerchantId: { not: null } },
  });

  let created = 0;
  let updated = 0;
  const out: FranchiseePartnerStatementDto[] = [];

  for (const partner of partners) {
    const franchiseeMerchantId = partner.franchiseeMerchantId as string;
    const grossSales = await revenueForMerchant(franchiseeMerchantId, start, end);
    const royaltyDue = Math.floor((grossSales * partner.royaltyPercent) / 100);
    const feeDue = partner.feeMonthly;
    const totalDue = royaltyDue + feeDue;

    const existing = await prisma.franchiseePartnerStatement.findUnique({
      where: { partnerId_periodStart: { partnerId: partner.id, periodStart: start } },
      include: { partner: { include: { franchisee: { select: { name: true } } } } },
    });
    if (existing && existing.status !== "draft") {
      out.push(statementDto(existing));
      continue;
    }

    const row = await prisma.franchiseePartnerStatement.upsert({
      where: { partnerId_periodStart: { partnerId: partner.id, periodStart: start } },
      update: { periodEnd: end, grossSales, royaltyDue, feeDue, totalDue },
      create: {
        partnerId: partner.id,
        franchisorMerchantId,
        franchiseeMerchantId,
        periodStart: start,
        periodEnd: end,
        grossSales,
        royaltyDue,
        feeDue,
        totalDue,
      },
      include: { partner: { include: { franchisee: { select: { name: true } } } } },
    });
    if (existing) updated++;
    else created++;
    out.push(statementDto(row));
  }

  return { created, updated, statements: out };
}

export async function listPartnerStatements(franchisorMerchantId: string, limit = 50): Promise<FranchiseePartnerStatementDto[]> {
  await requireFeature(franchisorMerchantId, "franchise");
  const rows = await prisma.franchiseePartnerStatement.findMany({
    where: { franchisorMerchantId },
    include: { partner: { include: { franchisee: { select: { name: true } } } } },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map(statementDto);
}

export async function setPartnerStatementStatus(
  franchisorMerchantId: string,
  statementId: string,
  status: "issued" | "paid",
): Promise<FranchiseePartnerStatementDto> {
  await requireFeature(franchisorMerchantId, "franchise");
  const existing = await prisma.franchiseePartnerStatement.findFirst({ where: { id: statementId, franchisorMerchantId } });
  if (!existing) throw notFound("Partner statement");
  const row = await prisma.franchiseePartnerStatement.update({
    where: { id: statementId },
    data: {
      status,
      ...(status === "issued" && !existing.issuedAt ? { issuedAt: new Date() } : {}),
      ...(status === "paid" ? { paidAt: new Date(), ...(existing.issuedAt ? {} : { issuedAt: new Date() }) } : {}),
    },
    include: { partner: { include: { franchisee: { select: { name: true } } } } },
  });
  return statementDto(row);
}
