/**
 * HyperBabel API — Storage (3-step presign upload).
 *
 *   1. POST /storage/presign  → returns a one-time PUT URL + storage key
 *      (wire shape: `{ message, data: { upload_url, key, … } }`)
 *   2. PUT  binary bytes to the URL (no auth header — the URL is signed)
 *   3. POST /storage/confirm  → server records the upload, returns CDN URL
 *      (wire shape: `{ message, data: { url, key, … } }`)
 */

import { api } from './client.js';

export async function uploadFile(file, { channelId, folder } = {}) {
  // Step 1 — request a presigned URL.
  const presignResp = await api.post('/storage/presign', {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
    ...(channelId ? { channelId } : {}),
    ...(folder ? { folder } : {}),
  });
  const presign = presignResp?.data ?? presignResp;

  // Step 2 — upload the binary to the presigned URL. We use a bare fetch
  // (no Bearer header) because the URL is already signed.
  const uploadResp = await fetch(presign.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!uploadResp.ok) {
    throw new Error(`Upload failed (${uploadResp.status})`);
  }

  // Step 3 — confirm the upload so the server records it.
  const confirmResp = await api.post('/storage/confirm', {
    key: presign.key,
    originalName: file.name,
  });
  return confirmResp?.data ?? confirmResp;
}
