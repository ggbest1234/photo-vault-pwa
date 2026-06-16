'use client';

import { useState, useRef, useEffect } from 'react';
import { loadPhotos, savePhoto, clearPhotos, type StoredPhoto } from '@/lib/storage';

const MOCK_TAGS = [
  'meeting', 'coffee', 'notebook', 'desk', 'window',
  'morning', 'afternoon', 'evening', 'sunset', 'beach',
  'book', 'laptop', 'plant', 'street', 'food',
  'mountain', 'tea', 'lake', 'snow', 'rain',
  'tree', 'flower', 'sky', 'city', 'village',
  'spring', 'summer', 'autumn', 'winter',
];

function autoTag(): string[] {
  const n = 3 + Math.floor(Math.random() * 3);
  const shuffled = [...MOCK_TAGS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export default function Home() {
  const [photo, setPhoto] = useState<StoredPhoto | null>(null);
  const [history, setHistory] = useState<StoredPhoto[]>([]);
  const [tagging, setTagging] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // 启动时加载历史
  useEffect(() => {
    loadPhotos().then((p) => {
      setHistory(p);
      setLoaded(true);
    });
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTagging(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const p: StoredPhoto = {
        id: `${Date.now()}`,
        dataUrl: reader.result as string,
        tags: autoTag(),
        takenAt: new Date().toISOString(),
      };
      setPhoto(p);
      const newHistory = [p, ...history].slice(0, 50);
      setHistory(newHistory);
      await savePhoto(p);
      setTagging(false);
    };
    reader.readAsDataURL(file);
  };

  // 搜索/标签筛选
  const filtered = history.filter((p) => {
    if (activeTag && !p.tags.includes(activeTag)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.tags.some((t) => t.includes(q)) ||
        p.id.includes(q) ||
        (p.note?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  // 标签云统计
  const tagCount: Record<string, number> = {};
  for (const p of history) {
    for (const t of p.tags) tagCount[t] = (tagCount[t] || 0) + 1;
  }
  const topTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">📸 Photo Vault</h1>
        <p className="text-slate-400 text-sm mt-1">
          拍一张照片 · 自动打标签 · 链接到 Obsidian 笔记
        </p>
        <div className="text-xs text-slate-500 mt-2 flex gap-3 flex-wrap">
          <span>📷 {history.length}/50 张</span>
          <span>🏷️ 本地 CLIP（mock）</span>
          <span>🔒 100% 本地</span>
          {loaded && <span className="text-emerald-500">✓ IndexedDB</span>}
        </div>
      </header>

      {/* 拍照按钮组 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => cameraRef.current?.click()}
          className="bg-amber-600 hover:bg-amber-500 active:scale-95 transition rounded-2xl py-6 font-semibold text-lg shadow-lg"
        >
          📷 拍照
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="bg-slate-800 hover:bg-slate-700 active:scale-95 transition rounded-2xl py-6 font-semibold text-lg border border-slate-700"
        >
          🖼️ 相册
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {/* 当前照片 + 标签 */}
      {tagging && (
        <div className="bg-slate-900 rounded-2xl p-6 text-center text-slate-400">
          🏷️ CLIP 识别中...
        </div>
      )}

      {photo && !tagging && (
        <section className="bg-slate-900 rounded-2xl overflow-hidden mb-6 border border-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.dataUrl} alt="刚拍的照片" className="w-full" />
          <div className="p-4">
            <div className="text-xs text-slate-500 mb-2">
              {new Date(photo.takenAt).toLocaleString('zh-CN')}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {photo.tags.map((t) => (
                <span
                  key={t}
                  className="px-3 py-1 bg-amber-900/40 text-amber-300 rounded-full text-sm border border-amber-800/50"
                >
                  #{t}
                </span>
              ))}
            </div>
            <div className="text-xs text-slate-500 font-mono bg-slate-950 p-2 rounded">
              {photo.id}.md → vault/photos/
            </div>
          </div>
        </section>
      )}

      {/* 搜索 + 标签筛选 */}
      {history.length > 0 && (
        <section className="mb-6">
          <input
            type="text"
            placeholder="🔍 搜标签 / 笔记 / ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:border-amber-600 focus:outline-none"
          />
          {topTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => setActiveTag(null)}
                className={`px-2 py-1 text-xs rounded-full ${
                  !activeTag
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                全部
              </button>
              {topTags.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`px-2 py-1 text-xs rounded-full ${
                    activeTag === tag
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  #{tag} {count}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 历史网格 */}
      {filtered.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-slate-300">
            {activeTag || search ? `筛选结果 ${filtered.length} 张` : `最近 ${Math.min(filtered.length, 50)} 张`}
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="aspect-square rounded-lg overflow-hidden bg-slate-900 relative group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                  <div className="flex flex-wrap gap-1">
                    {p.tags.slice(0, 2).map((t) => (
                      <span key={t} className="text-[10px] text-amber-300">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 空状态 */}
      {loaded && history.length === 0 && !photo && (
        <div className="text-center text-slate-600 py-16 text-sm">
          👆 点上面的按钮开始
          <br />
          <span className="text-xs">（MOCK 标签 · 7 天后接真 CLIP）</span>
        </div>
      )}

      {loaded && history.length > 0 && filtered.length === 0 && (
        <div className="text-center text-slate-600 py-8 text-sm">
          没有匹配的照片
        </div>
      )}

      <footer className="text-center text-xs text-slate-600 mt-12 pb-8">
        v0.1.0 MVP · 本地优先 · 开源中
      </footer>
    </main>
  );
}
