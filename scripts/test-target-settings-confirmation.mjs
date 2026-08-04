import { readFile } from "node:fs/promises";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile("src/lib/target-settings-confirmation.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "require", "module", compiled)(module.exports, () => {}, module);

const expected = {
  shiftStart: "00:00",
  shiftEnd: "23:59",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  hourlyMetaEnabled: true,
};
const { confirmsTargetTimeSave } = module.exports;

assert(confirmsTargetTimeSave({ ...expected }, expected), "A matching server echo must allow success.");
assert(!confirmsTargetTimeSave({ ...expected, shiftStart: "07:00" }, expected), "A stale shiftStart must block success.");
assert(!confirmsTargetTimeSave(null, expected), "A missing server echo must block success.");

console.log("PASS: the settings UI accepts success only when saved time settings match the submitted form.");
