// Gmail 无限别名支持模块
//
// 原理:Gmail 忽略用户名中的点号(a.b.c@gmail.com == abc@gmail.com)、
// 忽略加号后的内容(abc+tag@gmail.com),googlemail.com 与 gmail.com 是同一邮箱。
// 发往这些别名的邮件全部投递到同一个真实 Gmail 账号(母账号),
// 通过 Gmail API 用 refresh token 拉取,按别名解析后写入 D1,前端零感知。
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

// Gmail 系域名
const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

// 判断 Gmail 别名功能是否启用(总开关)
// 转发模式只需 GMAIL_ENABLED=true;API 轮询模式还需凭证齐全
export function isGmailEnabled(env: GmailEnv): boolean {
  return env.GMAIL_ENABLED === 'true';
}

// 判断 Gmail API 轮询模式是否可用(总开关 + OAuth 凭证齐全)
export function isGmailApiEnabled(env: GmailEnv): boolean {
  return Boolean(
    isGmailEnabled(env) &&
      env.GMAIL_ADDRESS &&
      env.GMAIL_CLIENT_ID &&
      env.GMAIL_CLIENT_SECRET &&
      env.GMAIL_REFRESH_TOKEN,
  );
}

// 计算转发模式的收信地址(Gmail 自动转发到这个地址,再经邮件路由进 Worker)
// 优先级:GMAIL_SYNC_ADDRESS 环境变量 > EMAIL_DOMAIN 的第一个域名拼接 gmail-sync@
// 没有可用收信域名时返回空串(此时 Gmail 转发模式不可用)
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

// 判断域名是否为 Gmail 系域名
export function isGmailDomain(domain: string): boolean {
  return GMAIL_DOMAINS.includes(domain.trim().toLowerCase());
}

// 判断地址是否为 Gmail 系地址
export function isGmailAddress(address: string): boolean {
  const atIndex = address.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === address.length - 1) {
    return false;
  }
  return isGmailDomain(address.slice(atIndex + 1));
}

// 规范化 Gmail 地址用于匹配:
// 小写、去掉用户名中的点、统一 googlemail.com 为 gmail.com(保留 +tag)
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

// 生成一个随机 Gmail 别名(基于母账号)
// 三种形态:加点 / 加号+随机tag / googlemail.com 变体
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

  // 加号别名:abc+随机tag@gmail.com
  if (style === 1) {
    return `${cleanLocal}+${randomChars(8)}@${domain}`;
  }

  // 点别名:在用户名中随机插入 1~3 个点(不能在开头/结尾)
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

// ==================== Gmail API 访问 ====================

// access token 内存缓存(Workers 实例生命周期内复用,避免每次拉信都刷新 token)
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

// Gmail API 的 raw 格式是 base64url 编码的完整 RFC822 原文
function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

// ==================== 按别名同步 ====================

// 同一个别名的同步加个内存级防抖,避免前端高频轮询时反复请求 Gmail API
const lastSyncAt = new Map<string, number>();
const SYNC_DEBOUNCE_MS = 5_000;

/**
 * 从 Gmail 拉取发给指定别名的邮件并写入数据库。
 * 由 /api/emails 在查询 gmail 系地址时触发(API 轮询模式),
 * 邮件 messageTo 存为规范化别名,与转发模式口径一致。
 * @returns 本次新入库的邮件数
 */
export async function syncGmailForAlias(
  env: GmailEnv,
  db: DrizzleD1Database,
  alias: string,
): Promise<number> {
  const normalizedAlias = normalizeGmailAlias(alias);
  if (!normalizedAlias) {
    return 0;
  }

  // 防抖:5 秒内重复查询直接跳过
  const now = Date.now();
  if (now - (lastSyncAt.get(normalizedAlias) ?? 0) < SYNC_DEBOUNCE_MS) {
    return 0;
  }
  lastSyncAt.set(normalizedAlias, now);

  const token = await getAccessToken(env);

  // 用别名搜索最近 2 天的收件(Gmail 搜索会自动忽略点号差异)
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
    // 拉取原始邮件,统一用 postal-mime 解析(与 Cloudflare 邮件路由入库路径一致)
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

    // 校验收件人确实是这个别名(Gmail 搜索可能宽匹配到母账号/其他变体)
    const recipients = [
      ...(mail.to ?? []).map((a) => a.address),
      ...(mail.deliveredTo ? [mail.deliveredTo] : []),
    ];
    const matched = recipients.some((r) => normalizeGmailAlias(r ?? '') === normalizedAlias);
    if (!matched) {
      continue;
    }

    const nowDate = new Date();
    // 去重:messageId + 规范化别名相同则已同步过(与转发模式口径一致)
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
