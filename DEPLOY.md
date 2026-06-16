# fableins.com 部署指南

## 1. 推送代码到 GitHub

```bash
cd /home/ryan/photo-vault-pwa
git add .
git commit -m "feat: photo vault pwa v0.1.0"
git push -u origin main
```

## 2. Cloudflare Pages 一键部署

1. 打开 https://dash.cloudflare.com/
2. 左侧 `Workers & Pages` → `Create` → `Pages` → `Connect to Git`
3. 选 `ryanhsu/photo-vault-pwa` 仓
4. Framework preset: **Next.js (Static HTML Export)**
5. Build command: `npm run build`
6. Build output: `out`（先配 `next.config.js` 静态导出）
7. 点 `Save and Deploy`

## 3. 绑域名

部署完成后：
- Pages 项目 → `Custom domains` → `Set up a custom domain`
- 输入 `fableins.com` → `Continue`
- 输入 `www.fableins.com` → 自动 301 重定向

## 4. 验证

```bash
curl -I https://fableins.com
# 应返回 200 OK
```

## 注意事项

- **Next.js 16 + Turbopack 默认 server-side**。PWA 部署需要静态导出。
- `next.config.js` 加 `output: 'export'`
- API routes 静态化后不能用（暂时没 API，没问题）
