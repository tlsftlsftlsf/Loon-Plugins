// ==============================================================================
// Loon / Quantumult X 脚本：快递100 凭据自动捕获与联动未签收查询
// 1. 自动捕获 getWaybillRecord、getStatusByWaybillNo 的 ts, sign, Cookie, Headers
// 2. 捕获成功后，可自动触发非中通未签收运单并发查询并推送 Bark (分组: 快递相关)
// ==============================================================================

// ====== 配置项 ======
const BARK_KEY = "BApQ6cMJmhpRwiWGQJmJJj"; // Bark 设备 Key (留空则不推送)
const ENABLE_BARK = true;                  // 是否启用 Bark 推送
const BARK_GROUP = "快递相关";              // Bark 消息分组统一为「快递相关」
const ENABLE_LOON_NOTIFY = true;           // 是否启用 Loon 本地通知
const AUTO_RUN_QUERY = true;               // 抓到面单凭据后是否自动触发未签收查单
const QUERY_COOLDOWN_SECONDS = 180;        // 自动查单冷却时间(秒)，避免 App 内翻页频繁重查
const NOTIFY_ON_CAPTURE = false;           // 仅凭据捕获时是否弹窗 (开启自动查单后建议设为 false，直接看查单结果)

// 快递查询配置
const QUERY_CONFIG = {
    MAX_DISPLAY: 5,
    LOGIN_API: {
        URL: "https://pdanew.yto56.com.cn:49195/opYZUpload/stage/loginNew",
        HEADERS: {
            "Host": "pdanew.yto56.com.cn:49195",
            "Content-Type": "application/json",
            "User-Agent": "YtoStation/6.7.64 (iPhone; iOS 15.4.1; Scale/3.00)",
            "pdaVersionNo": "6.7.64",
            "pdaVersionCode": "2080",
            "pdaDeviceType": "YZ-IOS",
            "pdaDeviceNo": "D9BDDD83-0366-494D-8350-F684C92B4EBB",
            "serialNo": "D9BDDD83-0366-494D-8350-F684C92B4EBB",
            "stationCode": "0000765271",
            "orgCode": "710007",
            "loginUserCode": "02454099",
            "loginUserName": "17682349867",
            "userName": "17682349867"
        },
        BODY: {
            "encryptWord": "+huLh/mooBrJxJezu0IpBw==",
            "username": "17682349867",
            "password": "hqAeSrr6y35veiVY4OqcZg=="
        },
        STORAGE_KEY: "mamayz_token",
        STORAGE_TIME_KEY: "mamayz_token_updated",
        TTL_HOURS: 12 // 缓存有效时长 (小时)
    },
    QUERY_API: {
        URL: "https://yizhan.mamayz.com:48081/opYZApp9193/opYZApp/track/queryTrack",
        MAX_CONCURRENT: 20,
        TIMEOUT_MS: 15000
    },
    WAYBILL_URL: "https://api.kuaidihelp.com/g_order_core/v2/image/Save/getWaybillRecord",
    DEFAULT_HEADERS: {
        "host": "api.kuaidihelp.com",
        "content-type": "application/x-www-form-urlencoded;charset=utf8",
        "version": "11.4.0",
        "channel": "kdy",
        "appversion": "11400",
        "user-agent": "KuaiDiYuan_S/2 CFNetwork/1331.0.7 Darwin/21.4.0",
        "pname": "ioss"
    },
    SIGNED_KEYWORDS: [
        "已签收", "签收成功", "本人签收", "家人代收", "代收", "亲友代收",
        "物业代收", "门卫代收", "驿站签收", "送货上门", "已取件", "已领取",
        "妥投", "签收", "驿站代收"
    ],
    ZTO_PREFIXES: ["79", "73", "76", "75", "74"]
};

// 目标API配置
const TARGET_APIS = [
    {
        name: "快递100-面单记录",
        pattern: /api[0-5]?\.kuaidihelp\.com.*getWaybillRecord/,
        storageKey: "kuaidi100_waybill_record",
        cookieKey: "kuaidi100_cookie",
        canTriggerQuery: true
    },
    {
        name: "快递100-物流查询",
        pattern: /api[0-5]?\.kuaidihelp\.com.*getStatusByWaybillNo/,
        storageKey: "kuaidi100_status_query",
        cookieKey: "kuaidi100_cookie",
        canTriggerQuery: false
    }
];

// ==================== 工具函数 ====================

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

function toFormData(obj) {
    return Object.keys(obj)
        .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]))
        .join("&");
}

function httpFetch(options) {
    return new Promise((resolve, reject) => {
        const method = (options.method || "GET").toLowerCase();
        if (typeof $httpClient !== "undefined" && $httpClient[method]) {
            $httpClient[method](options, (error, response, data) => {
                if (error) {
                    reject(new Error(typeof error === "string" ? error : JSON.stringify(error)));
                } else {
                    resolve({
                        statusCode: response ? (response.status || response.statusCode) : 200,
                        headers: response ? response.headers : {},
                        body: data
                    });
                }
            });
        } else if (typeof $task !== "undefined" && $task.fetch) {
            $task.fetch(options).then(resolve, reject);
        } else {
            reject(new Error("当前环境不支持 HTTP 请求"));
        }
    });
}

function sendNotification(title, subtitle, body, attach) {
    if (typeof $notification !== "undefined" && $notification.post) {
        $notification.post(title, subtitle, body, attach);
    } else if (typeof $notify !== "undefined") {
        $notify(title, subtitle, body);
    } else {
        console.log(`[通知] ${title} | ${subtitle}\n${body}`);
    }
}

async function sendBark(title, content, copyText) {
    if (!ENABLE_BARK || !BARK_KEY) return;
    const postData = {
        title: title,
        body: content,
        group: BARK_GROUP,
        copy: copyText || "",
        icon: "https://gitlab.com/lodepuly/iconlibrary/-/raw/main/App_icon/120px/KuaiDi100.png"
    };

    try {
        await httpFetch({
            method: "POST",
            url: "https://api.day.app/" + BARK_KEY,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(postData)
        });
        console.log("✅ Bark 推送成功");
    } catch (e) {
        console.log("❌ Bark 推送失败: " + e.message);
    }
}

function shouldRunAutoQuery() {
    if (!AUTO_RUN_QUERY) return false;
    const lastRun = getStorage("kuaidi100_last_auto_query_time");
    if (!lastRun) return true;
    const elapsed = (Date.now() - parseInt(lastRun, 10)) / 1000;
    if (elapsed < QUERY_COOLDOWN_SECONDS) {
        console.log(`⏳ 距上次自动查单仅 ${Math.round(elapsed)}秒 (冷却时间: ${QUERY_COOLDOWN_SECONDS}秒)，本次跳过查单`);
        return false;
    }
    return true;
}

// ==================== 联动未签收查询业务 ====================

/**
 * 自动获取或刷新妈妈驿站登录 Token
 */
async function getMamaToken(forceRefresh = false) {
    if (!forceRefresh) {
        const cached = getStorage(QUERY_CONFIG.LOGIN_API.STORAGE_KEY);
        const lastTime = getStorage(QUERY_CONFIG.LOGIN_API.STORAGE_TIME_KEY);
        if (cached && lastTime) {
            const ageHours = (Date.now() - parseInt(lastTime, 10)) / (1000 * 60 * 60);
            if (ageHours < QUERY_CONFIG.LOGIN_API.TTL_HOURS) {
                console.log(`🔑 使用缓存的妈妈驿站 Token (已缓存 ${ageHours.toFixed(1)}h)`);
                return cached;
            }
            console.log(`⏰ 妈妈驿站 Token 已超 ${QUERY_CONFIG.LOGIN_API.TTL_HOURS}h，自动请求刷新...`);
        }
    }

    console.log("🔐 正在请求妈妈驿站登录接口获取最新 Token...");
    try {
        const resp = await httpFetch({
            method: "POST",
            url: QUERY_CONFIG.LOGIN_API.URL,
            headers: QUERY_CONFIG.LOGIN_API.HEADERS,
            body: JSON.stringify(QUERY_CONFIG.LOGIN_API.BODY)
        });

        let data = {};
        if (resp.body) {
            try { data = JSON.parse(resp.body); } catch (e) { data = resp.body; }
        }

        if (resp.statusCode === 200 && data.code === "200" && data.data && data.data.token) {
            const token = data.data.token;
            setStorage(QUERY_CONFIG.LOGIN_API.STORAGE_KEY, token);
            setStorage(QUERY_CONFIG.LOGIN_API.STORAGE_TIME_KEY, String(Date.now()));
            console.log(`✅ 妈妈驿站登录成功，获取到新 Token: ${token.substring(0, 15)}...`);
            return token;
        } else {
            throw new Error(`登录接口返回异常: ${data.message || JSON.stringify(data)}`);
        }
    } catch (e) {
        console.error(`❌ 获取妈妈驿站 Token 失败: ${e.message}`);
        return getStorage(QUERY_CONFIG.LOGIN_API.STORAGE_KEY) || "Fid5IHoOkO1PeMXzy672TOBw1zYMjaKLqpRspyho7ecimsJSY3Bw5B1zIEjs78GC";
    }
}

function isZTOWaybill(waybill) {
    return QUERY_CONFIG.ZTO_PREFIXES.some(prefix => waybill.startsWith(prefix));
}

function containsSignedKeyword(text) {
    if (!text) return false;
    return QUERY_CONFIG.SIGNED_KEYWORDS.some(kw => text.includes(kw));
}

function extractStatus(data) {
    if (data?.datas && Array.isArray(data.datas) && data.datas.length > 0) {
        const latest = data.datas[0];
        const status = latest.status || "";
        const desc = latest.desc || latest.remark || "";
        if (containsSignedKeyword(desc) || containsSignedKeyword(status)) {
            return "签收";
        }
        return status || "未知状态";
    }
    return "未知状态";
}

async function fetchStatus(waybill, token) {
    const startTime = Date.now();
    try {
        const fetchPromise = httpFetch({
            method: "POST",
            url: QUERY_CONFIG.QUERY_API.URL,
            headers: {
                "stationCode": QUERY_CONFIG.LOGIN_API.HEADERS.stationCode,
                "token": token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ waybillNo: waybill })
        });
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`超时 (${QUERY_CONFIG.QUERY_API.TIMEOUT_MS}ms)`)), QUERY_CONFIG.QUERY_API.TIMEOUT_MS);
        });

        const resp = await Promise.race([fetchPromise, timeoutPromise]);
        let data = {};
        if (resp.body) {
            try { data = JSON.parse(resp.body); } catch (e) { data = resp.body; }
        }
        const st = extractStatus(data);
        const elapsed = Date.now() - startTime;
        console.log(`  ✅ ${waybill} [${elapsed}ms] → ${st}`);
        return { waybill, status: st };
    } catch (e) {
        const elapsed = Date.now() - startTime;
        console.error(`  ❌ ${waybill} [${elapsed}ms]: ${e.message}`);
        throw e;
    }
}

async function batchQuery(waybills, token, maxConcurrent) {
    console.log(`🔄 开始并发查询 ${waybills.length} 个运单 (并发: ${maxConcurrent})...`);
    const activePackages = {};
    const failed = [];
    let signedCount = 0;

    for (let i = 0; i < waybills.length; i += maxConcurrent) {
        const batch = waybills.slice(i, i + maxConcurrent);
        const queryPromises = batch.map(async (waybill) => {
            try {
                const res = await fetchStatus(waybill, token);
                return { waybill, success: true, result: res };
            } catch (err) {
                return { waybill, success: false, error: err.message };
            }
        });

        const batchResults = await Promise.all(queryPromises);
        for (const item of batchResults) {
            if (!item.success) {
                failed.push(item.waybill);
                continue;
            }
            const { waybill, status } = item.result;
            if (QUERY_CONFIG.SIGNED_KEYWORDS.some(kw => status.includes(kw))) {
                signedCount++;
            } else {
                activePackages[waybill] = { waybill, status };
            }
        }
    }
    return { activePackages, failed, signedCount };
}

function buildGroupedNotification(activeList) {
    const groups = {};
    for (const item of activeList) {
        const st = item.status || "未知状态";
        if (!groups[st]) groups[st] = [];
        groups[st].push(item);
    }

    const sections = [];
    for (const [status, items] of Object.entries(groups)) {
        const header = `📌 ${status}（${items.length}个）`;
        const body = items
            .slice(0, QUERY_CONFIG.MAX_DISPLAY)
            .map(d => `  ${d.waybill}`)
            .join("\n");
        const extra = items.length > QUERY_CONFIG.MAX_DISPLAY
            ? `\n  ...及其他 ${items.length - QUERY_CONFIG.MAX_DISPLAY} 个`
            : "";
        sections.push(`${header}\n${body}${extra}`);
    }

    return {
        title: `共 ${activeList.length} 个未签收`,
        body: sections.join("\n\n")
    };
}

async function executeAutoQuery(ts, sign, headers) {
    console.log("⚡ [自动联动] 触发非中通未签收运单自动查询...");
    setStorage("kuaidi100_last_auto_query_time", String(Date.now()));

    try {
        const mergedHeaders = { ...QUERY_CONFIG.DEFAULT_HEADERS, ...headers };
        const formData = toFormData({
            "lj": "112.750702",
            "lw": "32.099228",
            "did": "0D128463-263A-4A61-AC41-1A5554A4D8E2",
            "app_id": "10004",
            "ts": ts,
            "sign": sign,
            "devInfo": "Apple-iPhone 13 Pro Max",
            "devDetail": "{}",
            "data": JSON.stringify({
                "page": "1",
                "pageSize": "400",
                "search": "",
                "session_id": "647f48af168797938e9abf1a901c8c4c"
            })
        });

        const resp = await httpFetch({
            method: "POST",
            url: QUERY_CONFIG.WAYBILL_URL,
            headers: mergedHeaders,
            body: formData
        });

        let data = {};
        if (resp.body) {
            try { data = JSON.parse(resp.body); } catch (e) { data = resp.body; }
        }

        if (resp.statusCode !== 200 || data.code !== 0) {
            console.log(`⚠️ 运单请求失败: ${data.msg || "未知原因"}`);
            return;
        }

        const waybills = (data.data?.list || []).flatMap(g =>
            g.list ? g.list.map(it => it.waybill).filter(Boolean) : []
        );
        const uniqueWaybills = [...new Set(waybills)];
        const nonZTO = uniqueWaybills.filter(w => !isZTOWaybill(w));
        const skippedZTO = uniqueWaybills.length - nonZTO.length;

        console.log(`📊 运单获取成功: 总数${uniqueWaybills.length} (跳过中通${skippedZTO}件, 待查非中通${nonZTO.length}件)`);

        if (nonZTO.length === 0) {
            if (skippedZTO > 0) {
                console.log("ℹ️ 本批次全部为中通件，无需查询");
            }
            return;
        }

        const token = await getMamaToken();
        const { activePackages, failed, signedCount } = await batchQuery(nonZTO, token, QUERY_CONFIG.QUERY_API.MAX_CONCURRENT);
        const activeList = Object.values(activePackages);
        const activeCount = activeList.length;

        if (activeCount > 0) {
            const { title, body } = buildGroupedNotification(activeList);
            let subTitle = "";
            if (signedCount > 0) subTitle += `已过滤 ${signedCount} 个签收`;
            if (skippedZTO > 0) subTitle += `${subTitle ? "，" : ""}跳过 ${skippedZTO} 个中通`;
            if (failed.length > 0) subTitle += `${subTitle ? "，" : ""}${failed.length} 个查询失败`;

            const fullTitle = `未签收快递 (${title})`;
            const copyContent = activeList.map(d => `${d.waybill} ${d.status}`).join("\n");

            if (ENABLE_LOON_NOTIFY) {
                sendNotification(fullTitle, subTitle, body, { clipboard: copyContent });
            }
            if (ENABLE_BARK && BARK_KEY) {
                await sendBark(fullTitle, `${subTitle ? subTitle + "\n\n" : ""}${body}`, copyContent);
            }
        } else {
            console.log(`🎉 所有非中通运单均已签收 (${signedCount}件已签收)`);
        }
    } catch (e) {
        console.log(`❌ 自动查单异常: ${e.message}`);
    }
}

// ==================== 主入口函数 ====================

async function captureRequest() {
    if (typeof $request === "undefined" || !$request || !$request.url) {
        if (typeof $done !== "undefined") $done({});
        return;
    }

    const api = TARGET_APIS.find(item => item.pattern.test($request.url));
    if (!api) {
        if (typeof $done !== "undefined") $done({});
        return;
    }

    console.log(`🔍 匹配到接口: ${api.name}`);

    try {
        // 1. 解析请求参数 (ts, sign)
        const params = parseUrlEncoded($request.body);
        const data = {
            ts: params.ts || "",
            sign: params.sign || "",
            lastUpdated: new Date().toISOString()
        };

        // 2. 存储数据
        setStorage(api.storageKey, JSON.stringify(data));

        // 3. 提取并存储完整的 headers
        const headers = $request.headers || {};
        setStorage("kuaidi100_headers", JSON.stringify(headers));
        console.log(`📋 Headers 存储成功`);

        // 4. 提取并存储 cookie
        let cookie = "";
        for (const k of Object.keys(headers)) {
            if (k.toLowerCase() === "cookie") {
                cookie = headers[k];
                break;
            }
        }
        if (cookie) {
            setStorage(api.cookieKey, cookie);
            data.cookieStored = true;
        }

        console.log(`✅ 凭据存储成功 [${api.name}] (TS: ${data.ts}, SIGN: ${data.sign})`);

        // 5. 判断是否触发联动未签收查询
        if (api.canTriggerQuery && data.ts && data.sign && shouldRunAutoQuery()) {
            await executeAutoQuery(data.ts, data.sign, headers);
        } else if (NOTIFY_ON_CAPTURE) {
            // 仅在未执行查单且开启抓包弹窗时提醒
            const title = `📦 ${api.name}`;
            const subtitle = `TS: ${data.ts || "无"}`;
            const body = `SIGN: ${data.sign || "无"}${data.cookieStored ? "\n🍪 Cookie已更新" : ""}`;
            const copyContent = data.sign || cookie || data.ts || "";
            if (ENABLE_LOON_NOTIFY) {
                sendNotification(title, subtitle, body, { clipboard: copyContent });
            }
            if (ENABLE_BARK && BARK_KEY) {
                await sendBark(title, `${subtitle}\n${body}`, copyContent);
            }
        }

    } catch (e) {
        console.log(`❌ 捕获异常: ${e.message}`);
    } finally {
        if (typeof $done !== "undefined") $done({});
    }
}

captureRequest();
