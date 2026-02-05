# 部署指南

## 方式一：GitHub Pages（推荐）

1. 访问 https://github.com/godlockin/json_formater/settings/pages
2. Source 选择 "Deploy from a branch"
3. Branch 选择 "main"，文件夹选择 "/public"
4. 点击 Save

部署完成后访问：https://godlockin.github.io/json_formater/

## 方式二：Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel --prod
```

## 方式三：Netlify

```bash
# 安装 Netlify CLI
npm i -g netlify-cli

# 部署
netlify deploy --prod --dir=public
```

## 方式四：本地预览

```bash
cd public
python3 -m http.server 8080
# 访问 http://localhost:8080
```
