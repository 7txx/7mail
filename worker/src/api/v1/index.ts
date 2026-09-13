/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../../index';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import mailboxesRouter from './routes/mailboxes';
import { requireOpenApi } from '../../openapi';

const v1 = new Hono<{ Bindings: Env }>();

v1.use('/*', cors());

v1.use('/*', requireOpenApi);

v1.use('/*', apiKeyAuth);

v1.route('/mailboxes', mailboxesRouter);

export default v1;
