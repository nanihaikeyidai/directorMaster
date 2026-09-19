export type MediaType = 'image' | 'audio' | 'video';
export type AssetCategory = '人物' | '道具' | '场景' | '首帧' | '声音' | '视频';

export type LibraryAsset = {
  id: string;
  name: string;
  description: string;
  category: AssetCategory;
  mediaType: MediaType;
  fileName: string;
  path?: string;
  relativePath?: string;
  blob?: Blob;
  previewUrl?: string;
};

const DB_NAME = 'director-master-library';
const STORE_NAME = 'assets';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadAssets(): Promise<LibraryAsset[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const items = (request.result as LibraryAsset[]).map((asset) => ({
        ...asset,
        previewUrl: asset.blob ? URL.createObjectURL(asset.blob) : undefined,
      }));
      resolve(items);
      db.close();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveAsset(asset: LibraryAsset): Promise<void> {
  const db = await openDb();
  const stored = { ...asset };
  delete stored.previewUrl;
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(stored);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

export async function removeAsset(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}
