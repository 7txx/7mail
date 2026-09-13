<div align="center">
  <h1>🚀 7Mail - 临时邮箱系统</h1>
  <p>
    <a href="https://www.ao-s.cn" target="_blank">官方网站</a> ·
    <a href="#-部署教程">部署教程</a> ·
    <a href="#-功能特性">功能特性</a> ·
    <a href="#-常见问题">常见问题</a>
  </p>
  <p>基于 Cloudflare 全家桶搭建的开源临时邮箱系统，手把手教你拥有自己的邮箱</p>
</div>

> 👨‍🌾 这个项目是基于 vmail 二开的临时邮箱系统，主打一个简单实用，跟着教程走，小白也能搭出自己的邮箱网站。
>
> 更多技术教程和干货，欢迎来我的博客逛逛：[www.ao-s.cn](https://www.ao-s.cn)

---

## ✨ 功能特性

- 🎯 **隐私友好** - 不用注册，用完即焚，保护你的真实邮箱
- ⏰ **自定义有效期** - 支持 1小时/6小时/24小时/7天，想用多久选多久
- 🔔 **桌面通知** - 新邮件来了第一时间提醒，不用一直刷页面
- 📝 **邮箱备注** - 给每个邮箱加个备注，再也不忘记是注册啥用的
- ✈️ **支持收发邮件** - 不仅能收，还能匿名发邮件
- 🔐 **密码找回** - 保存邮箱密码，随时找回历史邮箱
- 🌐 **多域名支持** - 一个系统，多个域名后缀随便选
- � **Gmail 无限别名** - 一个 Gmail 账号变出无限个 @gmail.com 地址（加点、加标签），专用 Gmail 自动转发即可收信
- �🔌 **开放 API** - 提供 RESTful API，想怎么玩就怎么玩
- 🚀 **零成本部署** - 纯 Cloudflare 方案，不用买服务器，域名就行

---

## 🎯 部署前准备

在开始之前，你需要准备这些东西：

| 材料 | 说明 | 是否必需 |
|------|------|--------|
| Cloudflare 账号 | 免费注册就行 | ✅ |
| 一个域名 | 必须托管在 Cloudflare 上（Cloudflare 送的 workers.dev 域名**不能收邮件**） | ✅ |
| Node.js 环境 | 本地装一下，版本 >= 22 | ⚠️ 本地部署才需要 |
| 双手和脑子 | 跟着教程一步步来 | ✅ |

> 💡 **新手建议**：如果你是纯小白，推荐直接看下面的「GitHub Action 自动部署」，不用装本地环境，点几下就好。

---

## 🚀 部署教程

### 方式一：GitHub Action 自动部署（推荐新手）

这个方法最简单，不用在你电脑上装乱七八糟的东西，有手就行。

#### 第一步：Fork 项目

1.  点右上角的 **Fork** 按钮，把项目复制到你自己的 GitHub 账号下
2.  等 Fork 完成后，进入你自己的项目仓库

#### 第二步：准备 Cloudflare 信息

你需要从 Cloudflare 拿到这几样东西：

1.  **Cloudflare API Token**
    - 去 Cloudflare 头像 → My Profile → API Tokens → Create Token
    - 选「Edit Cloudflare Workers」模板就行
    - 权限选 Workers Routes、D1、Account Settings、User Details
    - 建好后把 token 复制下来，只显示一次！

2.  **Account ID**
    - 打开 Cloudflare 首页，右边就能看到 Account ID

3.  **D1 数据库**
    - 去 Workers & Pages → D1 → Create database
    - 名字随便起，比如 `7mail`
    - 建好后复制 Database ID
    - 数据库表不用手动建，部署工作流会**自动执行迁移**

4.  **域名**
    - 确保你的域名（或其子域名）已经托管在 Cloudflare 上了

#### 第三步：配置 GitHub Secrets

在你 Fork 的项目里：

1.  点 **Settings** → 左边 **Secrets and variables** → **Actions**
2.  点 **New repository secret**，一个个添加下面这些：

| Secret 名称 | 填什么 |
|-------------|--------|
| `CF_API_TOKEN` | 你刚才复制的 Cloudflare API Token |
| `CF_ACCOUNT_ID` | 你的 Cloudflare Account ID |
| `D1_DATABASE_NAME` | D1 数据库名字，比如 `7mail` |
| `D1_DATABASE_ID` | D1 数据库 ID |
| `EMAIL_DOMAIN` | 你的邮箱域名，比如 `example.com` |
| `COOKIES_SECRET` | 随便写一串随机字符，越乱越安全 |

其他可选的（发邮件、Gmail 别名、站点密码等）后面再配，先把这几个必填的加上。

#### 第四步：触发部署

1.  点顶部的 **Actions** 标签
2.  左边选 **Deploy to Cloudflare**
3.  点右边的 **Run workflow** → 选 main 分支 → 点 Run workflow
4.  工作流会自动完成：安装依赖 → 测试 → 类型检查 → 构建 → 数据库迁移 → 部署
5.  等几分钟，绿灯亮了就说明部署成功了！

#### 第五步：绑定自定义域名

Worker 刚部署好时只有一个 workers.dev 地址，而它不能收邮件，所以要把你的域名绑上去：

1.  打开 Cloudflare → **Workers & Pages** → 点名为 `7mail` 的 Worker
2.  进 **Settings** → **Domains & Routes** → **Add** → **Custom Domain**
3.  填一个子域名，比如 `mail.example.com`（也可以直接用根域名），按提示添加
4.  等 DNS 记录生效（通常 1~2 分钟），浏览器访问 `https://mail.example.com` 能看到网站即成功

#### 第六步：配置邮件路由（不配收不到邮件！）

1.  打开 Cloudflare → 选你的域名 → **Email** → **Email Routing**
2.  如果第一次用，先点「Get started」开通 Email Routing
3.  去 **Routing rules** 选项卡，找到 **Catch-all address**（兜底规则），点 **Edit**
4.  **Action** 选 `Send to a Worker`，**Destination** 选刚部署的 `7mail`
5.  保存，搞定！

现在试试发一封邮件到 `随便什么@你的域名.com`，等个十几秒看看能不能收到。

> 想用 Gmail 无限别名（@gmail.com 地址）？继续看下面的可选章节。

---

### 方式二：Gmail 无限别名（可选，推荐）

开启后，系统用一个**专用 Gmail 账号**作为母账号，利用 Gmail「忽略用户名中的点、忽略 + 后面内容」的规则，让一个 Gmail 变出无限个邮箱地址（如 `a.b.c@gmail.com`、`abc+xyz@gmail.com`、`abc@googlemail.com`）。用户在首页选择 `@gmail.com` 后缀创建的地址，收到的邮件都会进这个母账号，再通过 Gmail 自动转发实时进入 7Mail。

> ⚠️ 注意：
> - 请**专门注册一个 Gmail** 来做这件事，不要用私人账号（所有别名邮件都会进它）
> - 只能**收信**，不能用别名发信（Gmail 域名的发信按钮会自动隐藏）
> - 转发模式必须有一个能收邮件的自定义域名（即第五步绑的那个），workers.dev 免费域名用不了

配置步骤：

1.  在 GitHub 加两个 Secret，然后重新跑一次 **Deploy to Cloudflare**：

    | Secret 名称 | 填什么 |
    |-------------|--------|
    | `GMAIL_ENABLED` | `true` |
    | `GMAIL_ADDRESS` | 你的专用母账号，比如 `yourname@gmail.com` |

2.  部署完成后，浏览器访问（把域名换成你的）：

    ```text
    https://mail.example.com/api/gmail/forward-inbox
    ```

    返回 JSON 里的 `syncAddress` 就是系统的收信地址，默认是 `gmail-sync@你的EMAIL_DOMAIN`。

3.  登录专用 Gmail → **设置** → **转发和 POP/IMAP** → **添加转发地址**，填上一步的 `gmail-sync@...` 地址并发送确认。

4.  Gmail 会把一封确认邮件发到该地址。**等 10~30 秒后刷新第 2 步的那个网址**，在返回的邮件列表里找到 Google 的确认邮件，打开邮件正文中的确认链接（或复制确认码回 Gmail 页面填写）。

5.  在 Gmail 设置里选择「**将收到的邮件转发给 gmail-sync@...**」并保存。

6.  回到 7Mail 首页，域名下拉选 `@gmail.com`，创建一个别名邮箱，用另一个邮箱给这个别名发封测试邮件验证即可。

> `GMAIL_SYNC_ADDRESS` 一般留空自动生成即可；`GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN` 是 API 轮询模式用的，需要 Google 审核且受限 scope 的 token 7 天过期，**不推荐使用**，别配。

---

### 方式三：本地手动部署（适合想折腾的）

如果你想在本地改代码再部署，用这个方法。

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/7mail.git
cd 7mail

# 2. 装依赖（Node.js >= 22）
pnpm install
# 没有 pnpm？先装：npm install -g pnpm

# 3. 配置环境变量
cp .env.example .env
# 然后编辑 .env 文件，填你的 D1、域名等配置

# 4. 构建
pnpm run build

# 5. 登录 Cloudflare
pnpm exec wrangler login

# 6. 初始化数据库（第一次部署要跑，把 7mail 换成你的 D1 库名）
pnpm exec wrangler d1 migrations apply 7mail --remote

# 7. 部署
pnpm run deploy
```

部署完了别忘了「绑定自定义域名」和「配置邮件路由」，参考方式一的第五、六步。

---

## ⚙️ 环境变量说明

### 必填项（必须配置，不配置用不了）

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `D1_DATABASE_NAME` | D1 数据库名称 | `7mail` |
| `D1_DATABASE_ID` | D1 数据库 ID | 一大串字符 |
| `EMAIL_DOMAIN` | 邮箱域名，多个用逗号分隔 | `example.com,mail.xxx.com` |
| `COOKIES_SECRET` | Cookie 加密密钥，随便填随机字符串 | `随便写一串随机字符` |

### 可选项（按需配置，不配置也能用）

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `TURNSTILE_KEY` | Cloudflare Turnstile 人机验证站点密钥 | 空（关闭验证） |
| `TURNSTILE_SECRET` | Turnstile 密钥 | 空 |
| `PASSWORD` | 站点访问密码，设置后全站要密码才能进 | 空（公开访问） |
| `API_RATE_LIMIT_PER_MINUTE` | API 每分钟调用次数限制 | `100` |
| `SHOW_AFF` | 是否显示推广链接 | `false` |
| `ENABLE_OPENAPI` | 是否开放 API 功能 | `false` |

### Gmail 无限别名（可选）

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `GMAIL_ENABLED` | 填 `true` 开启 Gmail 别名功能 | 空（关闭） |
| `GMAIL_ADDRESS` | 专用 Gmail 母账号地址 | 空 |
| `GMAIL_SYNC_ADDRESS` | 转发收信地址，留空自动用 `gmail-sync@第一个EMAIL_DOMAIN` | 空（自动） |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | API 轮询模式的 OAuth 凭证，需 Google 审核，不推荐 | 空 |

### 发邮件相关（想发邮件才需要配）

不配 `SEND_CHANNEL` 时发信功能默认关闭。

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SEND_CHANNEL` | 发信渠道：`resend` / `mailchannels` / `cloudflare`（cloudflare 渠道需要 Cloudflare Pro） | 空（关闭发信） |
| `SENDER_EMAIL` | 发件人邮箱（开启发信时必填，必须是已验证的域名邮箱） | 空 |
| `MAILBOX_TOKEN_SECRET` | 邮箱令牌签名密钥（开启发信时必填，随机字符串） | 空 |
| `RESEND_API_KEY` | Resend API Key（用 resend 渠道时填，免费版 100 封/天） | 空 |
| `MAILCHANNELS_API_KEY` | MailChannels API Key（用 mailchannels 渠道时填） | 空 |
| `SEND_RATE_LIMIT_PER_MINUTE` | 每个邮箱每分钟发信限制 | `3` |
| `SEND_IP_RATE_LIMIT_PER_MINUTE` | 每个 IP 每分钟发信限制 | `10` |

> 🔐 **重要**：发邮件相关的密钥（RESEND_API_KEY、MAILCHANNELS_API_KEY 这些），建议用 Wrangler Secret 配置，不要直接写在 wrangler.toml 里：
>
> ```bash
> pnpm exec wrangler secret put RESEND_API_KEY
> ```

---

## 💻 本地开发调试

想在本地改代码试试？需要开两个进程：

```bash
# 1. 复制环境变量
cp .env.example .env
# 编辑 .env 填好配置

# 2. 终端 A：启动 Worker（接口 + 构建产物，跑在 http://127.0.0.1:8787）
pnpm run dev

# 3. 终端 B：启动前端开发服务器（跑在 http://localhost:5173，/api 和 /config 自动代理到 8787）
pnpm run frontend:dev
```

访问 http://localhost:5173 即可热更新调试前端。

---

## ❓ 常见问题

### Q：部署完了收不到邮件？

检查这几点：

1.  自定义域名绑定到 `7mail` Worker 了吗？（workers.dev 免费域名不能收邮件）
2.  Email Routing 开通了吗？
3.  Catch-all 兜底规则指向 Worker 了吗？
4.  域名的 MX 记录对吗？（开通 Email Routing 时 Cloudflare 会自动配，一般没问题）
5.  GitHub Actions 里 Apply D1 Migrations 那步成功了吗？

### Q：Gmail 别名收不到信？

按顺序排查：

1.  `GMAIL_ENABLED=true` 和 `GMAIL_ADDRESS` 两个 Secret 配了吗？配完要**重新部署**
2.  Gmail 转发确认了吗？访问 `/api/gmail/forward-inbox` 能看到 Google 的确认邮件
3.  Gmail 设置里最终要选中「将收到的邮件转发给 gmail-sync@...」，光添加地址不勾选不生效
4.  自己域名的 Catch-all 规则要指向 Worker（`gmail-sync@你的域名` 才能收到转发）

### Q：能收邮件，但是发不了？

发邮件功能需要额外配置：

1.  设置 `SEND_CHANNEL`（免费推荐 `resend`，`cloudflare` 渠道要 Pro 版）
2.  配置 `SENDER_EMAIL` 和 `MAILBOX_TOKEN_SECRET`
3.  用 Cloudflare 发信的话，确保域名要先开通 Email Routing
4.  密钥用 wrangler secret put 配置，别直接写配置文件里
5.  Gmail 别名地址本身只能收不能发，属于正常设计

### Q：想加多个域名怎么办？

`EMAIL_DOMAIN` 里用逗号分开就行，比如：`a.com,b.com,c.com`

### Q：密码忘了怎么办？

在邮箱有效期内可以用「查看密码」功能把密码保存下来，下次用密码登录就能找回这个邮箱。过了有效期邮箱就没了，找不回来的哈。

---


觉得有用的话，点个 Star 支持一下吧！🌟

---

## 📝 License

GNU General Public License v3.0

（原项目：[vmail](https://github.com/oiov/vmail)）
