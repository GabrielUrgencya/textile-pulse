import { readFile } from "node:fs/promises";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile("src/lib/target-time-input.ts", "utf8");
const componentSource = await readFile("src/components/settings/TargetsConfig.tsx", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "require", "module", compiled)(module.exports, () => {}, module);

const initial = {
  shiftStart: "07:00",
  shiftEnd: "17:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  dailyPiecesTarget: 1000,
};
const { targetTimeFields, withTargetTimeValue } = module.exports;

assert(targetTimeFields.length === 4, "All four time controls must use the shared contract.");
assert(
  componentSource.includes("const value = event.currentTarget.value;") &&
    componentSource.includes("withTargetTimeValue(prev, field, value)"),
  "The input value must be captured before the deferred state updater runs.",
);
for (const field of targetTimeFields) {
  const next = withTargetTimeValue(initial, field, "00:00");
  assert(next[field] === "00:00", `${field} must accept the native input value immediately.`);
  assert(next.dailyPiecesTarget === 1000, `${field} must preserve non-time target values.`);
  assert(initial[field] !== "00:00", `${field} must not mutate the current form state.`);
}

console.log("PASS: every target time input updates the controlled form state from its input value.");
