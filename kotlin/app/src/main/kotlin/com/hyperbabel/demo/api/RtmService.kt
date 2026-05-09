/*
 * HyperBabel API — Token issuance for the Real-Time and Video engines.
 *
 * The server returns short-lived signed tokens that the client SDKs trade
 * for authenticated channel/RTC sessions. No raw vendor credentials are
 * ever shipped to the client.
 */
package com.hyperbabel.demo.api

import com.hyperbabel.demo.data.RealtimeTokenRequest
import com.hyperbabel.demo.data.RealtimeTokenResponse
import com.hyperbabel.demo.data.RtcTokenRequest
import com.hyperbabel.demo.data.RtcTokenResponse
import retrofit2.http.Body
import retrofit2.http.POST

interface RtmService {
    @POST("api/v1/rtm/token")
    suspend fun realtimeToken(@Body body: RealtimeTokenRequest): RealtimeTokenResponse

    @POST("api/v1/rtm/rtc/token")
    suspend fun rtcToken(@Body body: RtcTokenRequest): RtcTokenResponse
}
