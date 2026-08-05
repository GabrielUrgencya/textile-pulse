import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile("src/components/settings/SectorTargetsCard.tsx", "utf8");

assert(source.includes("<RadioGroup"), "Hourly source must use the accessible project RadioGroup");
assert(source.includes('{ value: "NONE", label: "Sem meta" }'), "NONE must be explicit");
assert(source.includes('{ value: "AUTO", label: "Automática" }'), "AUTO must be explicit");
assert(source.includes('{ value: "MANUAL", label: "Manual" }'), "MANUAL must be explicit");
assert(source.includes('current.mode === "MANUAL"'), "Manual field and validation must be conditional");
assert(source.includes('min={1} step={1} required'), "Manual input must reject zero, fractions and empty values");
assert(source.includes("hourly_target_mode: current.mode"), "Save payload must include the explicit source");
assert(source.includes('current.mode === "MANUAL" ? manualTarget : null'), "NONE/AUTO must clear stale manual values");
assert(source.includes("json.data as SectorTarget"), "UI must render the server-confirmed state after saving");

console.log("PASS: sector targets expose and persist accessible NONE/AUTO/MANUAL states.");
