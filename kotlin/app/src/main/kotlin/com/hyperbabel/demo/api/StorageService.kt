/*
 * HyperBabel API — Storage (3-step presign upload).
 *
 * The actual binary PUT to the presigned URL must NOT carry a Bearer token,
 * so the helper below builds a one-shot OkHttp client for that step.
 */
package com.hyperbabel.demo.api

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import retrofit2.http.Body
import retrofit2.http.POST
import java.io.File

interface StorageService {
    @POST("api/v1/storage/presign")
    suspend fun presign(@Body body: JsonObject): JsonObject

    @POST("api/v1/storage/confirm")
    suspend fun confirm(@Body body: JsonObject): JsonObject
}

object StorageUpload {
    /** Walk the 3-step flow and return the confirm response. */
    suspend fun uploadFile(
        file: File,
        filename: String,
        mimeType: String,
        channelId: String? = null,
        folder: String? = null,
    ): JsonObject {
        val presignBody = buildJsonObject {
            put("filename", filename)
            put("mimeType", mimeType)
            put("fileSize", file.length())
            channelId?.let { put("channelId", it) }
            folder?.let { put("folder", it) }
        }
        // cf_workers_api wraps the presign payload as `{ message, data: { upload_url, key, … } }`.
        // Unwrap so callers don't need to know.
        val presignEnv = ApiClient.storage.presign(presignBody)
        val presign = presignEnv["data"]?.jsonObject ?: presignEnv
        val uploadUrl = presign["upload_url"]?.jsonPrimitive?.content
            ?: throw IllegalStateException("Server did not return upload_url")
        val key = presign["key"]?.jsonPrimitive?.content
            ?: throw IllegalStateException("Server did not return a storage key")

        // Step 2 — bare PUT, no Authorization header.
        val client = OkHttpClient.Builder().build()
        val req = Request.Builder()
            .url(uploadUrl)
            .put(file.asRequestBody(mimeType.toMediaType()))
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                throw IllegalStateException("Upload failed (${resp.code})")
            }
        }
        // Confirm response is also wrapped as `{ message, data: { url, key, … } }`.
        val confirmEnv = ApiClient.storage.confirm(buildJsonObject {
            put("key", key)
            put("originalName", filename)
        })
        return confirmEnv["data"]?.jsonObject ?: confirmEnv
    }
}
