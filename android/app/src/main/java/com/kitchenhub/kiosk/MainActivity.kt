package com.kitchenhub.kiosk

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CaptureRequest
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.Range
import android.util.Size
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.core.CameraInfo
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import com.kitchenhub.kiosk.logic.BrightnessMachine
import com.kitchenhub.kiosk.logic.LumaSampler
import com.kitchenhub.kiosk.logic.MotionDiff
import com.kitchenhub.kiosk.logic.StartUrl
import com.kitchenhub.kiosk.logic.Watchdog
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val machine = BrightnessMachine()
    private val watchdog = Watchdog()
    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var cameraExecutor: ExecutorService
    private var settingsDialog: AlertDialog? = null
    private var lastMotionPostMs = 0L
    private var downX = 0f
    private var downY = 0f
    private var previousLuma: IntArray? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var generation = 0

    private val longPress = Runnable { showSettings() }
    private val tick = object : Runnable {
        override fun run() {
            val now = now()
            applyLevel(machine.tick(now))
            considerReload()
            ping()
            mainHandler.postDelayed(this, TICK_MS)
        }
    }

    private val cameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            startCamera(preferId = true, limitFps = true)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUi()
        cameraExecutor = Executors.newSingleThreadExecutor()
        root = FrameLayout(this)
        setContentView(root)
        webView = buildWebView()
        root.addView(webView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        applyLevel(machine.start(now()))
        watchdog.start(now())
        webView.loadUrl(currentUrl())
        mainHandler.postDelayed(tick, TICK_MS)
        listenForNetwork()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startCamera(preferId = true, limitFps = true)
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
        applyLevel(machine.level())
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUi()
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        networkCallback?.let { callback ->
            val cm = getSystemService(ConnectivityManager::class.java)
            try {
                cm.unregisterNetworkCallback(callback)
            } catch (err: RuntimeException) {
                Log.w(TAG, "unregister network", err)
            }
        }
        if (this::cameraExecutor.isInitialized) {
            cameraExecutor.shutdown()
        }
        if (this::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
    }

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    private fun buildWebView(): WebView {
        val view = WebView(this)
        val mine = ++generation
        val settings = view.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        WebView.setWebContentsDebuggingEnabled(true)
        view.setBackgroundColor(android.graphics.Color.BLACK)
        view.addJavascriptInterface(
            KioskBridge(
                mainHandler,
                onLevels = { bright, dim ->
                    applyLevel(machine.setLevels(bright, dim))
                },
                onActivity = {
                    applyLevel(machine.activity(now()))
                },
                onHeartbeat = {
                    watchdog.beat(now())
                }
            ),
            "KitchenKiosk"
        )
        view.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                request.deny()
            }
        }
        view.webViewClient = object : WebViewClient() {
            override fun onPageFinished(finished: WebView?, url: String?) {
                if (mine == generation) {
                    watchdog.start(now())
                }
            }

            override fun shouldOverrideUrlLoading(source: WebView?, request: WebResourceRequest?): Boolean {
                return false
            }

            override fun onRenderProcessGone(source: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                if (mine != generation) {
                    return true
                }
                Log.e(TAG, "renderer gone")
                watchdog.onRendererGone()
                mainHandler.post { considerReload() }
                return true
            }
        }
        view.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.x
                    downY = event.y
                    applyLevel(machine.activity(now()))
                    mainHandler.removeCallbacks(longPress)
                    mainHandler.postDelayed(longPress, LONG_PRESS_MS)
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.x - downX
                    val dy = event.y - downY
                    if (dx * dx + dy * dy > 24f * 24f) {
                        mainHandler.removeCallbacks(longPress)
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    mainHandler.removeCallbacks(longPress)
                }
            }
            false
        }
        return view
    }

    private fun currentUrl(): String {
        val saved = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_URL, null)
        return StartUrl.normalize(saved)
    }

    private fun showSettings() {
        if (isFinishing || settingsDialog?.isShowing == true) {
            return
        }
        val input = EditText(this)
        input.setText(currentUrl())
        input.setSelection(input.text.length)
        input.hint = getString(R.string.settings_hint)
        settingsDialog = AlertDialog.Builder(this)
            .setTitle(R.string.settings_title)
            .setView(input)
            .setPositiveButton(R.string.settings_save) { _, _ ->
                val url = StartUrl.normalize(input.text?.toString())
                getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(PREF_URL, url)
                    .apply()
                watchdog.markReloaded(now())
                replaceWebView()
            }
            .setNegativeButton(R.string.settings_cancel, null)
            .create()
        settingsDialog?.show()
    }

    private fun considerReload() {
        val reason = watchdog.poll(now()) ?: return
        Log.i(TAG, "reload $reason")
        watchdog.markReloaded(now())
        replaceWebView()
    }

    private fun replaceWebView() {
        val fresh = buildWebView()
        val dead = webView
        root.removeView(dead)
        webView = fresh
        root.addView(webView, 0, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        dead.destroy()
        webView.loadUrl(currentUrl())
        previousLuma = null
    }

    private fun ping() {
        val mine = generation
        try {
            webView.evaluateJavascript("1") {
                if (mine == generation) {
                    watchdog.beat(now())
                }
            }
        } catch (err: RuntimeException) {
            Log.w(TAG, "ping", err)
        }
    }

    private fun applyLevel(level: Int) {
        val attrs = window.attributes
        val brightness = if (machine.level() == level) {
            machine.windowBrightness()
        } else {
            val fraction = level.coerceIn(0, 255) / 255f
            if (fraction < 0.01f) 0.01f else fraction
        }
        if (attrs.screenBrightness != brightness) {
            attrs.screenBrightness = brightness
            window.attributes = attrs
        }
    }

    private fun onMotion() {
        val now = now()
        if (now - lastMotionPostMs < 500L) {
            return
        }
        lastMotionPostMs = now
        applyLevel(machine.activity(now))
    }

    private fun startCamera(preferId: Boolean, limitFps: Boolean) {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = try {
                future.get()
            } catch (err: Exception) {
                Log.e(TAG, "camera provider", err)
                return@addListener
            }
            bindCamera(provider, preferId, limitFps)
        }, ContextCompat.getMainExecutor(this))
    }

    private fun bindCamera(provider: ProcessCameraProvider, preferId: Boolean, limitFps: Boolean) {
        try {
            provider.unbindAll()
            val analysis = buildAnalysis(limitFps)
            provider.bindToLifecycle(this, cameraSelector(preferId), analysis)
            Log.i(TAG, "camera bound preferId=$preferId fps=$limitFps")
        } catch (err: Exception) {
            Log.e(TAG, "camera bind preferId=$preferId fps=$limitFps", err)
            if (limitFps) {
                bindCamera(provider, preferId, false)
            } else if (preferId) {
                bindCamera(provider, false, false)
            }
        }
    }

    private fun cameraSelector(preferId: Boolean): CameraSelector {
        return CameraSelector.Builder()
            .addCameraFilter { infos ->
                pickCamera(infos, preferId)
            }
            .build()
    }

    private fun pickCamera(infos: List<CameraInfo>, preferId: Boolean): List<CameraInfo> {
        if (preferId) {
            val match = infos.filter { info ->
                try {
                    Camera2CameraInfo.from(info).cameraId == FRONT_CAMERA_ID
                } catch (err: Exception) {
                    false
                }
            }
            if (match.isNotEmpty()) {
                return match
            }
        }
        val front = infos.filter { it.lensFacing == CameraSelector.LENS_FACING_FRONT }
        if (front.isNotEmpty()) {
            return front
        }
        return infos
    }

    private fun buildAnalysis(limitFps: Boolean): ImageAnalysis {
        val strategy = ResolutionStrategy(
            Size(320, 240),
            ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER
        )
        val builder = ImageAnalysis.Builder()
            .setResolutionSelector(
                ResolutionSelector.Builder().setResolutionStrategy(strategy).build()
            )
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
        if (limitFps) {
            Camera2Interop.Extender(builder).setCaptureRequestOption(
                CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                Range(5, 5)
            )
        }
        val analysis = builder.build()
        analysis.setAnalyzer(cameraExecutor) { image ->
            try {
                val plane = image.planes[0]
                val buffer = plane.buffer
                val bytes = ByteArray(buffer.remaining())
                buffer.get(bytes)
                val sample = LumaSampler.sample(
                    bytes,
                    image.width,
                    image.height,
                    plane.rowStride,
                    32,
                    24
                )
                if (sample != null) {
                    val prev = previousLuma
                    previousLuma = sample
                    if (prev != null && MotionDiff.hit(prev, sample, MOTION_SENSITIVITY)) {
                        mainHandler.post { onMotion() }
                    }
                }
            } catch (err: RuntimeException) {
                Log.w(TAG, "frame", err)
            } finally {
                image.close()
            }
        }
        return analysis
    }

    private fun listenForNetwork() {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onLost(network: Network) {
                watchdog.onNetworkLost()
            }

            override fun onAvailable(network: Network) {
                watchdog.onNetworkRestored()
                mainHandler.post { considerReload() }
            }
        }
        networkCallback = callback
        cm.registerNetworkCallback(request, callback)
    }

    private fun now(): Long {
        return SystemClock.elapsedRealtime()
    }

    companion object {
        private const val TAG = "KitchenKiosk"
        private const val PREFS = "kiosk"
        private const val PREF_URL = "startUrl"
        private const val TICK_MS = 5_000L
        private const val LONG_PRESS_MS = 3_000L
        private const val FRONT_CAMERA_ID = "1"
        private const val MOTION_SENSITIVITY = 92
    }
}
