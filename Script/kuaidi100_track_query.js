// ==============================================================================
// Loon / Quantumult X 脚本：快递100 自动查询未签收运单状态
// 功能：读取捕获的凭证，获取运单列表，过滤中通，命中已签收缓存，极速并发查询物流，智能状态提取，完整单号列表推送
// ==============================================================================

// 配置常量 - 集中管理关键参数
const CONFIG = {
    STORAGE_KEYS: {
        WAYBILL: "kuaidi100_waybill_record",
        STATUS: "kuaidi100_status_query",
        HEADERS: "kuaidi100_headers",
        SIGNED_CACHE: "kuaidi100_signed_cache"
    },
    ENABLE_LOON_NOTIFY: true,
    BARK: {
        ENABLE: true,
        KEY: "BApQ6cMJmhpRwiWGQJmJJj", // Bark 设备 Key (留空则不推送)
        GROUP: "快递相关"
    },
    SIGNED_KEYWORDS: [
        "已签收", "签收成功", "本人签收", "家人代收", "代收", "亲友代收",
        "物业代收", "门卫代收", "驿站签收", "送货上门", "已取件", "已领取",
        "妥投", "签收", "驿站代收"
    ],
    DEFAULT_HEADERS: {
        "host": "api.kuaidihelp.com",
        "content-type": "application/x-www-form-urlencoded;charset=utf8",
        "version": "11.4.0",
        "channel": "kdy",
        "appversion": "11400",
        "user-agent": "KuaiDiYuan_S/2 CFNetwork/1331.0.7 Darwin/21.4.0",
        "pname": "ioss"
    },
    API_URLS: {
        WAYBILL: "https://api.kuaidihelp.com/g_order_core/v2/image/Save/getWaybillRecord"
    },
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
        TTL_HOURS: 12
    },
    QUERY_API: {
        URL: "https://yizhan.mamayz.com:48081/opYZApp9193/opYZApp/track/queryTrack",
        CONCURRENCY: 30,
        TIMEOUT_MS: 5000
    },
    ZTO_PREFIXES: ["79", "73", "76", "75", "74"]
};

// ==================== 环境适配与工具函数 ====================

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
    const raw = getStorage(CONFIG.STORAGE_KEYS.SIGNED_CACHE);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
}

function saveSignedCache(cache) {
    const keys = Object.keys(cache);
    if (keys.length > 2500) {
        const trimmed = {};
        keys.slice(keys.length - 2000).forEach(k => { trimmed[k] = 1; });
        setStorage(CONFIG.STORAGE_KEYS.SIGNED_CACHE, JSON.stringify(trimmed));
    } else {
        setStorage(CONFIG.STORAGE_KEYS.SIGNED_CACHE, JSON.stringify(cache));
    }
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
            reject(new Error("当前运行环境不支持 HTTP 请求"));
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

async function sendBarkPush(title, content, copyText) {
    if (!CONFIG.BARK.ENABLE || !CONFIG.BARK.KEY) return;
    try {
        await httpFetch({
            method: "POST",
            url: `https://api.day.app/${CONFIG.BARK.KEY}`,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
                title: title,
                body: content,
                group: CONFIG.BARK.GROUP,
                copy: copyText || "",
                icon: "https://gitlab.com/lodepuly/iconlibrary/-/raw/main/App_icon/120px/KuaiDi100.png"
            })
        });
        console.log("✅ Bark 推送成功");
    } catch (e) {
        console.log("❌ Bark 推送失败: " + e.message);
    }
}

async function getMamaToken(forceRefresh = false) {
    if (!forceRefresh) {
        const cached = getStorage(CONFIG.LOGIN_API.STORAGE_KEY);
        const lastTime = getStorage(CONFIG.LOGIN_API.STORAGE_TIME_KEY);
        if (cached && lastTime) {
            const ageHours = (Date.now() - parseInt(lastTime, 10)) / (1000 * 60 * 60);
            if (ageHours < CONFIG.LOGIN_API.TTL_HOURS) {
                return cached;
            }
            console.log(`⏰ 妈妈驿站 Token 已超 ${CONFIG.LOGIN_API.TTL_HOURS}h，自动请求刷新...`);
        }
    }

    console.log("🔐 正在请求妈妈驿站登录接口获取最新 Token...");
    try {
        const resp = await httpFetch({
            method: "POST",
            url: CONFIG.LOGIN_API.URL,
            headers: CONFIG.LOGIN_API.HEADERS,
            body: JSON.stringify(CONFIG.LOGIN_API.BODY)
        });

        let data = {};
        if (resp.body) {
            try { data = JSON.parse(resp.body); } catch (e) { data = resp.body; }
        }

        if (resp.statusCode === 200 && data.code === "200" && data.data && data.data.token) {
            const token = data.data.token;
            setStorage(CONFIG.LOGIN_API.STORAGE_KEY, token);
            setStorage(CONFIG.LOGIN_API.STORAGE_TIME_KEY, String(Date.now()));
            console.log(`✅ 妈妈驿站登录成功，获取到新 Token: ${token.substring(0, 15)}...`);
            return token;
        } else {
            throw new Error(`登录接口返回异常: ${data.message || JSON.stringify(data)}`);
        }
    } catch (e) {
        console.error(`❌ 获取妈妈驿站 Token 失败: ${e.message}`);
        return getStorage(CONFIG.LOGIN_API.STORAGE_KEY) || "Fid5IHoOkO1PeMXzy672TOBw1zYMjaKLqpRspyho7ecimsJSY3Bw5B1zIEjs78GC";
    }
}

function toFormData(obj) {
    return Object.keys(obj)
        .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]))
        .join("&");
}

function isZTOWaybill(waybill) {
    return CONFIG.ZTO_PREFIXES.some(prefix => waybill.startsWith(prefix));
}

function containsSignedKeyword(text) {
    if (!text) return false;
    return CONFIG.SIGNED_KEYWORDS.some(kw => text.includes(kw));
}

function getStoredData(key) {
    const rawData = getStorage(key);
    if (!rawData) throw new Error(`存储数据不存在 [key: ${key}]，请先触发抓包获取凭证`);
    try {
        return JSON.parse(rawData);
    } catch (e) {
        throw new Error(`存储数据解析失败 [key: ${key}]：${e.message}`);
    }
}

function getRequestHeaders() {
    try {
        const storedHeaders = getStoredData(CONFIG.STORAGE_KEYS.HEADERS);
        return { ...CONFIG.DEFAULT_HEADERS, ...storedHeaders };
    } catch (e) {
        console.warn(`⚠️ 请求头获取失败，使用默认值：${e.message}`);
        return CONFIG.DEFAULT_HEADERS;
    }
}

// ==================== 业务逻辑 ====================

async function getWaybillRecords() {
    try {
        const params = getStoredData(CONFIG.STORAGE_KEYS.WAYBILL);
        const headers = getRequestHeaders();

        if (!params.ts || !params.sign) {
            throw new Error("运单查询参数不完整（缺少 ts 或 sign，请重新在快递100触发抓包）");
        }

        const formData = toFormData({
            "lj": "112.750702",
            "lw": "32.099228",
            "did": "0D128463-263A-4A61-AC41-1A5554A4D8E2",
            "app_id": "10004",
            "ts": params.ts,
            "sign": params.sign,
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
            url: CONFIG.API_URLS.WAYBILL,
            headers,
            body: formData
        });

        let data = {};
        if (resp.body) {
            try { data = JSON.parse(resp.body); } catch (e) { data = resp.body; }
        }

        if (resp.statusCode !== 200 || data.code !== 0) {
            throw new Error(`运单请求失败：${data.msg || "未知错误"}`);
        }

        const waybills = (data.data?.list || []).flatMap(group =>
            group.list ? group.list.map(item => item.waybill).filter(Boolean) : []
        );

        const uniqueWaybills = [...new Set(waybills)];
        const nonZTO = uniqueWaybills.filter(w => !isZTOWaybill(w));
        const skippedZTO = uniqueWaybills.length - nonZTO.length;

        // 命中已签收缓存
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

        console.log(`📊 运单汇总: 总数${uniqueWaybills.length}件 (跳过中通${skippedZTO}件, 命中已签收缓存${cachedSignedCount}件, 实际需查询${toQuery.length}件)`);
        return { toQuery, skippedZTO, cachedSignedCount, totalNonZTO: nonZTO.length };
    } catch (e) {
        console.error(`❌ 运单列表获取失败：${e.message}`);
        sendNotification("运单获取失败", e.message, "请检查存储参数或重新打开快递100抓包");
        return { toQuery: [], skippedZTO: 0, cachedSignedCount: 0, totalNonZTO: 0 };
    }
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
            url: CONFIG.QUERY_API.URL,
            headers: {
                "stationCode": CONFIG.LOGIN_API.HEADERS.stationCode,
                "token": token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ waybillNo: waybill })
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`请求超时 (${CONFIG.QUERY_API.TIMEOUT_MS}ms)`)), CONFIG.QUERY_API.TIMEOUT_MS);
        });

        const resp = await Promise.race([fetchPromise, timeoutPromise]);
        let data = {};
        if (resp.body) {
            try { data = JSON.parse(resp.body); } catch (e) { data = resp.body; }
        }
        const extractedStatus = extractStatus(data);
        const elapsed = Date.now() - startTime;
        return { waybill, status: extractedStatus, rawData: data, elapsed };
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
                    res = await fetchStatus(waybill, currentToken);
                }

                const { status, elapsed } = res;
                if (CONFIG.SIGNED_KEYWORDS.some(kw => status.includes(kw))) {
                    signedCount++;
                    signedCache[waybill] = 1;
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

// ==================== 主入口函数 ====================

async function main() {
    const scriptStart = Date.now();
    try {
        console.log("🚀 快递查询脚本启动");

        // 第一步：获取运单号（去重、过滤中通、过滤已签收缓存）
        const { toQuery, skippedZTO, cachedSignedCount, totalNonZTO } = await getWaybillRecords();
        if (totalNonZTO === 0) {
            const msg = skippedZTO > 0
                ? `无有效运单（跳过 ${skippedZTO} 个中通）`
                : "未获取到有效运单";
            if (CONFIG.ENABLE_LOON_NOTIFY) {
                sendNotification("快递查询", msg, "请确认是否在快递100有非中通运单");
            }
            return;
        }

        let activePackages = {};
        let failed = [];
        let newlySignedCount = 0;

        // 第二步：批量并发查询
        if (toQuery.length > 0) {
            const token = await getMamaToken();
            const queryRes = await poolQuery(toQuery, token, CONFIG.QUERY_API.CONCURRENCY);
            activePackages = queryRes.activePackages;
            failed = queryRes.failed;
            newlySignedCount = queryRes.signedCount;
        }

        const totalSigned = cachedSignedCount + newlySignedCount;
        const activeList = Object.values(activePackages);
        const activeCount = activeList.length;

        // 第三步：控制台日志完整列出未签收运单（不截断）
        console.log("\n📋 === 未签收运单（完整列表） ===");
        if (activeCount > 0) {
            const { groups, title, body } = buildGroupedNotification(activeList);
            for (const [st, items] of Object.entries(groups)) {
                console.log(`📌 状态 [${st}]（共 ${items.length} 个）：`);
                items.forEach((item, idx) => console.log(`  ${idx + 1}. ${item.waybill}`));
            }
            console.log(`\n📊 统计: 未签收 ${activeCount}件, 已签收 ${totalSigned}件, 跳过中通 ${skippedZTO}件, 失败 ${failed.length}件, 耗时 ${Date.now() - scriptStart}ms\n`);

            let subTitle = "";
            if (totalSigned > 0) subTitle += `已过滤 ${totalSigned} 个签收`;
            if (skippedZTO > 0) subTitle += `${subTitle ? "，" : ""}跳过 ${skippedZTO} 个中通`;
            if (failed.length > 0) subTitle += `${subTitle ? "，" : ""}${failed.length} 个失败`;

            const notifyTitle = `未签收快递 (${title})`;
            const copyContent = activeList.map(d => d.waybill).join("\n");

            // 1. Loon 本地通知
            if (CONFIG.ENABLE_LOON_NOTIFY) {
                sendNotification(notifyTitle, subTitle, body, {
                    clipboard: copyContent
                });
            }

            // 2. Bark 推送 (分组: 快递相关，完整单号列表)
            if (CONFIG.BARK.ENABLE && CONFIG.BARK.KEY) {
                await sendBarkPush(notifyTitle, `${subTitle ? subTitle + "\n\n" : ""}${body}`, copyContent);
            }
        } else {
            console.log(`🎉 所有非中通运单均已签收 (共 ${totalSigned} 件已签收)`);
            let message = `共获取 ${totalNonZTO + skippedZTO} 个运单`;
            if (skippedZTO > 0) message += `，跳过 ${skippedZTO} 个中通`;
            message += `，${totalSigned} 个已签收`;
            if (failed.length > 0) message += `，${failed.length} 个查询失败`;
            
            if (CONFIG.ENABLE_LOON_NOTIFY) {
                sendNotification("快递状态", "所有运单均已签收", message);
            }
            if (CONFIG.BARK.ENABLE && CONFIG.BARK.KEY) {
                await sendBarkPush("快递状态: 全部已签收", message, "");
            }
        }

    } catch (e) {
        console.error(`❌ 脚本执行异常：${e.message}`);
        if (CONFIG.ENABLE_LOON_NOTIFY) {
            sendNotification("脚本错误", "执行过程中发生错误", e.message);
        }
    } finally {
        console.log("🏁 快递查询脚本结束");
        if (typeof $done !== "undefined") {
            $done();
        }
    }
}

// 启动执行
main();
