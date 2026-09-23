export type OptimizedUpload = {
  file: File;
  originalSize: number;
  optimizedSize: number;
  compressed: boolean;
  method: 'image' | 'video' | 'original';
};

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function canvasToFile(canvas: HTMLCanvasElement, type: string, quality: number, name: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('ไม่สามารถสร้างไฟล์ภาพที่ optimize แล้วได้'));
      const extension = type === 'image/webp' ? 'webp' : 'jpg';
      resolve(new File([blob], name.replace(/\.[^/.]+$/, `.${extension}`), { type: blob.type, lastModified: Date.now() }));
    }, type, quality);
  });
}

async function compressImage(file: File) {
  const image = await createImageBitmap(file);
  const maxDimension = 2048;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return file;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const optimized = await canvasToFile(canvas, 'image/webp', .88, file.name);
  return optimized.size < file.size ? optimized : file;
}

function supportedVideoType() {
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function compressVideo(file: File) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return file;
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = sourceUrl;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('อ่านวิดีโอไม่สำเร็จ')); });
  const maxDimension = 1280;
  const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
  canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
  const context = canvas.getContext('2d');
  const mimeType = supportedVideoType();
  if (!context || !mimeType) { URL.revokeObjectURL(sourceUrl); return file; }
  const stream = canvas.captureStream(30);
  const sourceStream = 'captureStream' in video ? (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream() : null;
  sourceStream?.getAudioTracks().forEach((track) => stream.addTrack(track));
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const result = new Promise<File>((resolve) => { recorder.onstop = () => resolve(new File([new Blob(chunks, { type: mimeType })], file.name.replace(/\.[^/.]+$/, '.webm'), { type: mimeType, lastModified: Date.now() })); });
  video.onended = () => recorder.stop();
  recorder.start(250);
  await video.play();
  const draw = () => { if (video.ended) return; context.drawImage(video, 0, 0, canvas.width, canvas.height); requestAnimationFrame(draw); };
  draw();
  const optimized = await result;
  video.pause();
  URL.revokeObjectURL(sourceUrl);
  return optimized.size < file.size ? optimized : file;
}

export async function optimizeUpload(file: File): Promise<OptimizedUpload> {
  try {
    const optimized = file.type.startsWith('video/') ? await compressVideo(file) : imageTypes.has(file.type) ? await compressImage(file) : file;
    return { file: optimized, originalSize: file.size, optimizedSize: optimized.size, compressed: optimized.size < file.size, method: optimized === file ? 'original' : file.type.startsWith('video/') ? 'video' : 'image' };
  } catch {
    return { file, originalSize: file.size, optimizedSize: file.size, compressed: false, method: 'original' };
  }
}
