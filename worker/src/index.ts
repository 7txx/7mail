/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import { cors } from 'hono/cors';
import { deleteEmails, findEmailById, getEmailsByMessageTo, insertEmail, deleteExpiredEmails, insertApiKey, getSiteStats, incrementEmailsReceived, incrementApiKeysCreated, incrementAddressesCreated, incrementDailyAddressesCreated, incrementDailyEmailsReceived, incrementDailyApiKeysCreated, getMailboxMetaByAddress, incrementAndGetApiRateWindowCount } from './database/dao';
import { getD1DB } from './database/db';
import { InsertEmail, insertEmailSchema } from './database/schema';
import { nanoid } from 'nanoid/non-secure';
import PostalMime from 'postal-mime';
import { EmailMessage } from 'cloudflare:email';
import { decrypt } from './utils';
import {
  generateGmailAlias,
  getGmailSyncAddress,
  isGmailAddress,
  isGmailApiEnabled,
  isGmailDomain,
  isGmailEnabled,
  normalizeGmailAlias,
  syncGmailForAlias,
} from './gmail';
import v1Api from './api/v1';
import { isOpenApiEnabled, requireOpenApi } from './openapi';
import {
  buildCloudflareMimeMessage,
  buildMailChannelsPayload,
  buildResendPayload,
  createMailboxToken,
  getBearerToken,
  getConfiguredSendChannel,
  isAllowedMailboxAddress,
  sendRequestSchema,
  verifyMailboxToken,
} from './sender';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  EMAIL_DOMAIN: string;
  COOKIES_SECRET: string;
  TURNSTILE_KEY: string;
  TURNSTILE_SECRET: string;
  PASSWORD?: string;
  RESEND_API_KEY?: string;
  MAILCHANNELS_API_KEY?: string;
  MAILBOX_TOKEN_SECRET?: string;
  SENDER_EMAIL?: string;
  SEND_RATE_LIMIT_PER_MINUTE?: string;
  SEND_IP_RATE_LIMIT_PER_MINUTE?: string;
  API_RATE_LIMIT_PER_MINUTE?: string;
  SHOW_AFF?: string;
  ENABLE_OPENAPI?: string;
  SEND_CHANNEL?: string;
  SEND_EMAIL?: SendEmail;
  GMAIL_ENABLED?: string;
  GMAIL_ADDRESS?: string;
  GMAIL_SYNC_ADDRESS?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/v1/*', cors());

const SITE_AUTH_COOKIE = '7mail_site_auth';

function isTurnstileEnabled(env: Env): boolean {
  return Boolean(env.TURNSTILE_KEY && env.TURNSTILE_SECRET);
}

function parseRateLimitPerMinute(env: Env): number {
  const parsed = Number.parseInt(env.API_RATE_LIMIT_PER_MINUTE ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 100;
  }
  return parsed;
}

function parsePositiveLimit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, 1000);
}

function getMailboxTokenTtlSeconds(): number {
  return 24 * 60 * 60;
}

function isSiteUnlocked(request: Request, env: Env): boolean {
  if (!env.PASSWORD) {
    return true;
  }

  const cookie = request.headers.get('cookie') ?? '';
  return cookie.split(';').some((part) => {
    const [key, value] = part.trim().split('=');
    return key === SITE_AUTH_COOKIE && value === '1';
  });
}

function shouldBypassSiteGate(pathname: string): boolean {
  if (pathname === '/' || pathname === '/index.html') {
    return true;
  }
  if (pathname.startsWith('/api/') || pathname === '/config') {
    return true;
  }
  if (pathname === '/auth/unlock' || pathname === '/auth/logout' || pathname === '/auth/status') {
    return true;
  }
  if (pathname.startsWith('/assets/')) {
    return true;
  }
  if (pathname === '/favicon.ico' || pathname.endsWith('.map')) {
    return true;
  }
  return false;
}

const turnstile = async (c, next) => {
  let body: any;
  try {
    const rawBody = await c.req.text();
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch (e) {
    console.error("请求体解析为JSON时出错:", e);
    return c.json({ message: '错误的请求：请求体无效或为空。' }, 400);
  }

  c.set('parsedBody', body);

  if (!isTurnstileEnabled(c.env)) {
    await next();
    return;
  }

  const token = body.token || c.req.header('cf-turnstile-token');
  const ip = c.req.header('CF-Connecting-IP');

  if (!token) {
    return c.json({ message: '缺少 turnstile token' }, 400);
  }

  const params = new URLSearchParams();
  params.append('secret', c.env.TURNSTILE_SECRET);
  params.append('response', token);
  if (ip) {
    params.append('remoteip', ip);
  }

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (!data.success) {
    console.error("Turnstile 验证失败:", data['error-codes']);
    return c.json({ message: 'token 无效' }, 400);
  }

  await next();
};

const api = app.basePath('/api');

api.post('/verify', turnstile, async (c) => {
  const body = c.get('parsedBody') as { domain?: string };
  const domain = body?.domain?.trim().toLowerCase();
  const gmailDomainAllowed = Boolean(domain && isGmailEnabled(c.env) && isGmailDomain(domain));
  if (
    !domain ||
    (!isAllowedMailboxAddress(`mailbox@${domain}`, c.env.EMAIL_DOMAIN) && !gmailDomainAllowed)
  ) {
    return c.json({
      code: 'INVALID_MAILBOX',
      message: 'Mailbox domain is not configured',
    }, 400);
  }

  const mailbox = gmailDomainAllowed
    ? generateGmailAlias(c.env)
    : `${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}@${domain}`;

  const db = getD1DB(c.env.DB);
  await incrementAddressesCreated(db);
  await incrementDailyAddressesCreated(db);

  const mailboxToken = c.env.MAILBOX_TOKEN_SECRET
    ? await createMailboxToken(
        mailbox,
        c.env.MAILBOX_TOKEN_SECRET,
        Date.now(),
        getMailboxTokenTtlSeconds(),
      )
    : undefined;

  return c.json({
    success: true,
    bypassed: !isTurnstileEnabled(c.env),
    mailbox,
    mailboxToken,
  });
});

api.post('/mailbox-token/refresh', async (c) => {
  if (!c.env.MAILBOX_TOKEN_SECRET) {
    return c.json({ code: 'SEND_UNAVAILABLE', message: 'Email sending is unavailable' }, 503);
  }

  const token = getBearerToken(c.req.header('Authorization'));
  const mailbox = token
    ? await verifyMailboxToken(token, c.env.MAILBOX_TOKEN_SECRET)
    : null;
  if (!mailbox || !isAllowedMailboxAddress(mailbox, c.env.EMAIL_DOMAIN)) {
    return c.json({ code: 'SEND_UNAUTHORIZED', message: 'Mailbox authorization is invalid or expired' }, 401);
  }

  return c.json({
    mailboxToken: await createMailboxToken(
      mailbox,
      c.env.MAILBOX_TOKEN_SECRET,
      Date.now(),
      getMailboxTokenTtlSeconds(),
    ),
  });
});

api.post('/send', async (c) => {
  const sendChannel = getConfiguredSendChannel(c.env);
  if (!sendChannel || !c.env.MAILBOX_TOKEN_SECRET || !c.env.SENDER_EMAIL) {
    return c.json({ code: 'SEND_UNAVAILABLE', message: 'Email sending is unavailable' }, 503);
  }

  const token = getBearerToken(c.req.header('Authorization'));
  const mailbox = token
    ? await verifyMailboxToken(token, c.env.MAILBOX_TOKEN_SECRET)
    : null;
  if (!mailbox || !isAllowedMailboxAddress(mailbox, c.env.EMAIL_DOMAIN)) {
    return c.json({ code: 'SEND_UNAUTHORIZED', message: 'Mailbox authorization is invalid or expired' }, 401);
  }

  let requestBody: unknown;
  try {
    requestBody = await c.req.json();
  } catch {
    return c.json({ code: 'INVALID_SEND_REQUEST', message: 'Invalid JSON request body' }, 400);
  }

  const parsedRequest = sendRequestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    return c.json({ code: 'INVALID_SEND_REQUEST', message: 'Invalid email fields' }, 400);
  }

  const db = getD1DB(c.env.DB);
  const windowStartEpochSec = Math.floor(Date.now() / 60_000) * 60;
  const mailboxLimit = parsePositiveLimit(c.env.SEND_RATE_LIMIT_PER_MINUTE, 3);
  const ipLimit = parsePositiveLimit(c.env.SEND_IP_RATE_LIMIT_PER_MINUTE, 10);
  const clientIp = c.req.header('CF-Connecting-IP') || 'unknown';
  const mailboxCount = await incrementAndGetApiRateWindowCount(
    db,
    `send-mailbox:${mailbox}`,
    windowStartEpochSec,
  );
  const ipCount = await incrementAndGetApiRateWindowCount(
    db,
    `send-ip:${clientIp}`,
    windowStartEpochSec,
  );

  c.header('X-RateLimit-Limit', `${mailboxLimit}`);
  c.header('X-RateLimit-Remaining', `${Math.max(mailboxLimit - mailboxCount, 0)}`);
  if (mailboxCount > mailboxLimit || ipCount > ipLimit) {
    c.header('Retry-After', '60');
    return c.json({ code: 'SEND_RATE_LIMITED', message: 'Email sending rate limit exceeded' }, 429);
  }

  const outgoingEmail = {
    ...parsedRequest.data,
    replyTo: mailbox,
  };

  try {
    if (sendChannel === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildResendPayload(outgoingEmail, c.env.SENDER_EMAIL)),
      });
      if (!response.ok) {
        console.error('Resend send failed:', response.status, await response.text());
        return c.json({ code: 'SEND_PROVIDER_ERROR', message: 'Email provider rejected the message' }, 502);
      }
    } else if (sendChannel === 'mailchannels') {
      const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': c.env.MAILCHANNELS_API_KEY!,
        },
        body: JSON.stringify(buildMailChannelsPayload(outgoingEmail, c.env.SENDER_EMAIL)),
      });
      if (!response.ok) {
        console.error('MailChannels send failed:', response.status, await response.text());
        return c.json({ code: 'SEND_PROVIDER_ERROR', message: 'Email provider rejected the message' }, 502);
      }
    } else {
      const emailMessage = new EmailMessage(
        c.env.SENDER_EMAIL,
        outgoingEmail.receiverEmail,
        buildCloudflareMimeMessage(outgoingEmail, c.env.SENDER_EMAIL),
      );
      await c.env.SEND_EMAIL!.send(emailMessage);
    }

    return c.json({ success: true, channel: sendChannel });
  } catch (error) {
    console.error('Email send failed:', error);
    return c.json({ code: 'SEND_PROVIDER_ERROR', message: 'Email provider is unavailable' }, 502);
  }
});

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '7mail_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

api.post('/api-keys', requireOpenApi, turnstile, async (c) => {
  const db = getD1DB(c.env.DB);
  const body = c.get('parsedBody') as { name?: string };

  const now = new Date();
  const apiKey = generateApiKey();
  const keyPrefix = apiKey.substring(0, 12) + '...';

  const newApiKey = {
    id: nanoid(),
    key: apiKey,
    keyPrefix: keyPrefix,
    name: body?.name || null,
    rateLimit: 100,
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await insertApiKey(db, newApiKey);
    await incrementApiKeysCreated(db);
    await incrementDailyApiKeysCreated(db);
    return c.json({
      data: {
        id: newApiKey.id,
        key: apiKey,
        keyPrefix: keyPrefix,
        name: newApiKey.name,
        createdAt: now.toISOString(),
      },
      message: 'API Key created successfully. Please save it now, it will not be shown again!'
    }, 201);
  } catch (e: any) {
    console.error('Create API Key error:', e);
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create API Key',
      }
    }, 500);
  }
});

api.post('/emails', async (c) => {
  const db = getD1DB(c.env.DB);
  let body: any;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ message: '错误的请求：请求体无效或为空。' }, 400);
  }
  const address = body?.address;
  const limit = Number.parseInt(body?.limit ?? '', 10);

  if (!address) {
    return c.json({ message: 'address is required' }, 400);
  }
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 50;

  let queryAddress = address as string;
  if (isGmailEnabled(c.env) && isGmailAddress(queryAddress)) {
    if (isGmailApiEnabled(c.env)) {
      try {
        await syncGmailForAlias(c.env, db, queryAddress);
      } catch (e) {
        console.error('Gmail sync failed:', e);
      }
    }
    queryAddress = normalizeGmailAlias(queryAddress) ?? queryAddress;
  }

  const emails = await getEmailsByMessageTo(db, queryAddress, safeLimit);
  return c.json(emails);
});

api.post('/emails/meta', async (c) => {
  const db = getD1DB(c.env.DB);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: '错误的请求：请求体无效或为空。' }, 400);
  }

  const address = body?.address;
  if (!address) {
    return c.json({ message: 'address is required' }, 400);
  }

  let metaQueryAddress = address as string;
  if (isGmailEnabled(c.env) && isGmailAddress(metaQueryAddress)) {
    if (isGmailApiEnabled(c.env)) {
      try {
        await syncGmailForAlias(c.env, db, metaQueryAddress);
      } catch (e) {
        console.error('Gmail sync failed:', e);
      }
    }
    metaQueryAddress = normalizeGmailAlias(metaQueryAddress) ?? metaQueryAddress;
  }

  const meta = await getMailboxMetaByAddress(db, metaQueryAddress);
  return c.json(meta);
});

api.get('/emails/:id', async (c) => {
  const db = getD1DB(c.env.DB);
  const { id } = c.req.param();
  const email = await findEmailById(db, id);
  if (!email) {
    return c.json({ message: 'Email not found'}, 404);
  }
  return c.json(email);
});

api.post('/delete-emails', async (c) => {
    const db = getD1DB(c.env.DB);
    const body = await c.req.json();
    const ids = body?.ids;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return c.json({ message: 'ids are required' }, 400);
    }
    const result = await deleteEmails(db, ids as string[]);
    return c.json(result);
});

api.post('/login', async (c) => {
  const body = await c.req.json();
  const password = body?.password;

  if (!password) {
    return c.json({ message: 'Password is required' }, 400);
  }

  try {
    const address = decrypt(password, c.env.COOKIES_SECRET);

    if (!address || typeof address !== 'string' || !address.includes('@')) {
        console.error("解密后的地址格式无效:", address);
        return c.json({ message: 'Invalid password' }, 400);
    }

    return c.json({ address });
  } catch (e) {
    console.error("Login error:", e);
    return c.json({ message: 'Invalid password' }, 400);
  }
});

app.get('/config', (c) => {
  const emailDomain = c.env.EMAIL_DOMAIN ? c.env.EMAIL_DOMAIN.split(',').map(d => d.trim()) : [];
  const turnstileEnabled = isTurnstileEnabled(c.env);
  const openApiEnabled = isOpenApiEnabled(c.env);
  const gmailSyncAddress = isGmailEnabled(c.env)
    ? getGmailSyncAddress(c.env, c.env.EMAIL_DOMAIN)
    : '';
  const gmailEnabled = Boolean(gmailSyncAddress) || isGmailApiEnabled(c.env);

  const frontendDomains = gmailEnabled
    ? ['gmail.com', ...emailDomain.filter((d) => d !== 'gmail.com')]
    : emailDomain;

  const sendChannel = getConfiguredSendChannel(c.env);
  const enabledSenders = sendChannel ? [sendChannel] : [];

  return c.json({
    emailDomain: frontendDomains,
    turnstileKey: c.env.TURNSTILE_KEY,
    turnstileEnabled,
    cookiesSecret: c.env.COOKIES_SECRET,
    sitePasswordEnabled: Boolean(c.env.PASSWORD),
    apiRateLimitPerMinute: parseRateLimitPerMinute(c.env),
    openApiEnabled,
    showAff: c.env.SHOW_AFF === 'true',
    enabledSenders,
    sendChannel: sendChannel || '',
    senderEmail: sendChannel ? c.env.SENDER_EMAIL : '',
    gmailEnabled,
    gmailSyncAddress,
  });
});

app.get('/api/send-debug', (c) => {
  const hasMailboxTokenSecret = Boolean(c.env.MAILBOX_TOKEN_SECRET);
  const hasSenderEmail = Boolean(c.env.SENDER_EMAIL);
  const hasSendChannel = Boolean(c.env.SEND_CHANNEL);
  const hasResendApiKey = Boolean(c.env.RESEND_API_KEY);
  const hasMailchannelsApiKey = Boolean(c.env.MAILCHANNELS_API_KEY);
  const hasSendEmail = Boolean(c.env.SEND_EMAIL);
  const sendChannel = getConfiguredSendChannel(c.env);
  const sendChannelValue = c.env.SEND_CHANNEL || '(empty)';

  return c.json({
    hasMailboxTokenSecret,
    hasSenderEmail,
    hasSendChannel,
    sendChannelValue,
    hasResendApiKey,
    hasMailchannelsApiKey,
    hasSendEmail,
    getConfiguredSendChannelResult: sendChannel || 'null',
  });
});

api.get('/gmail/forward-inbox', async (c) => {
  if (!isGmailEnabled(c.env)) {
    return c.json({ message: 'Gmail alias feature is disabled' }, 404);
  }
  const syncAddress = getGmailSyncAddress(c.env, c.env.EMAIL_DOMAIN);
  const db = getD1DB(c.env.DB);
  const emails = await getEmailsByMessageTo(db, syncAddress, 10);
  return c.json({
    syncAddress,
    emails: emails.map((item) => ({
      id: item.id,
      from: item.from,
      subject: item.subject,
      text: item.text,
      createdAt: item.createdAt,
    })),
  });
});

api.get('/stats', async (c) => {
  const cache = caches.default;
  const cacheKey = new Request(c.req.url, c.req.raw);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const db = getD1DB(c.env.DB);
  const stats = await getSiteStats(db);

  const totals = {
    totalAddressesCreated: stats?.totalAddressesCreated ?? 0,
    totalEmailsReceived: stats?.totalEmailsReceived ?? 0,
    totalApiCalls: stats?.totalApiCalls ?? 0,
    totalApiKeysCreated: stats?.totalApiKeysCreated ?? 0,
  };

  const response = c.json({
    totals,
  });

  response.headers.set('Cache-Control', 'public, max-age=300');
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
});

app.post('/auth/unlock', async (c) => {
  if (!c.env.PASSWORD) {
    return c.json({ success: true, bypassed: true });
  }

  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: 'Invalid request body' }, 400);
  }

  if (body.password !== c.env.PASSWORD) {
    return c.json({ message: 'Invalid password' }, 401);
  }

  c.header(
    'Set-Cookie',
    `${SITE_AUTH_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400; Secure`,
  );

  return c.json({ success: true });
});

app.get('/auth/status', (c) => {
  const unlocked = isSiteUnlocked(c.req.raw, c.env);
  return c.json({
    unlocked,
    sitePasswordEnabled: Boolean(c.env.PASSWORD),
  });
});

app.post('/auth/logout', (c) => {
  c.header(
    'Set-Cookie',
    `${SITE_AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`,
  );
  return c.json({ success: true });
});

app.route('/api/v1', v1Api);

app.get('/*', serveStatic({ root: './' }))
app.get('/assets/*', serveStatic({ root: './' }))

export default {
  async email(message: ForwardableEmail, env: Env, ctx: ExecutionContext) {
    try {
      const db = getD1DB(env.DB);
      const raw = await new Response(message.raw).text();
      const mail = await new PostalMime().parse(raw);
      const now = new Date();

      let messageTo = message.to;
      if (isGmailEnabled(env)) {
        const candidates = [
          mail.deliveredTo,
          ...(mail.to ?? []).map((a) => a.address),
          ...(mail.cc ?? []).map((a) => a.address),
        ].filter((a): a is string => Boolean(a) && isGmailAddress(a));
        const gmailRecipient = candidates[0];
        if (gmailRecipient) {
          messageTo = normalizeGmailAlias(gmailRecipient) ?? messageTo;
        }
      }

      const newEmail: InsertEmail = {
        id: nanoid(),
        messageFrom: message.from,
        messageTo,
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
        createdAt: now,
        updatedAt: now,
      };

      const email = insertEmailSchema.parse(newEmail);
      await insertEmail(db, email);
      await incrementEmailsReceived(db);
      await incrementDailyEmailsReceived(db);
    } catch (e: any) {
      console.error('处理邮件失败:', e);
      message.setReject(`邮件处理失败: ${e.message}`);
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!shouldBypassSiteGate(url.pathname) && !isSiteUnlocked(request, env)) {
      return new Response(JSON.stringify({ message: 'Site is locked' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    if (url.pathname.startsWith('/api/') || url.pathname === '/config' || url.pathname.startsWith('/auth/')) {
      return app.fetch(request, env, ctx);
    }

    const response = await env.ASSETS.fetch(request);

    if (response.status === 404) {
      const indexRequest = new Request(new URL('/', request.url).toString(), request);
      return env.ASSETS.fetch(indexRequest);
    }

    return response;
  },

  async scheduled(event, env, ctx) {
      const db = getD1DB(env.DB);
      const oneDayAgo = new Date(Date.now() - 1000 * 60 * 60 * 24);
      await deleteExpiredEmails(db, oneDayAgo);
      console.log(`已清理 ${oneDayAgo.toISOString()} 之前的过期邮件`);
  },
};
