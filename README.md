# 📸 Photo Vault - PWA

> Next.js 16 PWA + CLIP AI 标签 + 三层标签架构

**🌐 在线版**：[fableins.com](https://fableins.com)

## 🚀 本地开发

```bash
npm install
npm run dev          # 开发模式
npm run build        # 静态导出到 out/
npm run start        # 生产模式
```

## 🚀 部署

```bash
git push origin main
# Cloudflare Pages 自动构建 + 部署
```

## 🏗️ 架构

- **Next.js 16** + Turbopack + React 19 + TypeScript 5
- **Tailwind CSS 4**
- **IndexedDB** (idb-keyval)
- **Service Worker** v0.2.1（版本感知缓存）
- **CLIP** (transformers.js v3, CDN 懒加载)
- **静态导出** (`output: 'export'`)

## 📁 关键文件

```
src/app/
├── layout.tsx        # SW 注册 + 版本检查
├── page.tsx          # 主组件（拍照 + 标签编辑 + 搜索）
src/lib/
├── storage.ts        # 三层标签架构 + 学习机制
public/
├── manifest.json     # PWA 元数据
├── sw.js             # Service Worker
```

详细文档见 [主 README](../photo-vault/README.md)。
