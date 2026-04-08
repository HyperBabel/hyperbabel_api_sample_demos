/**
 * HyperBabel API — Storage Service
 *
 * Three-step presigned-URL upload flow for files up to 5 GB:
 *   1. POST /storage/presign  — Validate file and get a presigned PUT URL
 *   2. PUT  <presigned_url>   — Upload the file directly (client → storage)
 *   3. POST /storage/confirm  — Confirm the upload and record metadata
 *
 * Download egress is 100% free. Files are served globally via CDN.
 *
 * Base path: /storage
 */

import api from './api';

const BASE = '/storage';

/**
 * Step 1 — Pre-validate the file and receive a presigned upload URL.
 *
 * @param {object} data
 * @param {string} data.filename  — Original filename with extension
 * @param {string} data.mimeType  — MIME type (e.g. 'image/png')
 * @param {number} data.fileSize  — Size in bytes
 * @param {string} [data.channelId] — Chat channel ID (for chat file uploads)
 * @param {string} [data.folder]    — Custom folder (default: 'uploads')
 * @returns {Promise<{ presigned_url: string, key: string }>}
 */
export const presign = (data) => api.post(`${BASE}/presign`, data);

/**
 * Step 2 — Upload the file directly to the presigned URL.
 * This bypasses the API server (client → storage CDN).
 *
 * @param {string} presignedUrl — Presigned PUT URL from step 1
 * @param {File}   file         — File object from <input type="file">
 * @param {string} mimeType
 */
export const uploadToPresignedUrl = async (presignedUrl, file, mimeType) => {
  const response = await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': mimeType },
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return response;
};

/**
 * Step 3 — Confirm the upload completed. HyperBabel verifies the file
 * exists in storage and records metadata + usage.
 *
 * @param {object} data
 * @param {string} data.key          — Object key from step 1
 * @param {string} data.originalName — Original filename for metadata
 * @returns {Promise<object>} File metadata
 */
export const confirmUpload = (data) => api.post(`${BASE}/confirm`, data);

/**
 * Convenience wrapper: Presign → Upload → Confirm in one call.
 *
 * @param {File}   file       — File object
 * @param {string} [channelId] — Optional chat channel ID
 * @param {string} [folder]    — Optional folder name
 * @returns {Promise<object>}  — Confirmed file metadata
 */
export const uploadFile = async (file, channelId, folder) => {
  // Step 1: Get presigned URL
  const presignData = await presign({
    filename: file.name,
    mimeType: file.type,
    fileSize: file.size,
    ...(channelId && { channelId }),
    ...(folder && { folder }),
  });

  // Step 2: Upload directly to storage
  await uploadToPresignedUrl(presignData.presigned_url, file, file.type);

  // Step 3: Confirm upload
  return confirmUpload({
    key: presignData.key,
    originalName: file.name,
  });
};
