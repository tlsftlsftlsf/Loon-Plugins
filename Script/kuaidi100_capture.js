// ============================================
// Loon / Quantumult X 脚本：快递100 凭据自动捕获
// 捕获 getWaybillRecord、getStatusByWaybillNo 的 ts, sign, Cookie, Headers
// ============================================

// ====== 配置项 ======
const BARK_KEY = "BApQ6cMJmhpRwiWGQJmJJj"; // 可选：Bark 设备 Key (若不需要 Bark 可设为空字符串)
const ENABLE_BARK = true;                  // 是否启用 Bark 推送
const ENABLE_LOON_NOTIFY = true;           // 是否启用 Loon 本地通知

// 目标API配置
const TARGET_APIS = [
    {
        name: "快递100-面单记录",
        pattern: /api[0-5]?\.kuaidihelp\.com.*getWaybillRecord/,
        storageKey: "kuaidi100_waybill_record",
        cookieKey: "kuaidi100_cookie"
    },
    {
        name: "快递100-物流查询",
        pattern: /api[0-5]?\.kuaidihelp\.com.*getStatusByWaybillNo/,
        storageKey: "kuaidi100_status_query",
        cookieKey: "kuaidi100_cookie"
    }
];

// 存储操作封装 (兼容 Loon 与 Quantumult X)
function setStorage(key, value) {
    if (typeof $persistentStore !== "undefined" && $persistentStore.write) {
        return $persistentStore.write(value, key);
    }
    if (typeof $prefs !== "undefined" && $prefs.setValueForKey) {
        return $prefs.setValueForKey(value, key);
    }
    return false;
}

function getStorage(key) {
    if (typeof $persistentStore !== "undefined" && $persistentStore.read) {
        return $persistentStore.read(key);
    }
    if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
        return $prefs.valueForKey(key);
    }
    return null;
}

// 解析 URL-Encoded 的 body
function parseUrlEncoded(body) {
    if (!body) return {};
    if (typeof body === "object") return body;
    const result = {};
    const str = String(body);
    str.split("&").forEach(pair => {
        const [key, ...values] = pair.split("=");
        if (key) {
            const rawVal = values.join("=");
            try {
                result[key] = decodeURIComponent(rawVal);
            } catch (e) {
                result[key] = rawVal;
            }
        }
    });
    return result;
}

// 发送 Bark 推送通知
function sendBark(title, content, copyText, callback) {
    if (!ENABLE_BARK || !BARK_KEY) {
        if (callback) callback();
        return;
    }
    
    let finished = false;
    let timer = null;
    function doneCallback() {
        if (!finished) {
            finished = true;
            if (timer) clearTimeout(timer);
            if (callback) callback();
        }
    }
    
    try {
        timer = setTimeout(() => {
            console.log("⚠️ Bark 推送超时 (800ms)");
            doneCallback();
        }, 800);
    } catch (e) {}

    const postData = {
        title: title,
        body: content,
        group: "快递100",
        copy: copyText || "",
        icon: "https://gitlab.com/lodepuly/iconlibrary/-/raw/main/App_icon/120px/KuaiDi100.png"
    };

    if (typeof $httpClient !== "undefined" && $httpClient.post) {
        $httpClient.post({
            url: "https://api.day.app/" + BARK_KEY,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(postData)
        }, function(err, resp, data) {
            if (err) console.log("❌ Bark 推送失败: " + err);
            else console.log("✅ Bark 推送成功");
            doneCallback();
        });
    } else {
        doneCallback();
    }
}

// 主捕获逻辑
function captureRequest() {
    if (typeof $request === "undefined" || !$request || !$request.url) {
        if (typeof $done !== "undefined") $done({});
        return;
    }

    const api = TARGET_APIS.find(item => item.pattern.test($request.url));
    if (!api) {
        if (typeof $done !== "undefined") $done({});
        return;
    }

    console.log(`🔍 匹配到目标接口: ${api.name}`);

    try {
        // 1. 解析请求参数 (ts, sign)
        const params = parseUrlEncoded($request.body);
        const data = {
            ts: params.ts || "",
            sign: params.sign || "",
            lastUpdated: new Date().toISOString()
        };

        // 2. 存储数据并验证
        const dataSaved = setStorage(api.storageKey, JSON.stringify(data));
        const verify = getStorage(api.storageKey);
        if (!verify && !dataSaved) throw new Error("存储 data 失败");

        // 3. 提取并存储完整的 headers
        const headers = $request.headers || {};
        setStorage("kuaidi100_headers", JSON.stringify(headers));
        console.log(`📋 Headers 存储成功`);

        // 4. 提取并存储 cookie (不区分大小写匹配)
        let cookie = "";
        for (const k of Object.keys(headers)) {
            if (k.toLowerCase() === "cookie") {
                cookie = headers[k];
                break;
            }
        }
        if (cookie) {
            setStorage(api.cookieKey, cookie);
            console.log(`🍪 Cookie 存储成功 [${api.name}]: ${cookie.substring(0, 30)}...`);
            data.cookieStored = true;
        }

        console.log(`✅ 存储成功 [${api.name}]:\n${JSON.stringify(data, null, 2)}`);

        // 5. 构建通知内容
        const title = `📦 ${api.name}`;
        const subtitle = `TS: ${data.ts || "无"}`;
        const body = `SIGN: ${data.sign || "无"}${data.cookieStored ? "\n🍪 Cookie已更新" : ""}`;
        const copyContent = data.sign || cookie || data.ts || "";

        // 6. 发送 Loon 本地通知
        if (ENABLE_LOON_NOTIFY) {
            if (typeof $notification !== "undefined" && $notification.post) {
                $notification.post(title, subtitle, body, {
                    clipboard: copyContent
                });
            } else if (typeof $notify !== "undefined") {
                $notify(title, subtitle, body);
            }
        }

        // 7. 发送 Bark 推送并放行
        if (ENABLE_BARK && BARK_KEY) {
            sendBark(title, `${subtitle}\n${body}`, copyContent, function() {
                if (typeof $done !== "undefined") $done({});
            });
            return;
        }

    } catch (e) {
        console.log(`❌ 捕获失败: ${e.message}`);
        if (ENABLE_LOON_NOTIFY) {
            if (typeof $notification !== "undefined" && $notification.post) {
                $notification.post("快递100捕获错误", "", e.message);
            } else if (typeof $notify !== "undefined") {
                $notify("快递100捕获错误", "", e.message);
            }
        }
    }

    if (typeof $done !== "undefined") $done({});
}

captureRequest();
