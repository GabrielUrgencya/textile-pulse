import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const forward = await readFile("prisma/migrations/20260805120000_sector_hourly_target_mode/migration.sql", "utf8");
const rollback = await readFile("prisma/migrations/20260805120000_sector_hourly_target_mode/rollback.sql", "utf8");
const corrective = await readFile("prisma/migrations/20260805153000_correct_fabrica_hourly_target_modes/migration.sql", "utf8");

assert(forward.includes('ADD COLUMN IF NOT EXISTS "hourly_target_mode"'), "Forward migration must be rerunnable");
assert(forward.includes("ALTER COLUMN \"hourly_target_mode\" SET DEFAULT 'NONE'"), "New rows must default to NONE");
assert(forward.includes("t.\"slug\" = 'fabrica-teste-31ykr'"), "Business DML must be restricted to Fábrica Teste");
assert(!forward.includes("t.\"slug\" = 'liserie'"), "Migration must never update Liserie business data");
assert(forward.includes('"hourly_target_mode" IS NULL'), "Constraint must accept untouched legacy tenant rows");
assert(rollback.includes('DROP COLUMN IF EXISTS "hourly_target_mode"'), "Rollback must remove only the new mode column");
assert(!rollback.includes('DROP COLUMN IF EXISTS "hourly_target"'), "Rollback must preserve pre-existing manual targets");
assert(!rollback.includes("hourly_goal_enabled"), "Rollback must preserve the intermediate legacy toggle");
assert(corrective.includes("t.\"slug\" = 'fabrica-teste-31ykr'"), "Correction must be restricted to Fábrica Teste");
assert(!corrective.includes("t.\"slug\" = 'liserie'"), "Correction must never update Liserie");
assert(!corrective.includes('sdc.\"hourly_goal_enabled\"'), "Correction must not infer AUTO from the historical toggle");
assert(corrective.includes("THEN 'MANUAL'") && corrective.includes("ELSE 'NONE'"), "Final chain must normalize only MANUAL or NONE");

console.log("PASS: migration is isolated, transition-aware, rerunnable and has a non-destructive rollback contract.");
