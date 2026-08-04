import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import ts from "typescript";

const unavailableMessage =
  "O serviço de autenticação está temporariamente indisponível. Tente novamente em alguns instantes.";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sanitizeServerStderr(value) {
  return value
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_TOKEN]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/(password|token|secret|authorization|cookie|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(-4_000);
}

async function waitForServer(baseUrl, server) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`The isolated login test server exited with code ${server.exitCode}.`);
    }
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
    } catch {
      // The dev server is still starting.
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for the isolated login test server.");
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : null;
      probe.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error("Unable to select an ephemeral port."));
      });
    });
  });
}

async function stopServer(server) {
  if (!server?.pid || server.exitCode !== null) return;

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("error", resolve);
      killer.once("close", resolve);
    });
    return;
  }

  server.kill("SIGTERM");
}

async function startTestServer() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = await findAvailablePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "-p", String(port)],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      }
    );
    let stderr = "";
    server.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8_000);
    });

    try {
      await waitForServer(baseUrl, server);
      return { baseUrl, server, getStderr: () => stderr };
    } catch (error) {
      await stopServer(server);
      if (/EADDRINUSE/i.test(stderr) && attempt < 4) continue;
      error.serverStderr = stderr;
      throw error;
    }
  }

  throw new Error("Unable to start the isolated login test server on a free port.");
}

async function loadLoginRoute(signInWithPassword) {
  const source = await readFile("src/app/api/auth/login/route.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const routeRequire = (request) => {
    if (request === "next/server") {
      return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }
    if (request === "@/lib/supabase-server") {
      return { createSupabaseServerClient: () => ({ auth: { signInWithPassword } }) };
    }
    throw new Error(`Unexpected module request: ${request}`);
  };

  new Function("exports", "require", "module", compiled)(module.exports, routeRequire, module);
  return module.exports.POST;
}

async function verifyRouteContract() {
  const unavailableRoute = await loadLoginRoute(async () => {
    throw new TypeError("fetch failed");
  });
  const unavailableResponse = await unavailableRoute(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.test", password: "not-a-real-password" }),
    })
  );
  const unavailableBody = await unavailableResponse.json();

  assert(unavailableResponse.status === 503, `Expected 503, got ${unavailableResponse.status}`);
  assert(unavailableBody.error === unavailableMessage, "The API response must use the neutral availability message.");
  assert(!JSON.stringify(unavailableBody).includes("fetch failed"), "The API response leaked the provider error.");

  const invalidCredentialsRoute = await loadLoginRoute(async () => ({
    data: { user: null, session: null },
    error: { message: "Provider detail that must not reach the client" },
  }));
  const invalidCredentialsResponse = await invalidCredentialsRoute(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.test", password: "not-a-real-password" }),
    })
  );
  const invalidCredentialsBody = await invalidCredentialsResponse.json();

  assert(invalidCredentialsResponse.status === 401, `Expected 401, got ${invalidCredentialsResponse.status}`);
  assert(invalidCredentialsBody.error === "Credenciais inválidas", "The 401 response must stay neutral.");

  const missingUserRoute = await loadLoginRoute(async () => ({
    data: { user: null, session: null },
    error: null,
  }));
  const missingUserResponse = await missingUserRoute(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.test", password: "not-a-real-password" }),
    })
  );
  const missingUserBody = await missingUserResponse.json();

  assert(missingUserResponse.status === 401, `Expected 401 without user, got ${missingUserResponse.status}`);
  assert(missingUserBody.error === "Credenciais inválidas", "A missing user must keep the neutral 401 response.");
}

let browser;
let server;
let baseUrl;
let getServerStderr = () => "";

try {
  await verifyRouteContract();
  ({ baseUrl, server, getStderr: getServerStderr } = await startTestServer());

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: unavailableMessage }),
    })
  );
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 15_000 });
  const emailModeButton = page.getByRole("button", {
    name: "Email e Senha Admin e Gerentes",
    exact: true,
  });
  await emailModeButton.waitFor({ state: "visible" });
  assert(await emailModeButton.isEnabled(), "The admin email login mode must be enabled.");
  await emailModeButton.click();
  await page.getByRole("heading", { name: "Email e Senha", exact: true }).waitFor();
  await page.getByPlaceholder("admin@lision.com").fill("admin@example.test");
  await page.getByPlaceholder("••••••••").fill("not-a-real-password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText(unavailableMessage).waitFor({ timeout: 10_000 });

  const pageText = await page.locator("body").innerText();
  assert(!pageText.includes("fetch failed"), "The login UI leaked the provider error.");

  console.log("PASS: login handles Supabase unavailability with a safe 503 response and UI message.");
} catch (error) {
  const diagnostic = sanitizeServerStderr(getServerStderr() || error.serverStderr || "");
  if (diagnostic) console.error(`Sanitized login test server stderr:\n${diagnostic}`);
  throw error;
} finally {
  await browser?.close();
  await stopServer(server);
}
