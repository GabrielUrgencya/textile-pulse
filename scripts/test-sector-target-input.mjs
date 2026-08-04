import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile("src/components/settings/SectorTargetsCard.tsx", "utf8");

assert(source.includes("const value = event.currentTarget.value;"), "Numeric input must capture the event value before state work.");
assert(source.includes('onInput={handleNumberInput(st.id, "target")}'), "Daily target must update on native input.");
assert(source.includes('onInput={handleNumberInput(st.id, "hourly")}'), "Hourly override must update on native input.");
assert(!source.includes("{ ...val(stageId), [key]: value }"), "Draft updates must use the latest state, not a stale render snapshot.");

console.log("PASS: sector target numeric inputs capture native values before drafting state.");
