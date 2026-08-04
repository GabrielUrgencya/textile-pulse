import { readFile } from "node:fs/promises";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile("src/lib/hourly-target-window.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "require", "module", compiled)(
  module.exports,
  () => { throw new Error("The hourly target helper must not import runtime dependencies."); },
  module,
);

const { isActiveHourlyTargetWindow } = module.exports;
const minute = (hour, minutes = 0) => hour * 60 + minutes;
const shiftStart = minute(7);
const shiftEnd = minute(17);
const lunchStart = minute(12);
const lunchEnd = minute(13);

assert(isActiveHourlyTargetWindow(minute(10), shiftStart, shiftEnd, lunchStart, lunchEnd), "10:00 must activate the hourly target.");
assert(!isActiveHourlyTargetWindow(minute(12, 30), shiftStart, shiftEnd, lunchStart, lunchEnd), "Lunch must disable the hourly target.");
assert(!isActiveHourlyTargetWindow(minute(23, 51), shiftStart, shiftEnd, lunchStart, lunchEnd), "23:51 must use the daily fallback, not an hourly target.");

console.log("PASS: hourly targets are active only during the configured shift and outside lunch.");
