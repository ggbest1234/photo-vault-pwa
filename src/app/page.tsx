'use client';

import { useState, useRef, useEffect } from 'react';
import {
  loadPhotos, savePhoto, updatePhoto, clearPhotos, deletePhoto,
  heuristicFromFilename, heuristicFromDate, mergeTags, savePref,
  type StoredPhoto, type ClipTag,
} from '@/lib/storage';

// ============ CLIP 集成（CDN 加载，懒加载）============
let _pipeline: ((img: string, labels: string[]) => Promise<{ label: string; score: number }[]>) | null = null;
let _clipLoading: Promise<void> | null = null;

const CANDIDATE_LABELS = [
  // 室内
  'meeting', 'office', 'desk', 'laptop', 'book', 'notebook', 'phone',
  'kitchen', 'restaurant', 'bedroom', 'living room', 'window',
  // 室外
  'street', 'city', 'building', 'sky', 'sunset', 'sunrise',
  'beach', 'mountain', 'snow', 'rain', 'forest', 'park', 'garden',
  // 物体
  'food', 'coffee', 'tea', 'water', 'wine', 'fruit',
  'plant', 'flower', 'tree',
  'car', 'bike', 'train',
  'dog', 'cat', 'bird',
  // 人
  'people', 'selfie', 'group', 'family', 'friend',
  'hand', 'face',
  // 物品
  'paper', 'document', 'screen', 'art', 'painting', 'photo',
  'computer', 'keyboard', 'mouse', 'cable',
  // 抽象
  'morning', 'afternoon', 'evening', 'night',
  'spring', 'summer', 'autumn', 'winter',
];

async function ensureCLIP(): Promise<void> {
  if (_pipeline) return;
  if (_clipLoading) return _clipLoading;

  _clipLoading = (async () => {
    // 动态导入 transformers.js（CDN）
    const transformers = await import(
      /* webpackIgnore: true */
      // @ts-expect-error CDN module
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2'
    );
    const { pipeline, env } = transformers;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    _pipeline = await pipeline(
      'zero-shot-image-classification',
      'Xenova/clip-vit-base-patch32',
      { device: 'webgpu' } // 优先 WebGPU，失败回退 WASM
    );
  })();
  return _clipLoading;
}

async function clipTag(dataUrl: string): Promise<ClipTag[]> {
  try {
    await ensureCLIP();
    if (!_pipeline) return [];
    const result = await _pipeline(dataUrl, CANDIDATE_LABELS);
    return result.slice(0, 5).map((r) => ({
      label: r.label,
      score: r.score,
    }));
  } catch (err) {
    console.error('CLIP failed:', err);
    return [];
  }
}

// ============ 组件 ============

export default function Home() {
  const [photo, setPhoto] = useState<StoredPhoto | null>(null);
  const [history, setHistory] = useState<StoredPhoto[]>([]);
  const [loading, setLoading] = useState<{ stage: string; progress?: number } | null>(null);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [clipStatus, setClipStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPhotos().then((p) => {
      setHistory(p);
      setLoaded(true);
    });
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading({ stage: 'CLIP 识别中...' });
    setClipStatus('loading');

    // 先建占位 photo（含启发式标签），再异步 CLIP
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    const basePhoto: StoredPhoto = {
      id: `${Date.now()}`,
      dataUrl,
      clipTags: [],
      heuristicTags: [
        ...heuristicFromFilename(file.name),
        ...heuristicFromDate(new Date()),
      ],
      manualTags: [],
      takenAt: new Date().toISOString(),
    };

    setPhoto(basePhoto);

    // CLIP 异步跑
    const tags = await clipTag(dataUrl);
    setClipStatus(tags.length > 0 ? 'ready' : 'error');

    const finalPhoto = { ...basePhoto, clipTags: tags };
    setPhoto(finalPhoto);
    const newHistory = [finalPhoto, ...history].slice(0, 50);
    setHistory(newHistory);
    await savePhoto(finalPhoto);
    setLoading(null);
  };

  // 添加手动标签
  const addManualTag = async (tag: string) => {
    if (!photo) return;
    const trimmed = tag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!trimmed || photo.manualTags.includes(trimmed)) return;
    const updated = { ...photo, manualTags: [...photo.manualTags, trimmed] };
    setPhoto(updated);
    const newHistory = await updatePhoto(photo.id, { manualTags: updated.manualTags });
    setHistory(newHistory);
    // 学习：记录偏好
    await savePref('manual', [trimmed]);
  };

  // 删除标签（从对应层删）
  const removeTag = async (layer: 'clip' | 'heuristic' | 'manual', tag: string) => {
    if (!photo) return;
    let patch: Partial<StoredPhoto> = {};
    if (layer === 'clip') {
      patch.clipTags = photo.clipTags.filter((t) => t.label !== tag);
    } else if (layer === 'heuristic') {
      patch.heuristicTags = photo.heuristicTags.filter((t) => t !== tag);
    } else {
      patch.manualTags = photo.manualTags.filter((t) => t !== tag);
    }
    const updated = { ...photo, ...patch };
    setPhoto(updated);
    const newHistory = await updatePhoto(photo.id, patch);
    setHistory(newHistory);
  };

  const onDeletePhoto = async (id: string) => {
    if (!confirm('删除这张照片？')) return;
    const newHistory = await deletePhoto(id);
    setHistory(newHistory);
    if (photo?.id === id) setPhoto(null);
  };

  // 筛选
  const filtered = history.filter((p) => {
    if (activeTag) {
      const allTags = mergeTags(p);
      if (!allTags.includes(activeTag)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const allTags = mergeTags(p);
      return (
        allTags.some((t) => t.includes(q)) ||
        p.id.includes(q) ||
        (p.note?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  // 标签云
  const tagCount: Record<string, number> = {};
  for (const p of history) {
    for (const t of mergeTags(p)) tagCount[t] = (tagCount[t] || 0) + 1;
  }
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 15);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">📸 Photo Vault</h1>
        <p className="text-slate-400 text-sm mt-1">
          拍一张照片 · CLIP 自动标签 · 手动纠错 · 链接到 Obsidian
        </p>
        <div className="text-xs text-slate-500 mt-2 flex gap-3 flex-wrap">
          <span>📷 {history.length}/50 张</span>
          <span>
            🤖 CLIP：{
              clipStatus === 'idle' ? '待加载' :
              clipStatus === 'loading' ? '加载中...' :
              clipStatus === 'ready' ? '✓ 就绪' :
              '⚠️ 失败（手动标签可用）'
            }
          </span>
          <span>🔒 100% 本地</span>
          {loaded && <span className="text-emerald-500">✓ IndexedDB</span>}
        </div>
      </header>

      {/* 拍照按钮组 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={!!loading}
          className="bg-amber-600 hover:bg-amber-500 active:scale-95 transition rounded-2xl py-6 font-semibold text-lg shadow-lg disabled:opacity-50"
        >
          📷 拍照
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!!loading}
          className="bg-slate-800 hover:bg-slate-700 active:scale-95 transition rounded-2xl py-6 font-semibold text-lg border border-slate-700 disabled:opacity-50"
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

      {/* 加载提示 */}
      {loading && (
        <div className="bg-slate-900 rounded-2xl p-6 text-center text-slate-300 mb-6">
          <div className="text-3xl mb-2">⏳</div>
          {loading.stage}
          <div className="text-xs text-slate-500 mt-2">
            首次会下载 CLIP 模型 ~150 MB
          </div>
        </div>
      )}

      {/* 当前照片 + 标签编辑 */}
      {photo && !loading && (
        <section className="bg-slate-900 rounded-2xl overflow-hidden mb-6 border border-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.dataUrl} alt="刚拍的照片" className="w-full" />
          <div className="p-4 space-y-3">
            <div className="text-xs text-slate-500">
              {new Date(photo.takenAt).toLocaleString('zh-CN')}
            </div>

            {/* CLIP 自动标签（带置信度）*/}
            {photo.clipTags.length > 0 && (
              <div>
                <div className="text-xs text-amber-500 mb-1 font-semibold">
                  🤖 CLIP 自动（点 × 删除）
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {photo.clipTags.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => removeTag('clip', t.label)}
                      className="px-2 py-0.5 bg-amber-900/40 text-amber-300 rounded-full text-xs border border-amber-800/50 hover:bg-red-900/40 hover:text-red-300 hover:border-red-800/50 transition"
                      title={`置信度 ${(t.score * 100).toFixed(0)}% · 点 × 删除`}
                    >
                      #{t.label} {(t.score * 100).toFixed(0)}% ×
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 启发式标签 */}
            {photo.heuristicTags.length > 0 && (
              <div>
                <div className="text-xs text-emerald-500 mb-1 font-semibold">
                  📁 元数据（点 × 删除）
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {photo.heuristicTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => removeTag('heuristic', t)}
                      className="px-2 py-0.5 bg-emerald-900/40 text-emerald-300 rounded-full text-xs border border-emerald-800/50 hover:bg-red-900/40 hover:text-red-300 hover:border-red-800/50 transition"
                    >
                      #{t} ×
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 手动标签 */}
            <div>
              <div className="text-xs text-blue-500 mb-1 font-semibold">
                📝 手动标签
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {photo.manualTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => removeTag('manual', t)}
                    className="px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full text-xs border border-blue-800/50 hover:bg-red-900/40 hover:text-red-300 hover:border-red-800/50 transition"
                  >
                    #{t} ×
                  </button>
                ))}
              </div>
              <input
                ref={tagInputRef}
                type="text"
                placeholder="输入标签 + Enter（如 project-a）"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addManualTag((e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
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
                  !activeTag ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                全部
              </button>
              {topTags.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`px-2 py-1 text-xs rounded-full ${
                    activeTag === tag ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
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
                    {mergeTags(p).slice(0, 2).map((t) => (
                      <span key={t} className="text-[10px] text-amber-300">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePhoto(p.id);
                  }}
                  className="absolute top-1 right-1 bg-red-600/80 text-white text-xs w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 空状态 */}
      {loaded && history.length === 0 && !photo && !loading && (
        <div className="text-center text-slate-600 py-16 text-sm">
          👆 点上面的按钮开始
          <br />
          <span className="text-xs">
            首次拍照会下载 CLIP 模型（~150 MB，离线后只下 1 次）
          </span>
        </div>
      )}

      {loaded && history.length > 0 && filtered.length === 0 && (
        <div className="text-center text-slate-600 py-8 text-sm">
          没有匹配的照片
        </div>
      )}

      <footer className="text-center text-xs text-slate-600 mt-12 pb-8">
        v0.2.0 · CLIP + 手动 + 启发式 · 本地优先
      </footer>
    </main>
  );
}