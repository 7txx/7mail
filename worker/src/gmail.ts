/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import PostalMime from 'postal-mime';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { nanoid } from 'nanoid/non-secure';
import { InsertEmail, insertEmailSchema } from './database/schema';
import {
  findEmailByMessageIdAndTo,
  incrementDailyEmailsReceived,
  incrementEmailsReceived,
  insertEmail,
} from './database/dao';

export interface GmailEnv {
  GMAIL_ENABLED?: string;
  GMAIL_ADDRESS?: string;
  GMAIL_SYNC_ADDRESS?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
}

const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

export function isGmailEnabled(env: GmailEnv): boolean {
  return env.GMAIL_ENABLED === 'true';
}

export function isGmailApiEnabled(env: GmailEnv): boolean {
  return Boolean(
    isGmailEnabled(env) &&
      env.GMAIL_ADDRESS &&
      env.GMAIL_CLIENT_ID &&
      env.GMAIL_CLIENT_SECRET &&
      env.GMAIL_REFRESH_TOKEN,
  );
}

export function getGmailSyncAddress(env: GmailEnv, emailDomain?: string): string {
  if (env.GMAIL_SYNC_ADDRESS && env.GMAIL_SYNC_ADDRESS.trim()) {
    return env.GMAIL_SYNC_ADDRESS.trim().toLowerCase();
  }
  const firstDomain = (emailDomain || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)[0];
  return firstDomain ? `gmail-sync@${firstDomain}` : '';
}

export function isGmailDomain(domain: string): boolean {
  return GMAIL_DOMAINS.includes(domain.trim().toLowerCase());
}

export function isGmailAddress(address: string): boolean {
  const atIndex = address.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === address.length - 1) {
    return false;
  }
  return isGmailDomain(address.slice(atIndex + 1));
}

export function normalizeGmailAlias(address: string): string | null {
  const trimmed = address.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return null;
  }
  const local = trimmed.slice(0, atIndex).replace(/\./g, '');
  if (!local) {
    return null;
  }
  const domain = trimmed.slice(atIndex + 1);
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  return `${local}@${normalizedDomain}`;
}

export function generateGmailAlias(env: GmailEnv): string {
  const [baseLocal, baseDomain = 'gmail.com'] = (env.GMAIL_ADDRESS || '')
    .trim()
    .toLowerCase()
    .split('@');
  const cleanLocal = baseLocal.replace(/\./g, '').split('+')[0];

  const randomInt = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;
  const randomChars = (n: number) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < n; i++) {
      out += chars[randomInt(chars.length)];
    }
    return out;
  };

  const style = randomInt(3);
  const domain = style === 2 ? 'googlemail.com' : baseDomain;

  if (style === 1) {
    return `${cleanLocal}+${randomChars(8)}@${domain}`;
  }

  const count = 1 + randomInt(3);
  const positions = new Set<number>();
  let guard = 0;
  while (positions.size < count && guard++ < 20 && cleanLocal.length > positions.size + 1) {
    positions.add(1 + randomInt(cleanLocal.length - 1));
  }
  let local = '';
  for (let i = 0; i < cleanLocal.length; i++) {
    if (positions.has(i)) {
      local += '.';
    }
    local += cleanLocal[i];
  }
  return `${local}@${domain}`;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(env: GmailEnv): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID!,
      client_secret: env.GMAIL_CLIENT_SECRET!,
      refresh_token: env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

const lastSyncAt = new Map<string, number>();
const SYNC_DEBOUNCE_MS = 5_000;

export async function syncGmailForAlias(
  env: GmailEnv,
  db: DrizzleD1Database,
  alias: string,
): Promise<number> {
  const normalizedAlias = normalizeGmailAlias(alias);
  if (!normalizedAlias) {
    return 0;
  }

  const now = Date.now();
  if (now - (lastSyncAt.get(normalizedAlias) ?? 0) < SYNC_DEBOUNCE_MS) {
    return 0;
  }
  lastSyncAt.set(normalizedAlias, now);

  const token = await getAccessToken(env);

  const query = `in:inbox to:${normalizedAlias} newer_than:2d`;
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) {
    throw new Error(`Gmail list failed: ${listRes.status} ${await listRes.text()}`);
  }
  const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
  if (!listData.messages?.length) {
    return 0;
  }

  let inserted = 0;
  for (const item of listData.messages) {
    const rawRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=raw`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!rawRes.ok) {
      continue;
    }
    const rawData = (await rawRes.json()) as { raw?: string };
    if (!rawData.raw) {
      continue;
    }
    const mail = await new PostalMime().parse(base64UrlDecode(rawData.raw));
    if (!mail.messageId || !mail.from?.address) {
      continue;
    }

    const recipients = [
      ...(mail.to ?? []).map((a) => a.address),
      ...(mail.deliveredTo ? [mail.deliveredTo] : []),
    ];
    const matched = recipients.some((r) => normalizeGmailAlias(r ?? '') === normalizedAlias);
    if (!matched) {
      continue;
    }

    const nowDate = new Date();
    const existing = await findEmailByMessageIdAndTo(db, mail.messageId, normalizedAlias);
    if (existing) {
      continue;
    }

    const newEmail: InsertEmail = {
      id: nanoid(),
      messageFrom: mail.from?.address ?? '',
      messageTo: normalizedAlias,
      headers: mail.headers || [],
      from: mail.from,
      sender: mail.sender,
      replyTo: mail.replyTo,
      deliveredTo: mail.deliveredTo,
      returnPath: mail.returnPath,
      to: mail.to,
      cc: mail.cc,
      bcc: mail.bcc,
      subject: mail.subject,
      messageId: mail.messageId,
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      date: mail.date,
      html: mail.html,
      text: mail.text,
      createdAt: nowDate,
      updatedAt: nowDate,
    };
    const email = insertEmailSchema.parse(newEmail);
    await insertEmail(db, email);
    await incrementEmailsReceived(db);
    await incrementDailyEmailsReceived(db);
    inserted++;
  }

  return inserted;
}
