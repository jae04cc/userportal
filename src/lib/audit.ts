import "server-only";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { generateId } from "@/lib/utils";
import type { CurrentUser } from "@/lib/authz";
import { desc } from "drizzle-orm";

type AuditEntry = {
  actor: CurrentUser;
  action: "create" | "update" | "delete" | "reorder";
  entityType: "category" | "service" | "group" | "user" | "motd" | "membership";
  entityId?: string | null;
  summary: string;
};

export async function recordAudit({ actor, action, entityType, entityId, summary }: AuditEntry) {
  await db.insert(auditLog).values({
    id: generateId(),
    actorUserId: actor.id,
    actorUsername: actor.username,
    action,
    entityType,
    entityId: entityId ?? null,
    summary,
    createdAt: new Date(),
  });
}

export async function listAudit(limit = 200) {
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}
