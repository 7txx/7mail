/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import type { Email } from "../database_types";

const API_BASE_URL = "/api";

export async function getEmails(
  address: string,
  limit: number = 50,
): Promise<Email[]> {
  const response = await fetch(`${API_BASE_URL}/emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, limit }),
  });
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
}

export interface MailboxMeta {
  count: number;
  latestEmailCreatedAt: string | null;
}

export async function getMailboxMeta(address: string): Promise<MailboxMeta> {
  const response = await fetch(`${API_BASE_URL}/emails/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch mailbox meta");
  }
  return response.json();
}

export interface MailboxAuthorizationResponse {
  success: boolean;
  bypassed?: boolean;
  mailbox: string;
  mailboxToken?: string;
}

export async function verifyTurnstile(
  domain: string,
  token?: string,
): Promise<MailboxAuthorizationResponse> {
  const response = await fetch(`${API_BASE_URL}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token ? { token, domain } : { domain }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Turnstile verification failed");
  }
  return response.json();
}

export async function deleteEmails(ids: string[]): Promise<{ count: number }> {
  const response = await fetch(`${API_BASE_URL}/delete-emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    throw new Error("Failed to delete emails");
  }
  return response.json();
}

export async function loginByPassword(password: string): Promise<{
  address: string;
  mailboxToken?: string;
}> {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Login failed");
  }
  return response.json();
}

export async function refreshMailboxToken(
  mailboxToken: string,
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/mailbox-token/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mailboxToken}` },
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.message || "Failed to refresh mailbox authorization",
    );
  }
  const data = (await response.json()) as { mailboxToken: string };
  return data.mailboxToken;
}

export interface StatsSnapshot {
  totalAddressesCreated: number;
  totalEmailsReceived: number;
  totalApiCalls: number;
  totalApiKeysCreated: number;
}

export interface SiteStats {
  totals: StatsSnapshot;
}

export async function getSiteStats(): Promise<SiteStats> {
  const response = await fetch(`${API_BASE_URL}/stats`);
  if (!response.ok) {
    throw new Error("Failed to fetch site stats");
  }
  return response.json();
}

export interface UnlockStatusResponse {
  unlocked: boolean;
  sitePasswordEnabled: boolean;
}

export async function getUnlockStatus(): Promise<UnlockStatusResponse> {
  const response = await fetch("/auth/status");
  if (!response.ok) {
    throw new Error("Failed to fetch unlock status");
  }
  return response.json();
}

export async function unlockSite(
  password: string,
): Promise<{ success: boolean }> {
  const response = await fetch("/auth/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Invalid password");
  }

  return response.json();
}
