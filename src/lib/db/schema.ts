import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Terminology, because the spec used "group" for two different things:
//   category — a DISPLAY heading that service cards sit under ("Media")
//   group    — an ACCESS group a user belongs to, granting service visibility
// ---------------------------------------------------------------------------

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  // Null for OIDC-only accounts. Only accounts with a hash can use the
  // local break-glass login.
  passwordHash: text("password_hash"),
  // The only link key between a local account and an Authentik identity.
  // Never populated automatically from an email match.
  oidcSub: text("oidc_sub").unique(),
  displayName: text("display_name"),
  email: text("email"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  isBootstrap: integer("is_bootstrap", { mode: "boolean" }).notNull().default(false),
  // Suspend access without destroying the account or its audit trail. Checked
  // on every request, so revoking takes effect immediately despite JWT sessions.
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  // Set once the bootstrap admin rotates the generated password, so the
  // "change your password" banner can stop nagging.
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const userGroups = sqliteTable(
  "user_groups",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.groupId] }),
  })
);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/**
 * visibility:
 *   "all"    — any signed-in user
 *   "groups" — members of the groups in service_groups (admins see it regardless)
 *   "admin"  — admins only
 */
export type ServiceVisibility = "all" | "groups" | "admin";

export const services = sqliteTable(
  "services",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Either a lucide-react icon name ("clapperboard") or an http(s) image URL.
    icon: text("icon"),
    url: text("url").notNull(),
    // Binds the card to an Uptime Kuma monitor. Preferably the monitor's
    // numeric id (stable across renames); a monitor name also resolves, for
    // bindings typed by hand. Null = no indicator rendered.
    monitorKey: text("monitor_key"),
    visibility: text("visibility").$type<ServiceVisibility>().notNull().default("all"),
    sortOrder: integer("sort_order").notNull().default(0),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    categoryIdx: index("idx_services_category").on(t.categoryId, t.sortOrder),
  })
);

export const serviceGroups = sqliteTable(
  "service_groups",
  {
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.serviceId, t.groupId] }),
  })
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    // Denormalised so entries stay readable after the actor is deleted.
    actorUsername: text("actor_username").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    createdIdx: index("idx_audit_created").on(t.createdAt),
  })
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  userGroups: many(userGroups),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  userGroups: many(userGroups),
  serviceGroups: many(serviceGroups),
}));

export const userGroupsRelations = relations(userGroups, ({ one }) => ({
  user: one(users, { fields: [userGroups.userId], references: [users.id] }),
  group: one(groups, { fields: [userGroups.groupId], references: [groups.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  services: many(services),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  category: one(categories, { fields: [services.categoryId], references: [categories.id] }),
  serviceGroups: many(serviceGroups),
}));

export const serviceGroupsRelations = relations(serviceGroups, ({ one }) => ({
  service: one(services, { fields: [serviceGroups.serviceId], references: [services.id] }),
  group: one(groups, { fields: [serviceGroups.groupId], references: [groups.id] }),
}));
