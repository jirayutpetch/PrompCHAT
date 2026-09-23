const DATABASE = 'promptchat-preview-files';
const STORE = 'attachments';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePreviewAttachment(file: File): Promise<string> {
  const database = await openDatabase();
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(file, id);
    transaction.oncomplete = () => { database.close(); resolve(id); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function openPreviewAttachment(id: string) {
  const database = await openDatabase();
  const file = await new Promise<File | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result as File | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  if (!file) throw new Error('ไม่พบไฟล์แนบในเบราว์เซอร์นี้');
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
