/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";

export function getD1DB(db: D1Database): DrizzleD1Database {
  return drizzle(db);
}
