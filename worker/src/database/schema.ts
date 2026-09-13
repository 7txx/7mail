/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { integer, sqliteTable, text, index, primaryKey } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import * as z from "zod";

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  name: text("name"),
  rateLimit: integer("rate_limit").default(100),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys);
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

export const mailboxes = sqliteTable("mailboxes", {
  id: text("id").primaryKey(),
  address: text("address").notNull().unique(),
  domain: text("domain").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  apiKeyId: text("api_key_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const insertMailboxSchema = createInsertSchema(mailboxes);
export type InsertMailbox = z.infer<typeof insertMailboxSchema>;
export type Mailbox = typeof mailboxes.$inferSelect;

export type Header = Record<string, string>;

export type Address = {
  address: string;
  name: string;
};

export type Email = typeof emails.$inferSelect;

export const emails = sqliteTable("emails", {
  id: text("id").primaryKey(),
  messageFrom: text("message_from").notNull(),
  messageTo: text("message_to").notNull(),
  headers: text("headers", { mode: "json" }).$type<Header[]>().notNull(),
  from: text("from", { mode: "json" }).$type<Address>().notNull(),
  sender: text("sender", { mode: "json" }).$type<Address>(),
  replyTo: text("reply_to", { mode: "json" }).$type<Address[]>(),
  deliveredTo: text("delivered_to"),
  returnPath: text("return_path"),
  to: text("to", { mode: "json" }).$type<Address[]>(),
  cc: text("cc", { mode: "json" }).$type<Address[]>(),
  bcc: text("bcc", { mode: "json" }).$type<Address[]>(),
  subject: text("subject"),
  messageId: text("message_id").notNull(),
  inReplyTo: text("in_reply_to"),
  references: text("references"),
  date: text("date"),
  html: text("html"),
  text: text("text"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  messageToCreatedAtIdx: index("idx_emails_message_to_created_at").on(
    table.messageTo,
    table.createdAt,
  ),
}));

const AddressSchema = z.object({
  address: z.string(),
  name: z.string(),
});

export const insertEmailSchema = createInsertSchema(emails, {
  headers: z.array(z.record(z.string())),
  from: AddressSchema,
  sender: AddressSchema.optional(),
  replyTo: z.array(AddressSchema).optional(),
  to: z.array(AddressSchema).optional(),
  cc: z.array(AddressSchema).optional(),
  bcc: z.array(AddressSchema).optional(),
});

export type InsertEmail = z.infer<typeof insertEmailSchema>;

export const siteStats = sqliteTable("site_stats", {
  id: text("id").primaryKey(),
  totalAddressesCreated: integer("total_addresses_created").default(0).notNull(),
  totalEmailsReceived: integer("total_emails_received").default(0).notNull(),
  totalApiCalls: integer("total_api_calls").default(0).notNull(),
  totalApiKeysCreated: integer("total_api_keys_created").default(0).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type SiteStats = typeof siteStats.$inferSelect;

export const dailyStats = sqliteTable("daily_stats", {
  date: text("date").primaryKey(),
  addressesCreated: integer("addresses_created").default(0).notNull(),
  emailsReceived: integer("emails_received").default(0).notNull(),
  apiCalls: integer("api_calls").default(0).notNull(),
  apiKeysCreated: integer("api_keys_created").default(0).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type DailyStats = typeof dailyStats.$inferSelect;

export const apiRateLimits = sqliteTable(
  "api_rate_limits",
  {
    apiKeyId: text("api_key_id").notNull(),
    windowStartEpochSec: integer("window_start_epoch_sec").notNull(),
    requestCount: integer("request_count").default(0).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.apiKeyId, table.windowStartEpochSec],
    }),
    windowIdx: index("idx_api_rate_limits_window").on(
      table.windowStartEpochSec,
    ),
  }),
);

export type ApiRateLimitWindow = typeof apiRateLimits.$inferSelect;
