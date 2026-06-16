import { get, set, del } from 'idb-keyval';

const PHOTOS_KEY = 'photo-vault-history-v1';

export type StoredPhoto = {
  id: string;
  dataUrl: string;
  tags: string[];
  takenAt: string;
  note?: string;
};

export async function loadPhotos(): Promise<StoredPhoto[]> {
  const photos = (await get<StoredPhoto[]>(PHOTOS_KEY)) || [];
  return photos;
}

export async function savePhoto(photo: StoredPhoto): Promise<void> {
  const photos = await loadPhotos();
  photos.unshift(photo);
  // 保留最近 50 张（dataUrl 太大容易爆存储）
  const trimmed = photos.slice(0, 50);
  await set(PHOTOS_KEY, trimmed);
}

export async function clearPhotos(): Promise<void> {
  await del(PHOTOS_KEY);
}
