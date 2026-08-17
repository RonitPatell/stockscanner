import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("admin company-readiness API requires requireAdmin", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/admin/company-readiness/route.ts"),
    "utf8"
  );
  assert.match(src, /requireAdmin/);
  assert.match(src, /no-store/);
  assert.doesNotMatch(src, /passwordHash|CRON_SECRET|DATABASE_URL/);
});

test("admin company-readiness page uses isAdminEmail", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/admin/company-readiness/page.tsx"),
    "utf8"
  );
  assert.match(src, /isAdminEmail/);
  assert.match(src, /redirect\("\/login"\)/);
});
