import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { generateId } from "@/lib/utils";
import { hashPassword, generateRandomPassword } from "@/lib/password";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "userportal.db");

// Ensure the data directory exists (important for Docker volume mounts)
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// @libsql/client uses the file: protocol for local SQLite. Async, with a pure-WASM
// fallback — no native compilation (node-gyp) required.
const client = createClient({ url: `file:${DB_PATH}` });

export const db = drizzle(client, { schema });

/**
 * Runs migrations, the admin bootstrap, and the first-run seed exactly once per
 * process, memoised on the promise so concurrent callers all await the same work.
 *
 * This is called lazily on the first DB touch rather than from an
 * instrumentation hook: Next 14 compiles instrumentation.ts for the edge runtime
 * as well as node, and the edge compile can't resolve node:fs / node:path.
 */
let initPromise: Promise<void> | null = null;

export function ensureDbReady(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await runMigrations();
      await bootstrapAdmin();
      await seedDefaults();
      // Dynamic import: settings.ts imports this module, so a static import
      // here would be a cycle.
      const { seedFromEnvOnce } = await import("@/lib/settings");
      await seedFromEnvOnce();
    })().catch((err) => {
      // Don't cache a failed init — let the next request retry rather than
      // leaving the process permanently broken.
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function runMigrations() {
  // SQLite/libsql don't enforce declared FK constraints unless this is set —
  // required for the ON DELETE CASCADE behaviour above to actually fire.
  await client.execute("PRAGMA foreign_keys = ON");

  // WAL lets readers proceed while a write is in flight; busy_timeout makes a
  // blocked writer wait rather than immediately failing with "database is
  // locked"; synchronous=NORMAL is the standard safe balance under WAL.
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA busy_timeout = 5000");
  await client.execute("PRAGMA synchronous = NORMAL");

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      oidc_sub TEXT UNIQUE,
      display_name TEXT,
      email TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_bootstrap INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_groups (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'portal',
      PRIMARY KEY (user_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      kind TEXT NOT NULL DEFAULT 'link',
      url TEXT NOT NULL,
      content TEXT,
      monitor_key TEXT,
      visibility TEXT NOT NULL DEFAULT 'all',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id, sort_order);

    CREATE TABLE IF NOT EXISTS service_groups (
      service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      PRIMARY KEY (service_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS status_items (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      monitor_key TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'all',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_status_items_order ON status_items(sort_order);

    CREATE TABLE IF NOT EXISTS status_item_groups (
      status_item_id TEXT NOT NULL REFERENCES status_items(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      PRIMARY KEY (status_item_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      actor_username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
  `);

  // Additive column migrations for databases created before these existed.
  // Each is guarded so restarts are idempotent.
  const userCols = await client.execute("PRAGMA table_info(users)");
  const hasCol = (name: string) => userCols.rows.some((r) => r[1] === name);

  if (!hasCol("is_active")) {
    await client.execute("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
  }
  if (!hasCol("must_change_password")) {
    await client.execute(
      "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0"
    );
  }

  const serviceCols = await client.execute("PRAGMA table_info(services)");
  const hasServiceCol = (name: string) => serviceCols.rows.some((r) => r[1] === name);

  if (!hasServiceCol("kind")) {
    await client.execute("ALTER TABLE services ADD COLUMN kind TEXT NOT NULL DEFAULT 'link'");
  }
  if (!hasServiceCol("content")) {
    await client.execute("ALTER TABLE services ADD COLUMN content TEXT");
  }

  const categoryCols = await client.execute("PRAGMA table_info(categories)");
  if (!categoryCols.rows.some((r) => r[1] === "start_collapsed")) {
    // Existing sections keep their current behaviour — open — so an upgrade
    // never hides someone's services behind a fold they didn't ask for.
    await client.execute(
      "ALTER TABLE categories ADD COLUMN start_collapsed INTEGER NOT NULL DEFAULT 0"
    );
  }

  const memberCols = await client.execute("PRAGMA table_info(user_groups)");
  if (!memberCols.rows.some((r) => r[1] === "source")) {
    // Existing rows predate the portal/IdP distinction. They were written by
    // the claim sync, so 'idp' is the honest default for them — marking them
    // 'portal' would pin memberships the IdP no longer grants.
    await client.execute("ALTER TABLE user_groups ADD COLUMN source TEXT NOT NULL DEFAULT 'portal'");
    await client.execute("UPDATE user_groups SET source = 'idp'");
  }
}

/**
 * If no users exist, create a bootstrap admin with a random password logged to
 * stdout so the operator can sign in once and set everything else up from /admin.
 */
export async function bootstrapAdmin() {
  const existing = await client.execute("SELECT COUNT(*) as count FROM users");
  if (Number(existing.rows[0]?.count ?? 0) > 0) return;

  const password = generateRandomPassword();
  const passwordHash = await hashPassword(password);

  await db.insert(schema.users).values({
    id: generateId(),
    username: "admin",
    passwordHash,
    displayName: "Admin",
    isAdmin: true,
    isBootstrap: true,
    // This password is now sitting in the container logs forever — nag until
    // it's rotated.
    mustChangePassword: true,
    createdAt: new Date(),
  });

  // eslint-disable-next-line no-console
  console.log(
    "\n=========================================================\n" +
      "  Userportal — bootstrap admin account created\n" +
      "  Username: admin\n" +
      `  Password: ${password}\n` +
      "  Sign in once, then create real accounts from /admin.\n" +
      "=========================================================\n"
  );
}

/**
 * Seeds a default MOTD and one example category/service on a brand-new database,
 * so the landing page isn't blank on first run. Only ever runs when there are no
 * categories at all — never re-seeds after an admin has deleted things.
 */
export async function seedDefaults() {
  const existing = await client.execute("SELECT COUNT(*) as count FROM categories");
  if (Number(existing.rows[0]?.count ?? 0) > 0) return;

  const now = new Date();

  await db
    .insert(schema.appSettings)
    .values({
      key: "motd",
      value:
        "Welcome to the portal. Edit this message from **Admin → MOTD**.\n\n" +
        "It supports basic markdown: **bold**, *italic*, [links](https://example.com), and lists.",
    })
    .onConflictDoNothing();

  const categoryId = generateId();
  await db.insert(schema.categories).values({
    id: categoryId,
    name: "Getting started",
    sortOrder: 0,
    createdAt: now,
  });

  await db.insert(schema.services).values({
    id: generateId(),
    categoryId,
    name: "Admin area",
    description: "Add your own categories and services here.",
    icon: "settings",
    url: "/admin",
    monitorKey: null,
    visibility: "admin",
    sortOrder: 0,
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
  });
}
