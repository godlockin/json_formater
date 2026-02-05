# Cloudflare Pages 部署修复指南

## 问题
构建命令 `npx wrangler versions upload` 不适用于静态网站部署。

## 解决方案

### 方案 1：修改 Cloudflare Dashboard 构建配置（推荐）

1. 访问 https://dash.cloudflare.com/
2. 进入你的 Pages 项目
3. 点击 **Settings** → **Builds & deployments**
4. 修改构建设置：
   - **Build command**: 留空（不需要构建）
   - **Build output directory**: `public`
   - **Root directory**: `/`
5. 保存并重新部署

### 方案 2：使用 wrangler.toml 替代 wrangler.jsonc

```bash
# 创建 wrangler.toml
cat > wrangler.toml << 'EOF'
name = "json-formater"
compatibility_date = "2026-02-05"

[site]
bucket = "./public"
EOF

git add wrangler.toml
git commit -m "fix: add wrangler.toml for Cloudflare Pages"
git push origin main
```

### 方案 3：直接使用 wrangler pages deploy

在本地部署：

```bash
# 安装 wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署
wrangler pages deploy public --project-name=json-formater
```

## 推荐做法

对于纯静态网站，最简单的配置是：

1. **删除构建命令** - 静态文件不需要构建
2. **设置输出目录为 `public`**
3. Cloudflare Pages 会自动部署 public 目录下的所有文件

## 验证部署

部署成功后访问：
- `https://json-formater.pages.dev`
- 或你的自定义域名

## 当前状态

- ✅ 代码已提交到 GitHub
- ✅ wrangler.jsonc 配置正确
- ⏳ 需要在 Cloudflare Dashboard 中调整构建设置
- ✅ 本地运行正常：http://localhost:8080
