# Remember You

一个给两个人共用的轻量记忆本 PWA。可以记录想一起做的事、重要日期、礼物灵感、需要聊聊的话题，并支持留言和状态流转。

## 当前功能

- 未配置 Supabase 时使用本地预览模式，数据保存在浏览器 localStorage。
- 配置 Supabase 后启用邮箱登录、云端同步和 RLS 访问控制。
- 支持新增、删除、筛选记录，标记已看，切换状态，添加留言。
- 包含 PWA manifest 和 service worker 基础配置。

## 本地运行

```bash
npm install
npm run dev
```

打开终端输出的本地地址即可预览。

## Supabase 配置

1. 在 Supabase 新建项目。
2. 打开 SQL Editor，复制并执行 `supabase/schema.sql`。
3. 执行前把 `public.is_couple_member()` 里的两个邮箱替换成你们自己的邮箱。
4. 复制 `.env.example` 为 `.env.local`。
5. 在 Supabase Project Settings > API 中找到 Project URL 和 anon public key，填入 `.env.local`：

```bash
VITE_APP_NAME=Remember You
VITE_SUPABASE_URL=你的 Project URL
VITE_SUPABASE_ANON_KEY=你的 anon public key
```

6. 重新启动开发服务器。

## 已有项目升级

如果项目已经部署过，这次三分区版本需要在 Supabase SQL Editor 里重新执行 `supabase/schema.sql` 中的 migration 部分。它会给 `items` 表增加 `space` 字段，并把旧状态平滑映射到新的状态文案。

## 图片附件迁移

图片附件使用私有 Supabase Storage bucket，不会把图片 Base64 写入数据库。部署带图片功能的前端之前，先在 Supabase SQL Editor 执行：

```text
supabase/migrations/20260618_private_image_attachments.sql
```

它会创建 `remember-images` 私有 bucket、`item_attachments` 表，以及对应的 Storage 和表级 RLS。

## 构建部署

```bash
npm run build
```

部署目录是 `dist`。Vercel、Netlify、Cloudflare Pages 都可以托管，部署时需要配置同名环境变量。

## 下一步建议

1. 先确认本地模式能正常新增、筛选、留言、删除。
2. 再接入 Supabase，并用两个邮箱分别注册测试 RLS。
3. 如果准备长期使用，把分类和状态改为可配置数据，而不是写死在前端和 SQL 约束里。
