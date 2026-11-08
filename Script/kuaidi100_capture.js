// ==============================================================================
// Loon / Quantumult X 脚本：快递100 凭据自动捕获与联动未签收查询
// 1. 自动捕获 getWaybillRecord、getStatusByWaybillNo 的 ts, sign, Cookie, Headers
// 2. 捕获成功后，自动触发非中通未签收运单极速并发查询并推送 Bark (分组: 快递相关)
// 3. 内置已签收持久化缓存 + 动态 Token 自动续期 + 完整单号列表展示 (无截断)
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
        CONCURRENCY: 30,    // 极速并发数
        TIMEOUT_MS: 5000    // 单请求超时 (5秒，避免慢请求拖死整体)
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
    ZTO_PREFIXES: ["79", "73", "76", "75", "74"],
    SIGNED_CACHE_KEY: "kuaidi100_signed_cache",
    MAX_TOTAL_QUERY_MS: 7000 // 自动查单整体最大等待时间 (7秒)，防止拖卡 快递100 App
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

function getSignedCache() {
    const raw = getStorage(QUERY_CONFIG.SIGNED_CACHE_KEY);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
}

function saveSignedCache(cache) {
    const keys = Object.keys(cache);
    if (keys.length > 2500) {
        const trimmed = {};
        keys.slice(keys.length - 2000).forEach(k => { trimmed[k] = 1; });
        setStorage(QUERY_CONFIG.SIGNED_CACHE_KEY, JSON.stringify(trimmed));
    } else {
        setStorage(QUERY_CONFIG.SIGNED_CACHE_KEY, JSON.stringify(cache));
    }
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
        console.log(`⏳ 距上次自动查单仅 ${Math.round(elapsed)}秒 (冷却: ${QUERY_COOLDOWN_SECONDS}秒)，本次仅更新凭据`);
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
        const desc = latest.desc || latest.remark || latest.context || "";
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
        return { waybill, status: st, rawData: data, elapsed };
    } catch (e) {
        const elapsed = Date.now() - startTime;
        throw new Error(`${e.message} [${elapsed}ms]`);
    }
}

/**
 * 高性能工作池并发查询 (带 Token 失效自动刷新与重试)
 */
async function poolQuery(waybills, initialToken, concurrency) {
    console.log(`🔄 启动连续工作池并发查询 (待查: ${waybills.length}件, 并发数: ${concurrency})...`);
    const activePackages = {};
    const failed = [];
    let signedCount = 0;
    const signedCache = getSignedCache();
    let currentToken = initialToken;
    let isRefreshingToken = false;
    let index = 0;

    async function worker() {
        while (index < waybills.length) {
            const waybill = waybills[index++];
            try {
                let res = await fetchStatus(waybill, currentToken);
                // 检查是否返回登录失效
                const isTokenExpired = res.rawData && (
                    res.rawData.code === "E0000" ||
                    (res.rawData.message && (res.rawData.message.includes("登入已失效") || res.rawData.message.includes("重新登入")))
                );

                if (isTokenExpired) {
                    if (!isRefreshingToken) {
                        isRefreshingToken = true;
                        try {
                            console.log(`⚠️ 检测到妈妈驿站 Token 失效，强制刷新中...`);
                            currentToken = await getMamaToken(true);
                        } finally {
                            isRefreshingToken = false;
                        }
                    }
                    // 使用新 Token 重试一次
                    res = await fetchStatus(waybill, currentToken);
                }

                const { status, elapsed } = res;
                if (QUERY_CONFIG.SIGNED_KEYWORDS.some(kw => status.includes(kw))) {
                    signedCount++;
                    signedCache[waybill] = 1; // 写入已签收永久缓存
                } else {
                    activePackages[waybill] = { waybill, status };
                    console.log(`  📦 未签收: ${waybill} [${elapsed}ms] → ${status}`);
                }
            } catch (err) {
                console.error(`  ❌ 查询失败 [${waybill}]: ${err.message}`);
                failed.push(waybill);
            }
        }
    }

    const workers = [];
    const actualConcurrency = Math.min(concurrency, waybills.length);
    for (let i = 0; i < actualConcurrency; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    saveSignedCache(signedCache);
    return { activePackages, failed, signedCount };
}

/**
 * 完整分组通知构建（不截断，完整展示所有单号）
 */
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
        // 完整展示所有单号列表，不截断
        const body = items
            .map((d, idx) => `  ${idx + 1}. ${d.waybill}`)
            .join("\n");
        sections.push(`${header}\n${body}`);
    }

    return {
        groups,
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

        if (nonZTO.length === 0) {
            console.log(`📊 运单总数${uniqueWaybills.length}件，全部为中通件(已跳过)`);
            return;
        }

        // 优先使用已签收缓存过滤，避免每次重复查询几百个老单子
        const signedCache = getSignedCache();
        let cachedSignedCount = 0;
        const toQuery = [];

        for (const w of nonZTO) {
            if (signedCache[w]) {
                cachedSignedCount++;
            } else {
                toQuery.push(w);
            }
        }

        console.log(`📊 运单分析: 总数${uniqueWaybills.length} (中通跳过${skippedZTO}件, 命中已签收缓存${cachedSignedCount}件, 实际待查${toQuery.length}件)`);

        let activePackages = {};
        let failed = [];
        let newlySignedCount = 0;

        if (toQuery.length > 0) {
            const token = await getMamaToken();
            const queryRes = await poolQuery(toQuery, token, QUERY_CONFIG.QUERY_API.CONCURRENCY);
            activePackages = queryRes.activePackages;
            failed = queryRes.failed;
            newlySignedCount = queryRes.signedCount;
        }

        const totalSigned = cachedSignedCount + newlySignedCount;
        const activeList = Object.values(activePackages);
        const activeCount = activeList.length;

        // 控制台日志完整输出未签收清单
        console.log("\n📋 === 未签收运单（完整清单） ===");
        if (activeCount > 0) {
            const { groups, title, body } = buildGroupedNotification(activeList);
            for (const [st, items] of Object.entries(groups)) {
                console.log(`📌 ${st}（共 ${items.length} 个）：`);
                items.forEach((item, idx) => console.log(`  ${idx + 1}. ${item.waybill}`));
            }
            console.log(`📊 统计: 未签收 ${activeCount}件, 已签收 ${totalSigned}件, 跳过中通 ${skippedZTO}件, 失败 ${failed.length}件\n`);

            let subTitle = "";
            if (totalSigned > 0) subTitle += `已过滤 ${totalSigned} 个签收`;
            if (skippedZTO > 0) subTitle += `${subTitle ? "，" : ""}跳过 ${skippedZTO} 个中通`;
            if (failed.length > 0) subTitle += `${subTitle ? "，" : ""}${failed.length} 个失败`;

            const fullTitle = `未签收快递 (${title})`;
            const copyContent = activeList.map(d => d.waybill).join("\n");

            if (ENABLE_LOON_NOTIFY) {
                sendNotification(fullTitle, subTitle, body, { clipboard: copyContent });
            }
            if (ENABLE_BARK && BARK_KEY) {
                await sendBark(fullTitle, `${subTitle ? subTitle + "\n\n" : ""}${body}`, copyContent);
            }
        } else {
            console.log(`🎉 恭喜！所有非中通运单均已签收 (共 ${totalSigned} 件已签收)`);
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

        // 5. 判断是否触发联动未签收查询 (限时保护，最长等待 7 秒，保证 App 绝对不卡住)
        if (api.canTriggerQuery && data.ts && data.sign && shouldRunAutoQuery()) {
            const timeoutPromise = new Promise(resolve => {
                setTimeout(() => {
                    console.log("⚠️ 查单已达安全保护时长 (7秒)，放行 App 请求");
                    resolve();
                }, QUERY_CONFIG.MAX_TOTAL_QUERY_MS);
            });
            await Promise.race([
                executeAutoQuery(data.ts, data.sign, headers),
                timeoutPromise
            ]);
        } else if (NOTIFY_ON_CAPTURE) {
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
