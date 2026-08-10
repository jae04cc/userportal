/**
 * Local-only helper: seeds a normal user, a group, and services at each
 * visibility level so RBAC can be exercised end to end. Safe to re-run.
 *
 *   node scripts/seed-test-data.mjs
 */
import { createClient } from "@libsql/client";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";

const scryptAsync = promisify(scrypt);
const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "userportal.db");
const client = createClient({ url: `file:${DB_PATH}` });

const id = () => randomBytes(16).toString("base64url");
const now = Date.now();

async function hash(pw) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(pw, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

async function main() {
  await client.execute("PRAGMA foreign_keys = ON");

  // --- group ---------------------------------------------------------------
  let group = (await client.execute("SELECT id FROM groups WHERE name = 'Media'")).rows[0];
  if (!group) {
    const gid = id();
    await client.execute({
      sql: "INSERT INTO groups (id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [gid, "Media", "Access to media services", 0, now],
    });
    group = { id: gid };
  }

  // --- normal user, member of Media ---------------------------------------
  let user = (await client.execute("SELECT id FROM users WHERE username = 'testuser'")).rows[0];
  if (!user) {
    const uid = id();
    await client.execute({
      sql: `INSERT INTO users (id, username, password_hash, display_name, is_admin, is_bootstrap, created_at)
            VALUES (?, ?, ?, ?, 0, 0, ?)`,
      args: [uid, "testuser", await hash("testpass123"), "Test User", now],
    });
    user = { id: uid };
  }
  await client.execute({
    sql: "INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)",
    args: [user.id, group.id],
  });

  // --- a user in NO groups -------------------------------------------------
  let outsider = (await client.execute("SELECT id FROM users WHERE username = 'outsider'")).rows[0];
  if (!outsider) {
    await client.execute({
      sql: `INSERT INTO users (id, username, password_hash, display_name, is_admin, is_bootstrap, created_at)
            VALUES (?, ?, ?, ?, 0, 0, ?)`,
      args: [id(), "outsider", await hash("testpass123"), "Outsider", now],
    });
  }

  // --- category + one service per visibility mode --------------------------
  let category = (await client.execute("SELECT id FROM categories WHERE name = 'Test Services'")).rows[0];
  if (!category) {
    const cid = id();
    await client.execute({
      sql: "INSERT INTO categories (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)",
      args: [cid, "Test Services", 1, now],
    });
    category = { id: cid };
  }

  const fixtures = [
    ["Public Service", "all", "globe", "https://example.com/public", "PublicMonitor"],
    ["Media Service", "groups", "clapperboard", "https://example.com/media", "MediaMonitor"],
    ["Secret Service", "admin", "lock", "https://example.com/secret", null],
  ];

  for (const [name, visibility, icon, url, monitor] of fixtures) {
    const existing = (
      await client.execute({ sql: "SELECT id FROM services WHERE name = ?", args: [name] })
    ).rows[0];
    if (existing) continue;

    const sid = id();
    await client.execute({
      sql: `INSERT INTO services (id, category_id, name, description, icon, url, monitor_key, visibility, sort_order, is_enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      args: [sid, category.id, name, `${visibility} visibility`, icon, url, monitor, visibility, now, now],
    });

    if (visibility === "groups") {
      await client.execute({
        sql: "INSERT OR IGNORE INTO service_groups (service_id, group_id) VALUES (?, ?)",
        args: [sid, group.id],
      });
    }
  }

  console.log("Seeded: group 'Media', users 'testuser' (member) / 'outsider' (no groups), 3 services.");
  console.log("Both test users have password: testpass123");
}

main().then(() => process.exit(0));
