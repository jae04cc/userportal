/**
 * Copies portal configuration from one database to another — the dev instance
 * to production, typically.
 *
 *   node scripts/copy-config.mjs <source.db> <target.db> [--apply]
 *
 * Without --apply it reports what it would do and changes nothing.
 *
 * WHAT MOVES: categories, services, groups, status pane tiles, the group links
 * between them, and application settings.
 *
 * WHAT DOES NOT, deliberately:
 *   users, user_groups  — the target keeps its own accounts and passwords.
 *                         Copying these would silently replace the target's
 *                         admin credentials with the source's.
 *   audit_log           — it records what happened on the source instance;
 *                         replaying it on the target would be a fiction.
 *   auth_secret         — signs the target's session cookies. Overwriting it
 *                         signs everyone out for no benefit.
 *   env_seeded          — a marker for one-time env seeding on that instance.
 *   oidc_client_secret  — never move a live credential between instances.
 *
 * Settings with an empty value are skipped rather than copied, so running this
 * from a dev box that has no SSO configured cannot blank out the target's
 * working SSO configuration.
 *
 * BOTH DATABASES MUST BE IDLE. SQLite over a network share cannot be locked
 * reliably; stop the target container before running this against its file.
 */
import { createClient } from "@libsql/client";

const [, , sourcePath, targetPath, ...flags] = process.argv;
const apply = flags.includes("--apply");

if (!sourcePath || !targetPath) {
  console.error("usage: node scripts/copy-config.mjs <source.db> <target.db> [--apply]");
  process.exit(1);
}

const source = createClient({ url: `file:${sourcePath}` });
const target = createClient({ url: `file:${targetPath}` });

/** Never copied, for the reasons in the header comment. */
const SETTING_DENYLIST = new Set(["auth_secret", "env_seeded", "oidc_client_secret"]);

/**
 * Parents first. Inserts run in this order and deletes run in reverse, so
 * foreign keys hold at every point.
 */
const TABLES = [
  "categories",
  "groups",
  "services",
  "status_items",
  "service_groups",
  "status_item_groups",
];

async function columns(db, table) {
  const info = await db.execute(`PRAGMA table_info("${table}")`);
  return info.rows.map((r) => r.name);
}

async function count(db, table) {
  return Number((await db.execute(`SELECT COUNT(*) n FROM "${table}"`)).rows[0].n);
}

console.log(`source: ${sourcePath}`);
console.log(`target: ${targetPath}`);
console.log(apply ? "\nMODE: apply\n" : "\nMODE: dry run (pass --apply to write)\n");

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const plan = [];
for (const table of TABLES) {
  const srcCols = await columns(source, table);
  const tgtCols = await columns(target, table);
  const shared = srcCols.filter((c) => tgtCols.includes(c));
  const dropped = srcCols.filter((c) => !tgtCols.includes(c));

  const rows = (await source.execute(`SELECT * FROM "${table}"`)).rows;
  plan.push({ table, shared, rows });

  console.log(
    `  ${table.padEnd(20)} ${String(rows.length).padStart(3)} rows -> replacing ${await count(
      target,
      table
    )}${dropped.length ? `   (target lacks: ${dropped.join(", ")})` : ""}`
  );
}

const settings = (await source.execute("SELECT key, value FROM app_settings")).rows.filter(
  (r) => !SETTING_DENYLIST.has(r.key) && String(r.value ?? "").trim() !== ""
);
console.log(`  ${"app_settings".padEnd(20)} ${String(settings.length).padStart(3)} keys -> upsert`);
console.log(`\n  settings: ${settings.map((s) => s.key).join(", ")}`);
console.log("\n  untouched: users, user_groups, audit_log");

if (!apply) {
  console.log("\nDry run only. Nothing was written.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

await target.execute("PRAGMA foreign_keys = ON");
const tx = await target.transaction("write");

try {
  for (const { table } of [...plan].reverse()) {
    await tx.execute(`DELETE FROM "${table}"`);
  }

  for (const { table, shared, rows } of plan) {
    if (rows.length === 0) continue;
    const cols = shared.map((c) => `"${c}"`).join(", ");
    const placeholders = shared.map(() => "?").join(", ");
    for (const row of rows) {
      await tx.execute({
        sql: `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`,
        args: shared.map((c) => row[c]),
      });
    }
  }

  for (const { key, value } of settings) {
    await tx.execute({
      sql: "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [key, value],
    });
  }

  await tx.commit();
  console.log("\nApplied.");
} catch (err) {
  await tx.rollback();
  console.error("\nRolled back — nothing changed:", err.message);
  process.exit(1);
}

for (const { table } of plan) {
  console.log(`  ${table.padEnd(20)} now ${await count(target, table)}`);
}
