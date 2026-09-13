/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { Context, Next } from 'hono';
import { getD1DB } from '../../../database/db';
import { findApiKeyByKey, incrementApiCalls, incrementDailyApiCalls, incrementAndGetApiRateWindowCount } from '../../../database/dao';
import type { Env } from '../../../index';

export const apiKeyAuth = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const db = getD1DB(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const currentWindow = Math.floor(now / 60) * 60;
  const configuredLimit = Number.parseInt(c.env.API_RATE_LIMIT_PER_MINUTE ?? '', 10);
  const rateLimit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 100;

  let apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    }
  }

  if (!apiKey) {
    return c.json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing API Key. Provide it via X-API-Key header or Authorization: Bearer <key>',
      }
    }, 401);
  }

  const cache = caches.default;
  const cacheKey = new Request(`https://apikey-cache.internal/${apiKey}`);
  const cached = await cache.match(cacheKey);

  let keyRecord;
  if (cached) {
    keyRecord = await cached.json();
  } else {
    keyRecord = await findApiKeyByKey(db, apiKey);

    if (!keyRecord) {
      return c.json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API Key',
        }
      }, 401);
    }

    const response = new Response(JSON.stringify(keyRecord), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, response));
  }

  if (!keyRecord.isActive) {
    return c.json({
      error: {
        code: 'FORBIDDEN',
        message: 'API Key is disabled',
      }
    }, 403);
  }

  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    return c.json({
      error: {
        code: 'FORBIDDEN',
        message: 'API Key has expired',
      }
    }, 403);
  }

  const currentCount = await incrementAndGetApiRateWindowCount(
    db,
    keyRecord.id,
    currentWindow,
  );

  if (currentCount > rateLimit) {
    const retryAfter = currentWindow + 60 - now;
    c.header('X-RateLimit-Limit', `${rateLimit}`);
    c.header('X-RateLimit-Remaining', '0');
    c.header('Retry-After', `${retryAfter > 0 ? retryAfter : 1}`);
    return c.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Max ${rateLimit} requests per minute`,
        },
      },
      429,
    );
  }

  c.executionCtx.waitUntil(Promise.all([incrementApiCalls(db), incrementDailyApiCalls(db)]));

  const remaining = Math.max(rateLimit - currentCount, 0);
  c.header('X-RateLimit-Limit', `${rateLimit}`);
  c.header('X-RateLimit-Remaining', `${remaining}`);

  c.set('apiKey', {
    id: keyRecord.id,
    rateLimit,
  });

  await next();
};
