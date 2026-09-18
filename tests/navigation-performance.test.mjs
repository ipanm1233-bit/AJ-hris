import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const auth = readFileSync(new URL("../js/auth.js", import.meta.url), "utf8");

test("navigation reuses short-lived session and permission results", () => {
  assert.match(auth, /PERMISSION_CACHE_TTL_MS = 15_000/);
  assert.match(auth, /SESSION_SYNC_TTL_MS = 30_000/);
  assert.match(auth, /ATASAN_CACHE_TTL_MS = 60_000/);
  assert.match(auth, /findUserOverride\(session\)[\s\S]*loadPermissionOverrides\(false\)/);
  assert.match(auth, /if \(!force && _sessionSyncCache/);
});

test("router avoids duplicate session sync and warms route assets", () => {
  const routerBlock = app.split("async function router(session)")[1]?.split("/* ---------------------------------------------------------------------\n * SHELL INTERACTIONS")[0] || "";
  assert.doesNotMatch(routerBlock, /syncSessionWithDb\(/);
  assert.match(app, /const routeModuleCache = new Map\(\)/);
  assert.match(app, /function prefetchRoute\(route\)/);
  assert.match(app, /nav\.addEventListener\("pointerover", warmRoute/);
  assert.match(routerBlock, /container\.innerHTML = html;[\s\S]*const mod = await modulePromise/);
});

test("unchanged navigation shell is not rebuilt", () => {
  assert.match(app, /renderedShellSignature === shellSignature/);
  assert.match(app, /renderedShellSignature = shellSignature/);
});
