import { PrismaClient, UserRole, LotStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding LISION database...");

  // 1. Tenant — Liserie
  const tenant = await prisma.tenant.upsert({
    where: { slug: "liserie" },
    update: {},
    create: {
      name: "Liserie",
      slug: "liserie",
      settings: {
        allowance_target: 0.002,
        daily_target: 500,
        weekly_target: 2500,
        monthly_target: 20000,
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        work_hours_per_day: 8,
        work_days_per_week: 5.5,
      },
      subscriptionPlan: "pilot",
    },
  });
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Profiles — Admin (Fabinho) + Operador (Rodrigo)
  const adminPin = await bcrypt.hash("1234", 10);
  const operadorPin = await bcrypt.hash("5678", 10);

  const admin = await prisma.profile.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: tenant.id,
      fullName: "Fabinho",
      email: "fabinho@liserie.com.br",
      role: UserRole.ADMIN,
      sector: "ADMINISTRACAO",
      pinCode: adminPin,
    },
  });
  console.log(`Admin: ${admin.fullName} (PIN: 1234)`);

  const operador = await prisma.profile.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      tenantId: tenant.id,
      fullName: "Rodrigo",
      email: "rodrigo@liserie.com.br",
      role: UserRole.OPERADOR,
      sector: "CORTE",
      pinCode: operadorPin,
    },
  });
  console.log(`Operador: ${operador.fullName} (PIN: 5678)`);

  // 3. Stages — 8 etapas padrão da Liserie
  const stagesData = [
    {
      name: "CORTE",
      displayName: "Corte",
      orderIndex: 1,
      type: "INTERNAL",
      color: "#3B82F6",
      icon: "scissors",
      expectedDurationHours: 4,
    },
    {
      name: "AVIAMENTOS",
      displayName: "Aviamentos",
      orderIndex: 2,
      type: "INTERNAL",
      color: "#8B5CF6",
      icon: "package",
      expectedDurationHours: 2,
    },
    {
      name: "PRODUCAO",
      displayName: "Produção / Facção",
      orderIndex: 3,
      type: "EXTERNAL",
      color: "#F59E0B",
      icon: "factory",
      expectedDurationHours: 48,
    },
    {
      name: "TRAVETE",
      displayName: "Travete",
      orderIndex: 4,
      type: "INTERNAL",
      color: "#EF4444",
      icon: "zap",
      expectedDurationHours: 4,
    },
    {
      name: "LIMPEZA",
      displayName: "Limpeza",
      orderIndex: 5,
      type: "INTERNAL",
      color: "#06B6D4",
      icon: "sparkles",
      expectedDurationHours: 3,
    },
    {
      name: "CONFERENCIA",
      displayName: "Conferência",
      orderIndex: 6,
      type: "QUALITY",
      color: "#F97316",
      icon: "check-circle",
      expectedDurationHours: 2,
    },
    {
      name: "EMBALAGEM",
      displayName: "Embalagem",
      orderIndex: 7,
      type: "PACKING",
      color: "#10B981",
      icon: "box",
      expectedDurationHours: 2,
    },
    {
      name: "ESTOQUE",
      displayName: "Estoque",
      orderIndex: 8,
      type: "STOCK",
      color: "#6366F1",
      icon: "warehouse",
      expectedDurationHours: 0,
    },
  ];

  const stages: Record<string, string> = {};
  for (const s of stagesData) {
    const stage = await prisma.stage.upsert({
      where: {
        tenantId_orderIndex: {
          tenantId: tenant.id,
          orderIndex: s.orderIndex,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        ...s,
        expectedDurationHours: s.expectedDurationHours,
      },
    });
    stages[s.name] = stage.id;
  }
  console.log(`Stages: ${Object.keys(stages).length} etapas criadas`);

  // 4. Production Order — 1 OP com 3 sub-lotes
  const po = await prisma.productionOrder.upsert({
    where: {
      tenantId_opNumber: {
        tenantId: tenant.id,
        opNumber: "OP-20260309-001",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      opNumber: "OP-20260309-001",
      productName: "Conjunto Renda Preta",
      reference: "CR-001",
      description: "Conjunto feminino em renda preta, coleção verão 2026",
      totalQuantity: 500,
      metaCoefficient: 1.2,
      status: "OPEN",
      priority: 0,
      createdById: admin.id,
    },
  });
  console.log(`OP: ${po.opNumber} — ${po.productName} (${po.totalQuantity} peças)`);

  // Sub-lotes
  const lotsData = [
    { lotNumber: "L001", quantity: 200, barcode: "OP-20260309-001-L001" },
    { lotNumber: "L002", quantity: 150, barcode: "OP-20260309-001-L002" },
    { lotNumber: "L003", quantity: 150, barcode: "OP-20260309-001-L003" },
  ];

  for (const l of lotsData) {
    const lot = await prisma.lot.upsert({
      where: { barcode: l.barcode },
      update: {},
      create: {
        poId: po.id,
        barcode: l.barcode,
        lotNumber: l.lotNumber,
        quantity: l.quantity,
        status: LotStatus.CREATED,
        currentStageId: stages["CORTE"],
        destination: "INTERNAL",
        createdById: admin.id,
      },
    });
    console.log(`  Lote: ${lot.barcode} (${lot.quantity} peças)`);
  }

  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
