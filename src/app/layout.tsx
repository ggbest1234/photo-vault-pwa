import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Photo Vault',
  description: '你的本地照片知识库 - 拍一张照片，自动打标签，链接到 Obsidian 笔记',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PhotoVault',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <head>
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').then((reg) => {
                  // 检查更新
                  reg.update();
                  // 每 60 秒检查一次（页面打开时）
                  setInterval(() => reg.update(), 60000);
                  // 监听新 SW
                  reg.addEventListener('waiting', () => {
                    if (confirm('🆕 Photo Vault 有新版本，刷新查看？')) {
                      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
                      location.reload();
                    }
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}