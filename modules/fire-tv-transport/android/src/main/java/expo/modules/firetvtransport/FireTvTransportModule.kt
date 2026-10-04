package expo.modules.firetvtransport

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.net.ConnectException
import java.net.Inet4Address
import java.net.SocketTimeoutException
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.Collections
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLPeerUnverifiedException
import javax.net.ssl.SSLSession
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.ConnectionPool
import okhttp3.ConnectionSpec
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import kotlin.coroutines.resume

class TransportException(code: String, message: String, cause: Throwable? = null) : CodedException(code, message, cause)

private class Reply(val status: Int, val text: String) {
  val isSuccessful get() = status in 200..299
}

/** Tags every Lightning request: pinCheck records the leaf the TV presented and refuses any leaf but expected. */
private class LeafCheck(val expected: String?) {
  var presented: String? = null
}

class FireTvTransportModule : Module() {
  private val jsonType = "application/json".toMediaType()
  private val emptyBody: RequestBody = ByteArray(0).toRequestBody(null)
  private var wifiLock: WifiManager.WifiLock? = null

  // The handshake accepts any chain and pinCheck decides identity per request. The exact leaf pin is the
  // authentication, so expiry or a wrong phone clock never locks the app out.
  private val trustManager = object : X509TrustManager {
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
      throw CertificateException("Client certificates are unsupported")
    }

    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
      if (chain.isEmpty()) throw CertificateException("TV sent no certificate")
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  }

  // A network interceptor sees the connection of every attempt, pooled or retried, and a mismatch throws before
  // proceed, so a token never reaches another TV. OkHttp never retries SSLPeerUnverifiedException, and its
  // CertificateException cause makes classify report CERT. The leaf comes from the socket's session because
  // OkHttp's Handshake reports no peer certificates when none chains to a trusted root.
  private val pinCheck = Interceptor { chain ->
    val check = chain.request().tag(LeafCheck::class.java)
    if (check != null) {
      val presented = (chain.connection()?.socket() as? SSLSocket)?.session?.let(::leafFingerprint)
      check.presented = presented
      if (check.expected != null && presented != check.expected) {
        throw SSLPeerUnverifiedException("TV certificate does not match the paired TV").apply {
          initCause(CertificateException("Expected leaf ${check.expected}, got $presented"))
        }
      }
    }
    chain.proceed(chain.request())
  }

  private val pooledClient: OkHttpClient by lazy {
    val context = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustManager), null) }
    OkHttpClient.Builder()
      .connectionPool(ConnectionPool(2, 5, TimeUnit.MINUTES))
      .sslSocketFactory(context.socketFactory, trustManager)
      .addNetworkInterceptor(pinCheck)
      // The leaf certificate pin authenticates the TV in place of a DNS hostname.
      .hostnameVerifier { _, _ -> true }
      // COMPATIBLE_TLS keeps MODERN_TLS's approved cipher list and additionally allows TLS 1.0 and 1.1,
      // which the old HttpsURLConnection path accepted from this TV.
      .connectionSpecs(listOf(ConnectionSpec.COMPATIBLE_TLS, ConnectionSpec.CLEARTEXT))
      .build()
  }

  // Timeouts follow the profile. Retries follow the method: a GET is idempotent, so OkHttp may repeat it
  // once on a pooled socket the TV closed while idle; a POST the TV may already have applied is never sent twice.
  private val fastGet: OkHttpClient by lazy { timedClient(1500, 2000, retry = true) }
  private val fastPost: OkHttpClient by lazy { timedClient(1500, 2000, retry = false) }
  private val slowGet: OkHttpClient by lazy { timedClient(7000, 10000, retry = true) }
  private val slowPost: OkHttpClient by lazy { timedClient(7000, 10000, retry = false) }

  override fun definition() = ModuleDefinition {
    Name("FireTvTransport")

    AsyncFunction("wake") Coroutine { host: String ->
      val request = Request.Builder()
        .url("http://${validateHost(host)}:8009/apps/FireTVRemote")
        .post(emptyBody)
        .build()
      withContext(Dispatchers.IO) {
        val reply = execute(clientFor("slow", "POST"), request)
        if (!reply.isSuccessful) throw httpError(reply.status, "TV wake failed")
      }
    }

    // Any HTTP answer proves the Lightning service is up; an unpaired probe is answered with 403.
    // Resolves to the leaf the TV presented, which pairing pins when no fingerprint is known yet.
    AsyncFunction("probe") Coroutine { host: String, fingerprint: String? ->
      val check = LeafCheck(fingerprint?.let(::validateFingerprint))
      val request = lightningRequest(validateHost(host), check, "/v1/FireTV", "GET", "", "")
      withContext(Dispatchers.IO) {
        execute(clientFor("slow", "GET"), request)
        check.presented ?: throw TransportException("CERT", "TV sent no certificate")
      }
    }

    AsyncFunction("request") Coroutine { host: String, fingerprint: String, path: String, method: String, body: String, token: String, timeouts: String ->
      val client = clientFor(timeouts, method)
      val request = lightningRequest(validateHost(host), LeafCheck(validateFingerprint(fingerprint)), path, method, body, token)
      withContext(Dispatchers.IO) {
        val reply = execute(client, request)
        if (!reply.isSuccessful) throw httpError(reply.status, "TV request failed")
        reply.text
      }
    }

    // The hold lives here so the release still goes out if the JS runtime tears down mid-hold.
    // The release is sent even when the press failed, because a press the TV applied before its reply was lost would otherwise stay held.
    AsyncFunction("holdKey") Coroutine { host: String, fingerprint: String, path: String, token: String, holdMs: Int ->
      val tvHost = validateHost(host)
      val tvFingerprint = validateFingerprint(fingerprint)
      val down = lightningRequest(tvHost, LeafCheck(tvFingerprint), path, "POST", "{\"keyActionType\":\"keyDown\"}", token)
      val up = lightningRequest(tvHost, LeafCheck(tvFingerprint), path, "POST", "{\"keyActionType\":\"keyUp\"}", token)
      withContext(Dispatchers.IO) {
        var failure: Throwable? = null
        try {
          val reply = execute(fastPost, down)
          if (!reply.isSuccessful) throw httpError(reply.status, "TV key press failed")
          delay(holdMs.toLong())
        } catch (error: Throwable) {
          failure = error
        } finally {
          try {
            withContext(NonCancellable) {
              val reply = execute(fastPost, up)
              if (!reply.isSuccessful) throw httpError(reply.status, "TV key release failed")
            }
          } catch (releaseError: Throwable) {
            if (failure == null) failure = releaseError else failure.addSuppressed(releaseError)
          }
        }
        failure?.let { throw it }
      }
    }

    // Every Fire TV on the network answers; the caller tells the paired TV apart by its certificate fingerprint.
    AsyncFunction("discover") Coroutine { windowMs: Int ->
      discoverHosts(windowMs.toLong())
    }

    Function("setWifiLowLatency") { enabled: Boolean -> setWifiLock(enabled) }

    OnDestroy {
      wifiLock?.takeIf { it.isHeld }?.release()
      wifiLock = null
    }
  }

  private fun timedClient(connectMs: Long, ioMs: Long, retry: Boolean): OkHttpClient =
    pooledClient.newBuilder()
      .connectTimeout(connectMs, TimeUnit.MILLISECONDS)
      .readTimeout(ioMs, TimeUnit.MILLISECONDS)
      .writeTimeout(ioMs, TimeUnit.MILLISECONDS)
      .retryOnConnectionFailure(retry)
      .build()

  private fun clientFor(timeouts: String, method: String): OkHttpClient = when (timeouts to method) {
    "fast" to "GET" -> fastGet
    "fast" to "POST" -> fastPost
    "slow" to "GET" -> slowGet
    "slow" to "POST" -> slowPost
    else -> throw IllegalArgumentException("Invalid TV timeout profile or method")
  }

  private fun validateHost(host: String): String {
    val octets = host.split(".")
    require(octets.size == 4 && octets.all { it.length in 1..3 && it.all(Char::isDigit) && it.toInt() in 0..255 }) {
      "Invalid IPv4 host"
    }
    return host
  }

  private fun validateFingerprint(fingerprint: String): String {
    require(fingerprint.length == 64 && fingerprint.all { it in '0'..'9' || it in 'a'..'f' }) { "Invalid certificate fingerprint" }
    return fingerprint
  }

  private fun leafFingerprint(session: SSLSession): String? {
    val leaf = runCatching { session.peerCertificates.firstOrNull() }.getOrNull() ?: return null
    return MessageDigest.getInstance("SHA-256")
      .digest(leaf.encoded)
      .joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }

  private fun lightningRequest(host: String, check: LeafCheck, path: String, method: String, body: String, token: String): Request {
    require(path.startsWith("/v1/") && !path.contains("..") && !path.contains('\n')) { "Invalid TV request path" }
    require(method == "GET" || method == "POST") { "Invalid TV request method" }
    val builder = Request.Builder()
      .url("https://$host:8080$path")
      .tag(LeafCheck::class.java, check)
      .header("X-Api-Key", "0987654321")
      .header("User-Agent", "TarangRemote/1.0")
    if (token.isNotEmpty()) builder.header("X-Client-Token", token)
    if (method == "POST") {
      builder.post(if (body.isEmpty()) emptyBody else body.toRequestBody(jsonType))
    }
    return builder.build()
  }

  // The body is read inside the same catch as the call, so a read timeout classifies as TIMEOUT and a reset as NETWORK.
  private fun execute(client: OkHttpClient, request: Request): Reply {
    try {
      client.newCall(request).execute().use { response ->
        return Reply(response.code, response.body?.string() ?: "")
      }
    } catch (error: IOException) {
      throw classify(error)
    }
  }

  private fun classify(error: IOException): TransportException {
    val message = error.message ?: error.javaClass.simpleName
    val certificateFailure = generateSequence<Throwable>(error) { it.cause }.any { it is CertificateException }
    return when {
      certificateFailure -> TransportException("CERT", "TV certificate does not match the paired TV", error)
      error is SocketTimeoutException -> TransportException("TIMEOUT", "TV did not answer in time", error)
      error is ConnectException -> TransportException("REFUSED", "TV remote service refused the connection", error)
      else -> TransportException("NETWORK", message, error)
    }
  }

  private fun httpError(status: Int, prefix: String): TransportException =
    TransportException("HTTP_$status", "$prefix (HTTP $status)")

  private suspend fun discoverHosts(windowMs: Long): List<Map<String, String?>> {
    val context = appContext.reactContext?.applicationContext ?: return emptyList()
    val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: return emptyList()
    val services = Collections.synchronizedList(mutableListOf<NsdServiceInfo>())
    val listener = object : NsdManager.DiscoveryListener {
      override fun onServiceFound(service: NsdServiceInfo) { services.add(service) }
      override fun onServiceLost(service: NsdServiceInfo) {}
      override fun onDiscoveryStarted(serviceType: String) {}
      override fun onDiscoveryStopped(serviceType: String) {}
      override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
      override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
    }
    nsd.discoverServices("_amzn-wplay._tcp", NsdManager.PROTOCOL_DNS_SD, listener)
    try {
      delay(windowMs)
    } finally {
      runCatching { nsd.stopServiceDiscovery(listener) }
    }
    // One TV can be found once per network interface, and a resolve can miss the TXT record, so a host keeps the first name any resolve read.
    return services.toList()
      .mapNotNull { resolve(nsd, it) }
      .groupBy({ it.first }, { it.second })
      .map { (host, names) -> mapOf("host" to host, "name" to names.firstNotNullOfOrNull { it }) }
  }

  /** The service's IPv4 address and the friendly name it advertises in its `n` TXT key. */
  @Suppress("DEPRECATION")
  private suspend fun resolve(nsd: NsdManager, service: NsdServiceInfo): Pair<String, String?>? = withTimeoutOrNull(2000) {
    suspendCancellableCoroutine { continuation ->
      val listener = object : NsdManager.ResolveListener {
        override fun onServiceResolved(resolved: NsdServiceInfo) {
          val host = (resolved.host as? Inet4Address)?.hostAddress
          val name = resolved.attributes["n"]?.toString(Charsets.UTF_8)?.trim()?.takeIf { it.isNotEmpty() }
          continuation.resume(host?.let { it to name })
        }

        override fun onResolveFailed(failed: NsdServiceInfo, errorCode: Int) {
          continuation.resume(null)
        }
      }
      nsd.resolveService(service, listener)
      continuation.invokeOnCancellation {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) runCatching { nsd.stopServiceResolution(listener) }
      }
    }
  }

  // A missing Wi-Fi service only costs latency, never control, so this never throws into JS.
  private fun setWifiLock(enabled: Boolean) {
    runCatching {
      val lock = wifiLock ?: createWifiLock()?.also { wifiLock = it }
      if (lock != null) {
        if (enabled && !lock.isHeld) lock.acquire()
        if (!enabled && lock.isHeld) lock.release()
      }
    }
  }

  private fun createWifiLock(): WifiManager.WifiLock? {
    val context = appContext.reactContext?.applicationContext ?: return null
    val manager = context.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return null
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      WifiManager.WIFI_MODE_FULL_LOW_LATENCY
    } else {
      @Suppress("DEPRECATION")
      WifiManager.WIFI_MODE_FULL_HIGH_PERF
    }
    return manager.createWifiLock(mode, "TarangRemote").apply { setReferenceCounted(false) }
  }
}
