package top.gvqi.bilispace;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

// Android host: the desktop bilibili site in a WebView with the same client script as Windows/Linux.
// The page talks to us through window.chrome.webview.postMessage, shimmed onto a JavaScript interface.
public class MainActivity extends Activity {
    static final Set<String> ALLOWED = new HashSet<>(Arrays.asList("www.bilibili.com", "search.bilibili.com", "space.bilibili.com", "t.bilibili.com",
            "passport.bilibili.com", "account.bilibili.com", "message.bilibili.com", "live.bilibili.com", "manga.bilibili.com"));
    static final String DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    static final String RELEASES = "https://api.github.com/repos/GuqiGG/Bili-Space/releases/latest";

    WebView web;
    FrameLayout root;
    View fullscreen;
    WebChromeClient.CustomViewCallback fullscreenDone;
    SharedPreferences store;
    JSONObject config, gm;
    final String token = Long.toHexString(new SecureRandom().nextLong());
    final Handler main = new Handler(Looper.getMainLooper());
    // Update state: what the latest release offers and whether its APK is downloaded.
    String updateVersion = "", updateUrl = "", updateNotes = "";
    File updateFile;
    boolean updateBusy;

    static boolean trusted(String url) {
        try { Uri u = Uri.parse(url); return "https".equals(u.getScheme()) && ALLOWED.contains(u.getHost()); } catch (Exception e) { return false; }
    }

    String asset(String name) {
        try (InputStream in = getAssets().open(name)) { return read(in); } catch (Exception e) { return ""; }
    }

    static String read(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] b = new byte[65536]; int n;
        while ((n = in.read(b)) > 0) out.write(b, 0, n);
        return out.toString("UTF-8");
    }

    JSONObject json(String text) { try { return new JSONObject(text); } catch (Exception e) { return new JSONObject(); } }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        store = getSharedPreferences("bili-space", MODE_PRIVATE);
        config = json(asset("web/defaults.json"));
        JSONObject saved = json(store.getString("config", "{}"));
        for (Iterator<String> k = saved.keys(); k.hasNext(); ) { String key = k.next(); try { config.put(key, saved.get(key)); } catch (Exception ignored) {} }
        gm = json(store.getString("gm", "{}"));

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // The desktop site, laid out at desktop width and scaled to the screen; pinch zoom stays available.
        s.setUserAgentString(DESKTOP_UA); s.setUseWideViewPort(true); s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true); s.setBuiltInZoomControls(true); s.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "BiliSpaceAndroid");
        String renderer = bridgeScript() + asset("web/renderer.js");
        boolean early = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (early) {
            Set<String> origins = new HashSet<>(); for (String h : ALLOWED) origins.add("https://" + h);
            WebViewCompat.addDocumentStartJavaScript(web, renderer, origins);
        }
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl(); String scheme = u.getScheme();
                if ("https".equals(scheme) || "http".equals(scheme)) return false;
                // bilibili:// and other app links: hand to the system if anything can open them, otherwise ignore.
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!early && trusted(url)) view.evaluateJavascript(renderer, null);
            }
            // The client's own files (fonts, onboarding media, what's-new) are served from the APK.
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!"bili-space.local".equals(u.getHost()) || u.getPath() == null) return null;
                String path = u.getPath().replaceFirst("^/", "");
                if (path.contains("..")) return null;
                try {
                    String type = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(android.webkit.MimeTypeMap.getFileExtensionFromUrl(path));
                    WebResourceResponse r = new WebResourceResponse(type == null ? "application/octet-stream" : type, "utf-8", getAssets().open("web/assets/" + path));
                    java.util.Map<String, String> h = new java.util.HashMap<>(); h.put("Access-Control-Allow-Origin", "*"); r.setResponseHeaders(h);
                    return r;
                } catch (Exception e) { return null; }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // Player fullscreen: the video view covers everything, system bars hidden.
            @Override public void onShowCustomView(View view, CustomViewCallback done) {
                if (fullscreen != null) { done.onCustomViewHidden(); return; }
                fullscreen = view; fullscreenDone = done;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            @Override public void onHideCustomView() {
                if (fullscreen == null) return;
                root.removeView(fullscreen); fullscreen = null;
                getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (fullscreenDone != null) fullscreenDone.onCustomViewHidden(); fullscreenDone = null;
            }
        });
        if (state != null) web.restoreState(state); else web.loadUrl("https://www.bilibili.com/");
    }

    String bridgeScript() {
        JSONObject payload = new JSONObject();
        try {
            JSONObject info = json(asset("web/app-info.json"));
            payload.put("appInfo", info); payload.put("config", config); payload.put("gm", gm);
            payload.put("runtime", new JSONObject().put("platform", "android").put("testing", false).put("running", false));
        } catch (Exception ignored) {}
        return "(()=>{if(window.top!==window)return;const token=" + JSONObject.quote(token) + ";window.__BILI_NATIVE__=" + payload
                + ";window.chrome=window.chrome||{};window.chrome.webview={postMessage:m=>BiliSpaceAndroid.post(JSON.stringify({token,message:m})),addEventListener(){},removeEventListener(){}};})();\n";
    }

    void send(String method, JSONObject value) {
        main.post(() -> web.evaluateJavascript("window.BiliSpace?." + method + "?.(" + value + ")", null));
    }

    void save() { store.edit().putString("config", config.toString()).putString("gm", gm.toString()).apply(); }

    class Bridge {
        @JavascriptInterface public void post(String raw) {
            main.post(() -> {
                try {
                    if (raw.length() > 256 * 1024) return;
                    JSONObject wrapper = new JSONObject(raw);
                    if (!token.equals(wrapper.optString("token"))) return;
                    if (!trusted(web.getUrl())) return;
                    handle(wrapper.getJSONObject("message"));
                } catch (Exception ignored) {}
            });
        }
    }

    void handle(JSONObject m) throws Exception {
        String type = m.optString("type"), action = m.optString("action");
        switch (type) {
            case "config": {
                JSONObject v = m.optJSONObject("value"); if (v == null) return;
                for (Iterator<String> k = v.keys(); k.hasNext(); ) { String key = k.next(); config.put(key, v.get(key)); }
                save(); break;
            }
            case "gm-set": gm.put(m.getString("key"), m.opt("value")); save(); break;
            case "navigate": if (trusted(m.optString("url"))) web.loadUrl(m.getString("url")); break;
            case "open-external": {
                Uri u = Uri.parse(m.optString("url"));
                if ("https".equals(u.getScheme())) try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                break;
            }
            case "window":
                if ("back".equals(action) && web.canGoBack()) web.goBack();
                else if ("forward".equals(action) && web.canGoForward()) web.goForward();
                else if ("reload".equals(action)) web.reload();
                else if ("minimize".equals(action)) moveTaskToBack(true);
                else if ("close".equals(action)) finish();
                break;
            case "navigation-state":
                if ("read".equals(action)) web.evaluateJavascript("window.__bsAcceptNavigationState?.(" + new JSONObject().put("back", web.canGoBack()).put("forward", web.canGoForward()).put("visible", 3).put("categoryVisible", false).put("route", "") + ")", null);
                break;
            case "copy-video-link": {
                String url = m.optString("url");
                ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Bili-Space", url));
                send("videoLinkCopied", new JSONObject().put("url", url).put("ok", true)); break;
            }
            case "updates": updates(action); break;
            default: break;
        }
    }

    // ---- In-app updates: the latest GitHub release's .apk, downloaded in the app and handed to the system installer.
    JSONObject updateStatus(String message) throws Exception {
        boolean available = !updateVersion.isEmpty() && newer(updateVersion, versionName());
        return new JSONObject().put("available", available).put("version", updateVersion).put("changelog", updateNotes)
                .put("busy", updateBusy).put("ready", available && updateFile != null && updateFile.exists()).put("message", message);
    }

    String versionName() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "0"; } }

    static boolean newer(String a, String b) {
        String[] x = a.replaceAll("[^0-9.]", "").split("\\."), y = b.replaceAll("[^0-9.]", "").split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length && !x[i].isEmpty() ? Integer.parseInt(x[i]) : 0, q = i < y.length && !y[i].isEmpty() ? Integer.parseInt(y[i]) : 0;
            if (p != q) return p > q;
        }
        return false;
    }

    void updates(String action) throws Exception {
        if ("install".equals(action) && updateFile != null && updateFile.exists()) { install(); return; }
        if ("download".equals(action) && !updateUrl.isEmpty() && !updateBusy) { download(); return; }
        if (updateBusy) { send("acceptUpdateStatus", updateStatus("正在下载更新…")); return; }
        updateBusy = true; send("acceptUpdateStatus", updateStatus("正在检查更新…"));
        new Thread(() -> {
            String message;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(RELEASES).openConnection();
                c.setRequestProperty("Accept", "application/vnd.github+json"); c.setConnectTimeout(10000); c.setReadTimeout(15000);
                JSONObject release = new JSONObject(read(c.getInputStream()));
                JSONArray assets = release.optJSONArray("assets"); String apk = "";
                for (int i = 0; assets != null && i < assets.length(); i++) {
                    String name = assets.getJSONObject(i).optString("name");
                    if (name.endsWith(".apk")) { apk = assets.getJSONObject(i).optString("browser_download_url"); break; }
                }
                String version = release.optString("tag_name").replaceFirst("^v", "");
                if (apk.isEmpty()) message = "最新版本 " + version + " 还没有安卓安装包";
                else { updateVersion = version; updateUrl = apk; updateNotes = release.optString("body"); message = newer(version, versionName()) ? "" : "已是最新版本"; }
            } catch (Exception e) { message = "检查更新失败，请检查网络"; }
            updateBusy = false;
            String text = message;
            main.post(() -> { try { send("acceptUpdateStatus", updateStatus(text)); } catch (Exception ignored) {} });
        }).start();
    }

    void download() throws Exception {
        updateBusy = true; send("acceptUpdateStatus", updateStatus("正在下载更新…"));
        File dir = new File(getCacheDir(), "updates"); dir.mkdirs();
        File target = new File(dir, "Bili-Space-" + updateVersion.replaceAll("[^0-9.]", "") + ".apk");
        String from = updateUrl;
        new Thread(() -> {
            String message = "";
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(from).openConnection(); c.setInstanceFollowRedirects(true); c.setConnectTimeout(10000); c.setReadTimeout(30000);
                long total = c.getContentLengthLong(), done = 0, shown = 0;
                File part = new File(target.getPath() + ".part");
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                    byte[] b = new byte[131072]; int n;
                    while ((n = in.read(b)) > 0) {
                        out.write(b, 0, n); done += n;
                        if (total > 0 && done - shown > total / 20) { shown = done; long pct = done * 100 / total; main.post(() -> { try { send("acceptUpdateStatus", updateStatus("正在下载更新… " + pct + "%")); } catch (Exception ignored) {} }); }
                    }
                }
                if (!part.renameTo(target)) throw new java.io.IOException();
                updateFile = target;
            } catch (Exception e) { message = "下载失败，请重试"; }
            updateBusy = false;
            String text = message;
            main.post(() -> { try { send("acceptUpdateStatus", updateStatus(text)); if (text.isEmpty()) install(); } catch (Exception ignored) {} });
        }).start();
    }

    void install() {
        // Android asks once for permission to install from this app; afterwards the system installer takes over.
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        Uri uri = FileProvider.getUriForFile(this, "top.gvqi.bilispace.updates", updateFile);
        startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    @Override public void onBackPressed() {
        if (fullscreen != null) { web.getWebChromeClient().onHideCustomView(); return; }
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }
}
