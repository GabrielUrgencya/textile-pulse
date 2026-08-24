import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const ui = await read(
  "src/components/sales/consultant/SalesConsultantWorkspace.tsx",
);
const page = await read("src/app/vendas/app/page.tsx");
for (const text of [
  "Pipeline · OPEN",
  "Realizado · CLOSED",
  "Ticket médio por venda",
  "Ticket médio por peça",
  "Trimestral",
  "Contribuição coletiva",
  "Somente leitura · período encerrado",
  "Sem conexão",
  "Recarregar estado atual",
  "Salvar venda",
  "Minhas vendas",
])
  assert.match(ui, new RegExp(text), `missing UX contract: ${text}`);
assert.match(
  ui,
  /sessionStorage\.setItem\(DRAFT_KEY/,
  "draft and idempotency key must survive retries",
);
assert.match(
  ui,
  /BroadcastChannel\("lision-sales-celebration"\)/,
  "celebration must coordinate tabs",
);
assert.match(
  ui,
  /aria-live="polite"/,
  "success and celebration need polite announcements",
);
assert.match(
  ui,
  /role="alert"/,
  "errors and offline state need urgent announcements",
);
assert.match(
  ui,
  /hidden overflow-x-auto[\s\S]*md:block/,
  "desktop table is required",
);
assert.match(ui, /grid gap-3 md:hidden/, "mobile cards are required");
assert.doesNotMatch(
  ui,
  /consultant(Profile)?Id|tenantId|actorId|CANCELLED/,
  "consultant UI must not expose identity selectors or cancellation",
);
assert.match(
  ui,
  /dashboard\.average_per_business_day/,
  "business-day average must come from the canonical dashboard",
);
assert.doesNotMatch(
  ui,
  /realized_value[\s\S]{0,120}business_days_elapsed/,
  "business-day average must not be recalculated in the client",
);
assert.match(
  ui,
  /dashboard\?\.available_periods/,
  "period filters must use the canonical tenant-scoped catalog",
);
assert.match(
  ui,
  /prefers-reduced-motion: reduce/,
  "programmatic scrolling must respect reduced motion",
);
assert.match(
  ui,
  /motion-safe:animate-pulse/,
  "loading animation must respect reduced motion",
);
assert.match(
  ui,
  /getTimezoneOffset\(\)/,
  "datetime-local values must preserve local wall-clock time",
);
assert.doesNotMatch(
  ui,
  /const ForwardSaleForm|<SaleForm ref=/,
  "form refs must be attached to a real DOM wrapper",
);
assert.match(
  ui,
  /String\(goal\.scope\) === "INDIVIDUAL" &&[\s\S]{0,80}goal\.is_challenge !== true/,
  "Meta 1/2/3 must include only non-challenge INDIVIDUAL goals",
);
assert.match(
  ui,
  /String\(goal\.scope\) === "INDIVIDUAL" && goal\.is_challenge === true/,
  "challenges must include only INDIVIDUAL challenge goals",
);
assert.doesNotMatch(
  ui,
  /String\(goal\.scope\) === "QUARTERLY"/,
  "quarterly goals must render only from dashboard.quarterly",
);
assert.match(
  ui,
  /setFieldErrors\(invalid\)/,
  "validation must retain per-field errors",
);
assert.match(
  ui,
  /requestAnimationFrame\(\(\) => errorRef\.current\?\.focus\(\)\)/,
  "invalid submit must focus only the error summary",
);
assert.doesNotMatch(
  ui,
  /errorRef\.current\?\.focus\(\);[\s\S]{0,80}\.focus\(\)/,
  "invalid submit must not immediately move focus away from the summary",
);
assert.match(
  ui,
  /aria-invalid=\{Boolean\(fieldErrors\./,
  "invalid controls need aria-invalid",
);
assert.match(
  ui,
  /aria-describedby=\{fieldErrors\./,
  "invalid controls need described-by errors",
);
assert.match(
  ui,
  /href=\{`#\$\{fieldId\(field\)\}`\}/,
  "error summary must navigate to invalid controls",
);
assert.match(
  page,
  /<SalesConsultantWorkspace \/>/,
  "the consultant route must render the workspace",
);
console.log(
  "PASS: consultant UI covers canonical dashboard, own sales, form, resilient states, a11y and mobile.",
);
