import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("src/components/sales/admin/SalesTvAdmin.tsx", "utf8");
const page = readFileSync("src/app/vendas/admin/tv/page.tsx", "utf8");
const nav = readFileSync(
  "src/components/sales/admin/SalesAdminSubnavigation.tsx",
  "utf8",
);
const generic = readFileSync("src/app/api/admin/kiosk-tokens/route.ts", "utf8");
assert.match(page, /SalesAdminRoute/);
assert.match(page, /redirectPath="\/vendas\/admin\/tv"/);
assert.match(nav, /\/vendas\/admin\/tv/);
for (const method of ["GET", "POST", "PATCH", "DELETE"])
  assert.match(ui, new RegExp(`"${method}"`));
assert.match(ui, /Revelação única/);
assert.match(ui, /\/vendas\/tv#token=\$\{secret\.token\}/);
assert.match(ui, /setSecret\(null\)/);
assert.match(ui, /window\.addEventListener\("pagehide", clearSecret\)/);
assert.match(
  ui,
  /document\.addEventListener\("visibilitychange", hideSecret\)/,
);
assert.match(ui, /document\.visibilityState === "hidden"/);
assert.match(ui, /return \(\) => \{\s*clearSecret\(\)/);
assert.match(ui, /const \[origin, setOrigin\]/);
assert.match(ui, /setOrigin\(window\.location\.origin\)/);
assert.match(ui, /useMemo/);
assert.doesNotMatch(
  ui,
  /const oneTimeUrl = secret\s*\? `\$\{window\.location\.origin\}/,
);
assert.match(ui, /navigator\.clipboard\.writeText/);
assert.match(ui, /await navigator\.clipboard\.writeText\(oneTimeUrl\)/);
assert.match(ui, /Endereço seguro copiado/);
assert.match(ui, /Não foi possível copiar/);
assert.match(ui, /catch \{/);
assert.match(ui, /finally \{\s*setCopying\(false\)/);
assert.doesNotMatch(ui, /catch \{[\s\S]{0,200}setSecret\(null\)/);
assert.match(ui, /aria-live="polite"/);
assert.match(ui, /role="alert"/);
assert.doesNotMatch(
  ui,
  /localStorage|sessionStorage|document\.cookie|console\.|\?token=/,
);
assert.match(generic, /body\.scope === "sales_tv"/);
assert.match(generic, /\.neq\("scope", "sales_tv"\)/);
console.log(
  "PASS: sales TV admin UI reveals credentials once, supports lifecycle controls and blocks the generic token flow.",
);
