import { useRef, useState } from 'react';
import { useSession, managerLabel } from '../store/sessionStore';
import { formatTime } from '../lib/timeUtils';
import { firebaseState } from '../lib/firebase';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.82;

export default function PhotoUploader({ taskId, photos = [], disabled = false }) {
  const { addPhoto, removePhoto, updatePhotoCaption, patchPhoto, session, activeManager, mode } = useSession();
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null);

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true); setError('');
    try {
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        const dataUrl = await compressImage(f);
        const photoId = cryptoRandomId();
        // Add immediately with dataUrl so the user sees the thumbnail right away.
        addPhoto(taskId, {
          id: photoId,
          dataUrl,
          caption: '',
          uploadedAt: new Date().toISOString(),
          uploadedBy: activeManager,
          uploading: mode === 'cloud',
        });
        // Background upload to Storage (don't await — UI stays responsive).
        if (mode === 'cloud') {
          uploadPhotoToStorage(session.id, taskId, photoId, dataUrl)
            .then((cloud) => {
              // Replace local dataUrl with cloud refs; sync engine will then
              // publish the small photo metadata to the doc on next debounce tick.
              patchPhoto(taskId, photoId, {
                storagePath: cloud.storagePath,
                downloadUrl: cloud.downloadUrl,
                dataUrl: null,
                uploading: false,
              });
            })
            .catch((err) => {
              console.warn('[photo] storage upload failed; staying local', err);
              patchPhoto(taskId, photoId, { uploading: false, uploadError: String(err?.message || err) });
            });
        }
      }
    } catch (err) {
      setError(err?.message || 'Could not add photo');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // photoSrc: handles cloud (downloadUrl) and local (dataUrl) cases uniformly.
  const src = (p) => p.downloadUrl || p.dataUrl || '';

  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map(p => (
            <div key={p.id} className="relative group rounded-lg overflow-hidden ring-1 ring-slate-200 bg-slate-50">
              <button onClick={() => setLightbox(p)} className="block w-full aspect-square">
                <img src={src(p)} alt={p.caption || 'photo'} className="w-full h-full object-cover" />
              </button>
              {p.uploading && (
                <div className="absolute inset-0 bg-black/30 grid place-items-center pointer-events-none">
                  <div className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                </div>
              )}
              {!disabled && (
                <button
                  onClick={() => removePhoto(taskId, p.id)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white text-xs font-bold grid place-items-center"
                  aria-label="Remove photo"
                >×</button>
              )}
              {p.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[10px] px-1 py-0.5 truncate">
                  {p.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!disabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={onFiles}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-medium rounded-lg text-sm disabled:opacity-50"
          >
            <CameraIcon className="w-5 h-5" />
            {busy ? 'Processing…' : photos.length ? 'Add another photo' : 'Add photo'}
          </button>
          {error && <div className="text-xs text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded p-2">{error}</div>}
        </>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex flex-col p-4 no-print"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="self-end text-white text-3xl leading-none mb-2"
            aria-label="Close"
          >×</button>
          <img src={src(lightbox)} alt="" className="max-w-full max-h-[60vh] object-contain mx-auto" onClick={e => e.stopPropagation()} />
          <div className="mt-3 mx-auto w-full max-w-md" onClick={e => e.stopPropagation()}>
            <input
              value={lightbox.caption || ''}
              onChange={e => {
                updatePhotoCaption(taskId, lightbox.id, e.target.value);
                setLightbox({ ...lightbox, caption: e.target.value });
              }}
              placeholder="Add caption…"
              disabled={disabled}
              className="w-full rounded-lg px-3 py-2.5 text-base bg-white"
            />
            <div className="text-xs text-white/70 mt-2 text-center">
              {managerLabel(session, lightbox.uploadedBy)} · {formatTime(lightbox.uploadedAt)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CameraIcon(p) {
  return (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="3.5"/>
    </svg>
  );
}

function cryptoRandomId() {
  const a = new Uint8Array(6);
  (globalThis.crypto || window.crypto).getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const ratio = Math.min(1, MAX_DIM / Math.max(width, height));
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bad image')); };
    img.src = url;
  });
}

// Uploads the data URL JPEG to Storage at sessions/{sessionId}/{taskId}/{photoId}.jpg.
// Returns { storagePath, downloadUrl } once the upload + URL fetch are done.
async function uploadPhotoToStorage(sessionId, taskId, photoId, dataUrl) {
  const fb = firebaseState();
  if (!fb) throw new Error('Firebase not initialized');
  const path = `sessions/${sessionId}/${taskId}/${photoId}.jpg`;
  const r = storageRef(fb.storage, path);
  await uploadString(r, dataUrl, 'data_url', { contentType: 'image/jpeg' });
  const downloadUrl = await getDownloadURL(r);
  return { storagePath: path, downloadUrl };
}
