import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const products = sqliteTable("shop_products", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
});
export const settings = sqliteTable("shop_settings", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
});

export * from "./auth-schema";

export const orderIntegration = sqliteTable("shop_order_integration", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
});
export const orders = sqliteTable("shop_orders", {
  id: text("id").primaryKey(),
  requestHash: text("request_hash").notNull(),
  createdAt: text("created_at").notNull(),
  data: text("data").notNull(),
  status: text("status").notNull().default("new"),
  assignedTo: text("assigned_to").notNull().default(""),
  telegramDeliveredChats: text("telegram_delivered_chats").notNull().default("[]"),
  notification: text("notification").notNull().default("pending"),
  notificationUpdatedAt: text("notification_updated_at").notNull(),
  notificationError: text("notification_error").notNull().default(""),
  adminNote: text("admin_note").notNull().default(""),
  version: integer("version").notNull().default(0),
  paymentData: text("payment_data").notNull().default("{}"),
  emailNotification: text("email_notification").notNull().default("disabled"),
  emailUpdatedAt: text("email_updated_at").notNull().default(""),
  emailError: text("email_error").notNull().default(""),
  telegramAttempts: integer("telegram_attempts").notNull().default(0),
  emailAttempts: integer("email_attempts").notNull().default(0),
  telegramRetryAt: text("telegram_retry_at").notNull().default(""),
  emailRetryAt: text("email_retry_at").notNull().default(""),
}, t => [index("shop_orders_created_at_idx").on(t.createdAt, t.id)]);

export const orderGuards = sqliteTable("shop_order_guards", {
  key: text("key").primaryKey(), orderId: text("order_id").notNull(), blockedUntil: integer("blocked_until").notNull(),
});
export const orderRateLimits = sqliteTable("shop_order_rate_limits", {
  key: text("key").primaryKey(), windowStart: integer("window_start").notNull(), hits: integer("hits").notNull(),
});
export const orderHistory = sqliteTable("shop_order_history", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull(), at: text("at").notNull(),
  actor: text("actor").notNull(), action: text("action").notNull(),
}, t => [index("shop_order_history_order_idx").on(t.orderId, t.at)]);

// Explicit administrative membership; public registration never grants access.
export const adminMembers = sqliteTable("shop_admin_members", {
  userId: text("user_id").primaryKey(), role: text("role").notNull(), active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(), createdBy: text("created_by").notNull(), inviteState: text("invite_state").notNull().default("not_requested"),
});
export const adminEvents = sqliteTable("shop_admin_events", {
  id: text("id").primaryKey(), actorId: text("actor_id").notNull(), targetId: text("target_id").notNull(), action: text("action").notNull(), at: text("at").notNull(),
});

// Visit appointments are independent of the disabled commerce/order subsystem.
export const visitConfig = sqliteTable("visit_config", { id: text("id").primaryKey(), data: text("data").notNull() });
export const visits = sqliteTable("visit_requests", {
  id: text("id").primaryKey(), requestHash: text("request_hash").notNull(), createdAt: text("created_at").notNull(),
  name: text("name").notNull(), phone: text("phone").notNull(), preferredAt: text("preferred_at").notNull(),
  status: text("status").notNull().default("new"), managerId: text("manager_id").notNull().default(""), appointmentAt: text("appointment_at").notNull().default(""),
  version: integer("version").notNull().default(0), policyHash: text("policy_hash").notNull(), policyText: text("policy_text").notNull(),
  notification: text("notification").notNull().default("disabled"), attempts: integer("attempts").notNull().default(0), retryAt: integer("retry_at").notNull().default(0),
}, t => [index("visit_created_idx").on(t.createdAt, t.id)]);
export const visitEvents = sqliteTable("visit_events", { id: text("id").primaryKey(), visitId: text("visit_id").notNull(), actorId: text("actor_id").notNull(), action: text("action").notNull(), at: text("at").notNull() });
