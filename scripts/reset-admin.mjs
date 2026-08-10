/**
 * Break-glass recovery. Regenerates the bootstrap admin's password and prints
 * it, creating the account if it's missing.
 *
 * This exists because everything else about access — who is an admin, who is in
 * which group — comes from the identity provider. If the IdP is misconfigured,
 * unreachable, or the client secret is wrong, this is how you get back in.
 *
 *   docker compose exec userportal node scripts/reset-admin.mjs
 *   npm run reset-admin          (locally)
 */
import { createClient } from "@libsql/client";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";

const scryptAsync = promisify(scrypt);
const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "userportal.db");
const client = createClient({ url: `file:${DB_PATH}` });

async function hash(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

async function main() {
  const password = randomBytes(12).toString("base64url");
  const passwordHash = await hash(password);

  const existing = await client.execute("SELECT id, username FROM users WHERE is_bootstrap = 1");
  let username;

  if (existing.rows.length > 0) {
    username = existing.rows[0][1];
    await client.execute({
      sql: `UPDATE users
            SET password_hash = ?, must_change_password = 1, is_admin = 1, is_active = 1
            WHERE id = ?`,
      args: [passwordHash, existing.rows[0][0]],
    });
  } else {
    username = "admin";
    // Make room if an ordinary account already holds the name.
    const clash = await client.execute({
      sql: "SELECT id FROM users WHERE username = ?",
      args: [username],
    });
    if (clash.rows.length > 0) username = `admin-${randomBytes(3).toString("hex")}`;

    await client.execute({
      sql: `INSERT INTO users (id, username, password_hash, display_name, is_admin, is_bootstrap, is_active, must_change_password, created_at)
            VALUES (?, ?, ?, 'Admin', 1, 1, 1, 1, ?)`,
      args: [randomBytes(16).toString("base64url"), username, passwordHash, Math.floor(Date.now() / 1000)],
    });
  }

  console.log(
    "\n=========================================================\n" +
      "  Bootstrap admin password reset\n" +
      `  Username: ${username}\n` +
      `  Password: ${password}\n` +
      "  Sign in at /login?local=1 and change it from Account.\n" +
      "=========================================================\n"
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to reset the bootstrap admin:", err.message);
    process.exit(1);
  });
