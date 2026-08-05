import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const stages = await readFile("src/components/settings/StageManager.tsx", "utf8");
assert(stages.includes("reorderTimerRef") && stages.includes("renameTimersRef"), "Rename and reorder must use independent timers");
assert(stages.includes("if (!res.ok)") && stages.includes("Erro ao renomear"), "Rename must surface HTTP failure");
assert(stages.includes("refetch();"), "Failed optimistic stage updates must restore server state");
assert(!stages.includes("Reversível — dá para recriar"), "Deactivate dialog must not claim recreate restores historical identity");
const stageRoute = await readFile("src/app/api/settings/stages/[id]/route.ts", "utf8");
const stagesRoute = await readFile("src/app/api/settings/stages/route.ts", "utf8");
const getStagesRoute = stagesRoute.slice(stagesRoute.indexOf("export async function GET"), stagesRoute.indexOf("export async function POST"));
const postStagesRoute = stagesRoute.slice(stagesRoute.indexOf("export async function POST"));
assert(getStagesRoute.includes("const t = requireTenantId(user);") && getStagesRoute.includes('.eq("tenant_id", t.tenantId)') && getStagesRoute.includes('.eq("is_active", true)'), "Stage GET must list only active stages from the authenticated tenant");
const uniquenessStart = postStagesRoute.indexOf("const { data: existingStage }");
const uniquenessEnd = postStagesRoute.indexOf("if (existingStage)", uniquenessStart);
assert(uniquenessStart >= 0 && uniquenessEnd > uniquenessStart, "Stage uniqueness query must remain present");
const uniquenessQuery = postStagesRoute.slice(uniquenessStart, uniquenessEnd);
assert(uniquenessQuery.includes('.eq("tenant_id", t.tenantId)') && uniquenessQuery.includes('.eq("is_active", true)') && uniquenessQuery.includes('.ilike("name", body.name)'), "Stage uniqueness query must be active-only and tenant-scoped");
const maxOrderStart = postStagesRoute.indexOf("const { data: existing }");
const maxOrderEnd = postStagesRoute.indexOf("const nextIndex", maxOrderStart);
assert(maxOrderStart >= 0 && maxOrderEnd > maxOrderStart, "Stage max-order query must remain present");
const maxOrderQuery = postStagesRoute.slice(maxOrderStart, maxOrderEnd);
assert(maxOrderQuery.includes('.eq("tenant_id", t.tenantId)') && maxOrderQuery.includes('.order("order_index", { ascending: false })'), "Stage max-order query must be tenant-scoped");
const deleteStageRoute = stageRoute.slice(stageRoute.indexOf("export async function DELETE"));
assert(deleteStageRoute.includes(".update({ is_active: false })") && deleteStageRoute.includes('.eq("tenant_id", t.tenantId)') && deleteStageRoute.includes('.eq("is_active", true)'), "Stage DELETE must be an active, tenant-scoped soft-delete");
assert(!deleteStageRoute.includes(".delete()") && !deleteStageRoute.includes(".delete("), "Stage DELETE must preserve historical rows");
const targetsConfig = await readFile("src/components/settings/TargetsConfig.tsx", "utf8");
assert(targetsConfig.includes("Disponibilizar meta por hora na TV") && targetsConfig.includes("setores em Sem meta continuam mostrando o herói do Dia"), "Global hourly option must be availability-only and preserve NONE as daily hero");
assert(stageRoute.includes("body.name.trim()") && stageRoute.includes("não pode ficar vazio"), "Stage PATCH must trim and reject an empty name");

const portal = await readFile("src/app/portal/(authenticated)/shipments/page.tsx", "utf8");
const groupCard = portal.slice(portal.indexOf("function GroupCard"), portal.indexOf("function LoadingSkeleton"));
assert(groupCard.includes("statusCounts"), "Grouped portal shipments must aggregate status counts");
assert(!groupCard.includes("const status = shipments[0]"), "Grouped portal status must not come from the first shipment");
assert(groupCard.includes(".sort()[0]"), "Grouped portal deadline must use the earliest date");

console.log("PASS: stage persistence and mixed grouped-shipment summaries are honest.");
