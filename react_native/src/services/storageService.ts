/**
 * HyperBabel API — Storage Service
 *
 * Three-step presigned-URL upload flow for files up to 5 GB:
 *   1. POST /storage/presign  — Validate file and get a presigned PUT URL
 *   2. PUT  <presigned_url>   — Upload the file directly (client → storage CDN)
 *   3. POST /storage/confirm  — Confirm upload and record metadata
 *
 * Download egress is 100% free. Files are served globally via CDN.
 *
 * React Native difference from the web demo:
 *   Step 2 uses expo-file-system's uploadAsync() instead of fetch() + File
 *   to handle local file URIs efficiently without loading the entire file
 *   into JavaScript memory.
 *
 * Base path: /storage
 */

import * as FileSystem from 'expo-file-system/legacy';
import api from './api';

const BASE = '/storage';

// ── Types ─────────────────────────────────────────────────────────────────

export interface PresignParams {
  filename:   string;
  mimeType:   string;
  fileSize:   number;
  channelId?: string;
  folder?:    string;
}

export interface PresignResult {
  presigned_url: string;
  key:           string;
}

export interface ConfirmResult {
  key:           string;
  cdn_url:       string;
  original_name: string;
  mime_type:     string;
  file_size:     number;
  created_at:    string;
}

export interface UploadFileOption {
  /** Local file URI from expo-image-picker or expo-document-picker */
  uri:         string;
  filename:    string;
  mimeType:    string;
  fileSize:    number;
  channelId?:  string;
  folder?:     string;
  /** Called with 0–100 upload progress (uses expo-file-system uploadAsync) */
  onProgress?: (pct: number) => void;
}

// ── Step 1 ────────────────────────────────────────────────────────────────

/**
 * Step 1 — Pre-validate the file and receive a presigned upload URL.
 */
export const presign = (data: PresignParams) =>
  api.post<PresignResult>(`${BASE}/presign`, data);

// ── Step 2 ────────────────────────────────────────────────────────────────

/**
 * Step 2 — Upload the file directly to the presigned URL.
 *
 * Uses expo-file-system's uploadAsync() for efficient binary transfer
 * from a local file URI (no full file loading into JS memory).
 */
export const uploadToPresignedUrl = async (
  presignedUrl: string,
  fileUri: string,
  mimeType: string,
  onProgress?: (pct: number) => void,
): Promise<void> => {
  const uploadTask = FileSystem.createUploadTask(
    presignedUrl,
    fileUri,
    {
      httpMethod:  'PUT',
      uploadType:  FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers:     { 'Content-Type': mimeType },
    },
    (progress) => {
      if (onProgress) {
        const pct = Math.round((progress.totalBytesSent / progress.totalBytesExpectedToSend) * 100);
        onProgress(pct);
      }
    },
  );

  const result = await uploadTask.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed with status ${result?.status}`);
  }
};

// ── Step 3 ────────────────────────────────────────────────────────────────

/**
 * Step 3 — Confirm the upload completed.
 * HyperBabel verifies the file exists in storage and records metadata + usage.
 */
export const confirmUpload = (data: { key: string; originalName: string }) =>
  api.post<ConfirmResult>(`${BASE}/confirm`, data);

// ── Convenience wrapper ───────────────────────────────────────────────────

/**
 * Full 3-step upload: Presign → Upload → Confirm.
 *
 * @example
 *   const result = await uploadFile({
 *     uri:      pickerResult.assets[0].uri,
 *     filename: 'photo.jpg',
 *     mimeType: 'image/jpeg',
 *     fileSize: pickerResult.assets[0].fileSize ?? 0,
 *     onProgress: (pct) => setProgress(pct),
 *   });
 *   console.log(result.cdn_url); // CDN URL ready to use in a message
 */
export const uploadFile = async (opts: UploadFileOption): Promise<ConfirmResult> => {
  // Step 1
  const presignData = await presign({
    filename:   opts.filename,
    mimeType:   opts.mimeType,
    fileSize:   opts.fileSize,
    channelId:  opts.channelId,
    folder:     opts.folder,
  });

  // Step 2
  await uploadToPresignedUrl(
    presignData.presigned_url,
    opts.uri,
    opts.mimeType,
    opts.onProgress,
  );

  // Step 3
  return confirmUpload({
    key:          presignData.key,
    originalName: opts.filename,
  });
};
