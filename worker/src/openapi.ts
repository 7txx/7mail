/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import type { Context, Next } from "hono";

interface OpenApiEnv {
  ENABLE_OPENAPI?: string;
}

export function isOpenApiEnabled(env: OpenApiEnv): boolean {
  return env.ENABLE_OPENAPI?.trim().toLowerCase() === "true";
}

export function createOpenApiDisabledResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "OPENAPI_DISABLED",
        message:
          "OpenAPI access is disabled by the site administrator. Please self-host 7Mail if you need API access.",
      },
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

export async function requireOpenApi(
  c: Context<{ Bindings: OpenApiEnv }>,
  next: Next,
) {
  if (!isOpenApiEnabled(c.env)) {
    return createOpenApiDisabledResponse();
  }

  await next();
}
