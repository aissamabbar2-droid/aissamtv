package tv.opentv.app;

import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * «المساعد المحلي» داخل تطبيق الأندرويد — نفس عمل OpenTV.exe على الحاسوب.
 * صفحة التطبيق تطلب عناوين على نطاقها نفسه (…/aissamtv/__opentv__/p?t=…&u=…)،
 * فيلتقطها التطبيق قبل خروجها ويجلب المحتوى الأصلي بنفسه، بلا قيود CORS ولا مشاكل «محتوى مختلط».
 * كل طلب يجب أن يحمل مفتاحاً عشوائياً يتغيّر مع كل تشغيل للتطبيق.
 */
final class Relay {
    static final String PREFIX = MainActivity.HOME + "__opentv__/";
    private static final Pattern URI_ATTR = Pattern.compile("URI=\"([^\"]+)\"");
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d+)-(\\d*)");
    private static final String DEFAULT_UA = "VLC/3.0.20 LibVLC/3.0.20";
    private static SSLSocketFactory trustAll;

    final String token;

    Relay() {
        byte[] b = new byte[16];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
        token = sb.toString();
    }

    /** يُرجع null لكل الطلبات العادية؛ ويتولى فقط طلبات المساعد. */
    WebResourceResponse intercept(Uri uri, String method, Map<String, String> requestHeaders) {
        String url = uri.toString();
        if (!url.startsWith(PREFIX)) return null;
        try {
            if (!token.equals(uri.getQueryParameter("t"))) return text(403, "bad token");
            String path = url.substring(PREFIX.length());
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            if (path.equals("ping")) return text(200, "ok");
            if (path.equals("p")) return relay(uri, method == null ? "GET" : method.toUpperCase(Locale.ROOT), requestHeaders);
            return text(404, "not found");
        } catch (Exception e) {
            return text(502, String.valueOf(e.getMessage()));
        }
    }

    private static Map<String, String> cors() {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
        h.put("Cache-Control", "no-store");
        return h;
    }

    private static WebResourceResponse text(int status, String body) {
        return new WebResourceResponse("text/plain", "utf-8", status, status < 400 ? "OK" : "Error", cors(),
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }

    private static synchronized SSLSocketFactory trustAllFactory() throws Exception {
        if (trustAll == null) {
            TrustManager[] tm = { new X509TrustManager() {
                @Override public void checkClientTrusted(X509Certificate[] c, String a) { }
                @Override public void checkServerTrusted(X509Certificate[] c, String a) { }
                @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            } };
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, tm, new SecureRandom());
            trustAll = ctx.getSocketFactory();
        }
        return trustAll;
    }

    private static String header(Map<String, String> headers, String name) {
        if (headers == null) return null;
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(name)) return e.getValue();
        }
        return null;
    }

    private WebResourceResponse relay(Uri uri, String method, Map<String, String> inHeaders) throws Exception {
        String target = uri.getQueryParameter("u");
        if (target == null || !(target.startsWith("http://") || target.startsWith("https://"))) return text(400, "bad url");
        if (!method.equals("GET") && !method.equals("HEAD")) return text(405, "method not allowed");
        String ref = uri.getQueryParameter("r");
        String ua = uri.getQueryParameter("a");
        String range = header(inHeaders, "Range");

        URL current = new URL(target);
        HttpURLConnection c = null;
        int status = 0;
        // نتبع التحويلات يدوياً (HttpURLConnection لا يتبع التحويل من http إلى https)
        for (int i = 0; i < 8; i++) {
            c = (HttpURLConnection) current.openConnection();
            if (c instanceof HttpsURLConnection) {
                ((HttpsURLConnection) c).setSSLSocketFactory(trustAllFactory());
                ((HttpsURLConnection) c).setHostnameVerifier((host, session) -> true);
            }
            c.setInstanceFollowRedirects(false);
            c.setRequestMethod(method);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", ua == null || ua.isEmpty() ? DEFAULT_UA : ua);
            if (ref != null && !ref.isEmpty()) c.setRequestProperty("Referer", ref);
            c.setRequestProperty("Accept", "*/*");
            c.setRequestProperty("Accept-Encoding", "identity");
            if (range != null && RANGE.matcher(range).matches()) c.setRequestProperty("Range", range);
            status = c.getResponseCode();
            String loc = c.getHeaderField("Location");
            if (status >= 300 && status < 400 && loc != null) {
                current = new URL(current, loc);
                c.disconnect();
                continue;
            }
            break;
        }
        if (status < 100 || (status >= 300 && status < 400)) {
            c.disconnect();
            return text(502, "too many redirects");
        }

        String ctype = c.getContentType() == null ? "" : c.getContentType();
        String mime = ctype.isEmpty() ? "application/octet-stream" : ctype.split(";")[0].trim();
        InputStream body = status >= 400 ? c.getErrorStream() : c.getInputStream();
        if (body == null) body = new ByteArrayInputStream(new byte[0]);
        long len = c.getContentLengthLong();
        boolean hlsLike = ctype.toLowerCase(Locale.ROOT).contains("mpegurl")
                || current.getPath().toLowerCase(Locale.ROOT).endsWith(".m3u8");

        Map<String, String> headers = cors();
        String reason = status < 400 ? "OK" : "Error";

        if (hlsLike && method.equals("GET") && status < 300 && (len < 0 || len < 64L * 1024 * 1024)) {
            String txt = new String(readAll(body), StandardCharsets.UTF_8);
            c.disconnect();
            if (txt.contains("#EXT-X-")) txt = rewriteHls(txt, current);
            return new WebResourceResponse("application/vnd.apple.mpegurl", "utf-8", status, reason, headers,
                    new ByteArrayInputStream(txt.getBytes(StandardCharsets.UTF_8)));
        }

        String cr = c.getHeaderField("Content-Range");
        if (cr != null) headers.put("Content-Range", cr);
        String ar = c.getHeaderField("Accept-Ranges");
        if (ar != null) headers.put("Accept-Ranges", ar);
        if (len >= 0) headers.put("Content-Length", String.valueOf(len));

        final HttpURLConnection conn = c;
        InputStream stream = new FilterInputStream(body) {
            @Override public void close() throws IOException {
                try { super.close(); } finally { conn.disconnect(); }
            }
        };
        return new WebResourceResponse(mime, null, status, reason, headers, stream);
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        in.close();
        return bos.toByteArray();
    }

    /** يجعل كل الروابط داخل قائمة HLS مطلقة، ليمرّر التطبيق المقاطع عبر المساعد أيضاً. */
    private static String rewriteHls(String text, URL base) {
        StringBuilder sb = new StringBuilder(text.length() + 1024);
        for (String raw : text.split("\n", -1)) {
            String line = raw.endsWith("\r") ? raw.substring(0, raw.length() - 1) : raw;
            String t = line.trim();
            if (t.isEmpty()) { sb.append('\n'); continue; }
            if (t.startsWith("#")) {
                Matcher m = URI_ATTR.matcher(line);
                StringBuffer sbuf = new StringBuffer();
                while (m.find()) m.appendReplacement(sbuf, Matcher.quoteReplacement("URI=\"" + absolute(base, m.group(1)) + "\""));
                m.appendTail(sbuf);
                sb.append(sbuf);
            } else {
                sb.append(absolute(base, t));
            }
            sb.append('\n');
        }
        return sb.toString();
    }

    private static String absolute(URL base, String s) {
        try { return new URL(base, s).toString(); } catch (Exception e) { return s; }
    }
}
