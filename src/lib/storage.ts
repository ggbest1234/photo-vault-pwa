import { get, set, del } from 'idb-keyval';

export type ClipTag = {
  label: string;
  score: number; // 0-1
};

export type StoredPhoto = {
  id: string;
  dataUrl: string;
  takenAt: string;
  // 三层标签
  clipTags: ClipTag[];       // CLIP 自动（带置信度）
  heuristicTags: string[];   // 文件名 + EXIF 启发式
  manualTags: string[];      // 用户手动
  note?: string;             // 用户笔记
  // 派生（不存，按需计算）
  // get allTags(): string[] { ... }
};

const PHOTOS_KEY = 'photo-vault-history-v1';
const PREF_KEY = 'photo-vault-pref-v1'; // 用户偏好（学习用）

export async function loadPhotos(): Promise<StoredPhoto[]> {
  return (await get<StoredPhoto[]>(PHOTOS_KEY)) || [];
}

export async function savePhoto(photo: StoredPhoto): Promise<void> {
  const photos = await loadPhotos();
  photos.unshift(photo);
  const trimmed = photos.slice(0, 50);
  await set(PHOTOS_KEY, trimmed);
}

export async function updatePhoto(id: string, patch: Partial<StoredPhoto>): Promise<StoredPhoto[]> {
  const photos = await loadPhotos();
  const idx = photos.findIndex((p) => p.id === id);
  if (idx === -1) return photos;
  photos[idx] = { ...photos[idx], ...patch };
  await set(PHOTOS_KEY, photos.slice(0, 50));
  return photos;
}

export async function deletePhoto(id: string): Promise<StoredPhoto[]> {
  const photos = await loadPhotos();
  const next = photos.filter((p) => p.id !== id);
  await set(PHOTOS_KEY, next);
  return next;
}

export async function clearPhotos(): Promise<void> {
  await del(PHOTOS_KEY);
}

// 合并三层标签
export function mergeTags(photo: StoredPhoto): string[] {
  const clip = (photo.clipTags || [])
    .filter((t) => t.score > 0.3) // 只取置信度 > 30%
    .map((t) => t.label);
  const heuristic = photo.heuristicTags || [];
  const manual = photo.manualTags || [];
  return Array.from(new Set([...manual, ...clip, ...heuristic]));
}

// 文件名启发式标签（规则简单，覆盖常见词）
export function heuristicFromFilename(filename: string): string[] {
  const name = filename.toLowerCase().replace(/\.[^.]+$/, '');
  const keywords: Record<string, string> = {
    beach: 'beach',
    sea: 'beach',
    ocean: 'beach',
    mountain: 'mountain',
    snow: 'snow',
    coffee: 'coffee',
    tea: 'tea',
    meeting: 'meeting',
    book: 'book',
    laptop: 'laptop',
    plant: 'plant',
    food: 'food',
    dog: 'dog',
    cat: 'cat',
    sunset: 'sunset',
    sunrise: 'sunrise',
    city: 'city',
    street: 'street',
    night: 'night',
    day: 'daytime',
    window: 'window',
    desk: 'desk',
    office: 'office',
    home: 'home',
    family: 'family',
    friend: 'friend',
    selfie: 'selfie',
    travel: 'travel',
  };
  const tags: string[] = [];
  for (const [kw, tag] of Object.entries(keywords)) {
    if (name.includes(kw) && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

// 时间启发式（季节 + 时段）
export function heuristicFromDate(date: Date): string[] {
  const tags: string[] = [];
  const month = date.getMonth() + 1;
  if ([3, 4, 5].includes(month)) tags.push('spring');
  else if ([6, 7, 8].includes(month)) tags.push('summer');
  else if ([9, 10, 11].includes(month)) tags.push('autumn');
  else tags.push('winter');

  const hour = date.getHours();
  if (hour < 6) tags.push('night');
  else if (hour < 12) tags.push('morning');
  else if (hour < 18) tags.push('afternoon');
  else tags.push('evening');

  return tags;
}

// 用户偏好（学习用，记录用户手动改了什么）
export async function loadPrefs(): Promise<Record<string, string[]>> {
  return (await get<Record<string, string[]>>(PREF_KEY)) || {};
}

export async function savePref(originalTag: string, userTags: string[]): Promise<void> {
  const prefs = await loadPrefs();
  prefs[originalTag] = Array.from(new Set([...(prefs[originalTag] || []), ...userTags]));
  await set(PREF_KEY, prefs);
}