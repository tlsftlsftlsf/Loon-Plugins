// ==============================================================================
// Loon / Quantumult X 脚本：快递100 自动查询未签收运单状态
// 功能：读取捕获的凭证，获取运单列表，过滤中通，批量并发查询物流状态，智能兜底判定签收，多状态分组推送
// ==============================================================================

// 配置常量 - 集中管理关键参数
const CONFIG = {
    // 存储键名（需与捕获脚本保持一致）
    STORAGE_KEYS: {
        WAYBILL: "kuaidi100_waybill_record",
        STATUS: "kuaidi100_status_query",
        HEADERS: "kuaidi100_headers"
    },
    // 通知内各状态最大展示数量
    MAX_DISPLAY: 5,
    // 本地通知开关
    ENABLE_LOON_NOTIFY: true,
    // Bark 推送配置
    BARK: {
        ENABLE: true,
        KEY: "BApQ6cMJmhpRwiWGQJmJJj", // Bark 设备 Key (留空则不推送)
        GROUP: "快递100未签收"
    },
    // 签收判定关键词（用于 API 返回的 status 以及 desc/remark 字段二次兜底）
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
    // 快递查询 API 配置
    QUERY_API: {
        URL: "https://yizhan.mamayz.com:48081/opYZApp9193/opYZApp/track/queryTrack",
        HEADERS: {
            "stationCode": "0000765271",
            "token": "YiKNWC5CA3pRIltAjGOMgg3tKVOOwE4cKaO1vVDnHAHgPdIyXZGFT3TO0qamTvDy"
        },
        MAX_CONCURRENT: 20,
        TIMEOUT_MS: 15000
    },
    // 中通快递单号前缀（全部跳过，不查询）
    ZTO_PREFIXES: ["79", "73", "76", "75", "74"]
};

// ==================== 环境适配与工具函数 ====================

/**
 * 封装持久化读取（兼容 Loon 与 Quantumult X）
 */
function getStorage(key) {
    if (typeof $persistentStore !== "undefined" && $persistentStore.read) {
        return $persistentStore.read(key);
    }
    if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
        return $prefs.valueForKey(key);
    }
    return null;
}

/**
 * 封装通用网络请求（Promise 化，兼容 Loon $httpClient 与 QX $task.fetch）
 */
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

/**
 * 封装通用通知（兼容 Loon 与 Quantumult X）
 */
function sendNotification(title, subtitle, body, attach) {
    if (typeof $notification !== "undefined" && $notification.post) {
        $notification.post(title, subtitle, body, attach);
    } else if (typeof $notify !== "undefined") {
        $notify(title, subtitle, body);
    } else {
        console.log(`[通知] ${title} | ${subtitle}\n${body}`);
    }
}

/**
 * 发送 Bark 推送通知
 */
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

/**
 * 将对象序列化为 URL-encoded 表单字符串
 */
function toFormData(obj) {
    return Object.keys(obj)
        .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]))
        .join("&");
}

/**
 * 判断是否为中通快递单号
 */
function isZTOWaybill(waybill) {
    return CONFIG.ZTO_PREFIXES.some(prefix => waybill.startsWith(prefix));
}

/**
 * 关键词兜底判定：检查描述文本是否包含签收关键词
 */
function containsSignedKeyword(text) {
    if (!text) return false;
    return CONFIG.SIGNED_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * 获取存储的 JSON 数据
 */
function getStoredData(key) {
    console.log(`🔍 读取存储数据 [key: ${key}]`);
    const rawData = getStorage(key);
    if (!rawData) throw new Error(`存储数据不存在 [key: ${key}]，请先触发抓包获取凭证`);
    try {
        return JSON.parse(rawData);
    } catch (e) {
        throw new Error(`存储数据解析失败 [key: ${key}]：${e.message}`);
    }
}

/**
 * 获取合并后的请求头
 */
function getRequestHeaders() {
    try {
        const storedHeaders = getStoredData(CONFIG.STORAGE_KEYS.HEADERS);
        return { ...CONFIG.DEFAULT_HEADERS, ...storedHeaders };
    } catch (e) {
        console.warn(`⚠️ 请求头获取失败，使用默认值：${e.message}`);
        return CONFIG.DEFAULT_HEADERS;
    }
}

/**
 * 发送请求并自动解析 JSON
 */
async function fetchData(options) {
    try {
        console.log(`📡 发送请求 [${options.method || 'GET'}] ${options.url}`);
        const response = await httpFetch(options);
        let data = {};
        if (response.body) {
            try {
                data = JSON.parse(response.body);
            } catch (parseErr) {
                data = response.body;
            }
        }
        const statusCode = response.statusCode || 200;
        console.log(`📡 响应状态 [${options.url}]：${statusCode}`);
        return { status: statusCode, data };
    } catch (e) {
        console.error(`❌ 请求失败 [${options.url}]：${e.message}`);
        throw new Error(`网络请求异常：${e.message}`);
    }
}

// ==================== 业务逻辑 ====================

/**
 * 获取快递100面单记录
 */
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

        const { status, data } = await fetchData({
            method: "POST",
            url: CONFIG.API_URLS.WAYBILL,
            headers,
            body: formData
        });

        if (status !== 200 || data.code !== 0) {
            throw new Error(`运单请求失败：${data.msg || "未知错误"}`);
        }

        const waybills = (data.data?.list || []).flatMap(group =>
            group.list ? group.list.map(item => item.waybill).filter(Boolean) : []
        );

        // 运单号去重
        const uniqueWaybills = [...new Set(waybills)];

        if (uniqueWaybills.length < waybills.length) {
            console.log(`🔗 去重：${waybills.length} → ${uniqueWaybills.length}（移除 ${waybills.length - uniqueWaybills.length} 个重复）`);
        }

        // 过滤中通单号
        const filtered = uniqueWaybills.filter(w => !isZTOWaybill(w));
        const skipped = uniqueWaybills.length - filtered.length;

        if (skipped > 0) {
            console.log(`⏭️ 跳过 ${skipped} 个中通快递单号（不查询）`);
        }

        console.log(`✅ 有效非中通运单 ${filtered.length} 个`);
        return { waybills: filtered, skippedZTO: skipped };
    } catch (e) {
        console.error(`❌ 运单列表获取失败：${e.message}`);
        sendNotification("运单获取失败", e.message, "请检查存储参数或重新打开快递100抓包");
        return { waybills: [], skippedZTO: 0 };
    }
}

/**
 * 从 API 响应提取状态，datas[0].status 为主，desc/remark 兜底
 */
function extractStatus(data) {
    if (data?.datas && Array.isArray(data.datas) && data.datas.length > 0) {
        const latest = data.datas[0];
        const status = latest.status || "";
        const desc = latest.desc || latest.remark || "";

        // desc/remark 关键词优先
        if (containsSignedKeyword(desc)) {
            return "签收";
        }

        // status 字段自身是否匹配
        if (containsSignedKeyword(status)) {
            return "签收";
        }

        return status || "未知状态";
    }
    return "未知状态";
}

/**
 * 单运单查询
 */
async function fetchStatus(waybill) {
    const startTime = Date.now();
    try {
        const fetchPromise = fetchData({
            method: "POST",
            url: CONFIG.QUERY_API.URL,
            headers: { ...CONFIG.QUERY_API.HEADERS, "Content-Type": "application/json" },
            body: JSON.stringify({ waybillNo: waybill })
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`请求超时 (${CONFIG.QUERY_API.TIMEOUT_MS}ms)`)), CONFIG.QUERY_API.TIMEOUT_MS);
        });

        const { status, data } = await Promise.race([fetchPromise, timeoutPromise]);
        if (status !== 200) throw new Error(`HTTP ${status}`);

        const extractedStatus = extractStatus(data);
        const elapsed = Date.now() - startTime;
        console.log(`  ✅ ${waybill} [${elapsed}ms] → ${extractedStatus}`);

        return { waybill, status: extractedStatus, rawData: data };
    } catch (e) {
        const elapsed = Date.now() - startTime;
        console.error(`  ❌ ${waybill} [${elapsed}ms]: ${e.message}`);
        throw e;
    }
}

/**
 * 批量并发查询
 */
async function batchQuery(waybills, queryFn, maxConcurrent) {
    console.log(`🔄 开始查询 ${waybills.length} 个运单（并发: ${maxConcurrent}）`);

    const activePackages = {};
    const failed = [];
    let signedCount = 0;

    for (let i = 0; i < waybills.length; i += maxConcurrent) {
        const batch = waybills.slice(i, i + maxConcurrent);
        const batchNum = Math.floor(i / maxConcurrent) + 1;
        console.log(`📦 第 ${batchNum} 批（${batch.length} 个）`);

        const queryPromises = batch.map(async (waybill) => {
            try {
                const result = await queryFn(waybill);
                return { waybill, success: true, result };
            } catch (error) {
                return { waybill, success: false, error: error.message };
            }
        });

        const batchResults = await Promise.all(queryPromises);
        console.log(`✅ 第 ${batchNum} 批完成`);

        for (const item of batchResults) {
            if (!item.success) {
                failed.push(item.waybill);
                continue;
            }

            const { waybill, status } = item.result;

            if (CONFIG.SIGNED_KEYWORDS.some(kw => status.includes(kw))) {
                console.log(`📦 ${waybill} 已签收（${status}），过滤`);
                signedCount++;
            } else {
                activePackages[waybill] = { waybill, status };
                console.log(`✅ ${waybill} 未签收（${status}），保留`);
            }
        }
    }

    console.log(`📊 完成：未签收 ${Object.keys(activePackages).length}，已签收 ${signedCount}，失败 ${failed.length}`);
    return { activePackages, failed, signedCount };
}

/**
 * 格式化运单详情
 */
function formatDetail(detail) {
    return `${detail.waybill}：${detail.status}`;
}

/**
 * 按签收状态分组，生成通知内容
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
        const body = items
            .slice(0, CONFIG.MAX_DISPLAY)
            .map(d => `  ${d.waybill}`)
            .join("\n");
        const extra = items.length > CONFIG.MAX_DISPLAY
            ? `\n  ...及其他 ${items.length - CONFIG.MAX_DISPLAY} 个`
            : "";
        sections.push(`${header}\n${body}${extra}`);
    }

    return {
        title: `共 ${activeList.length} 个未签收`,
        body: sections.join("\n\n")
    };
}

// ==================== 主入口函数 ====================

async function main() {
    const scriptStart = Date.now();
    try {
        console.log("🚀 快递查询脚本启动");

        // 第一步：获取运单号（已去重，已过滤中通）
        const { waybills, skippedZTO } = await getWaybillRecords();
        if (waybills.length === 0) {
            const msg = skippedZTO > 0
                ? `无有效运单（跳过 ${skippedZTO} 个中通）`
                : "未获取到有效运单";
            if (CONFIG.ENABLE_LOON_NOTIFY) {
                sendNotification("快递查询", msg, "请确认是否在快递100有非中通运单");
            }
            return;
        }

        // 第二步：批量并发查询状态
        const { activePackages, failed, signedCount } = await batchQuery(
            waybills, fetchStatus, CONFIG.QUERY_API.MAX_CONCURRENT
        );

        // 第三步：构造分组通知
        const activeList = Object.values(activePackages);
        const activeCount = activeList.length;

        if (activeCount > 0) {
            const { title, body } = buildGroupedNotification(activeList);

            let subTitle = "";
            if (signedCount > 0) subTitle += `已过滤 ${signedCount} 个签收`;
            if (skippedZTO > 0) subTitle += `${subTitle ? "，" : ""}跳过 ${skippedZTO} 个中通`;
            if (failed.length > 0) subTitle += `${subTitle ? "，" : ""}${failed.length} 个查询失败`;

            const notifyTitle = `未签收快递 (${title})`;
            const copyContent = activeList.map(d => `${d.waybill} ${d.status}`).join("\n");

            // 1. Loon 本地通知
            if (CONFIG.ENABLE_LOON_NOTIFY) {
                sendNotification(notifyTitle, subTitle, body, {
                    clipboard: copyContent
                });
            }

            // 2. Bark 推送
            if (CONFIG.BARK.ENABLE && CONFIG.BARK.KEY) {
                await sendBarkPush(notifyTitle, `${subTitle ? subTitle + "\n\n" : ""}${body}`, copyContent);
            }
        } else {
            let message = `共获取 ${waybills.length + skippedZTO} 个运单`;
            if (skippedZTO > 0) message += `，跳过 ${skippedZTO} 个中通`;
            if (signedCount > 0) message += `，${signedCount} 个已签收`;
            if (failed.length > 0) message += `，${failed.length} 个查询失败`;
            
            if (CONFIG.ENABLE_LOON_NOTIFY) {
                sendNotification("快递状态", "所有运单均已签收", message);
            }
            if (CONFIG.BARK.ENABLE && CONFIG.BARK.KEY) {
                await sendBarkPush("快递状态: 全部已签收", message, "");
            }
        }

        // 第四步：控制台完整日志输出
        console.log("\n📋 === 未签收运单（按状态分组） ===");
        if (activeCount > 0) {
            const groups = {};
            activeList.forEach(d => {
                if (!groups[d.status]) groups[d.status] = [];
                groups[d.status].push(d);
            });
            for (const [status, items] of Object.entries(groups)) {
                console.log(`\n📌 ${status}（${items.length}个）：`);
                items.forEach(d => console.log(`  ${formatDetail(d)}`));
            }
        } else {
            console.log("  （无）");
        }

        console.log(`\n📊 === 统计 ===`);
        console.log(`  总运单数：${waybills.length + skippedZTO}`);
        if (skippedZTO > 0) console.log(`  跳过中通：${skippedZTO}`);
        console.log(`  未签收：${activeCount}`);
        console.log(`  已签收：${signedCount}`);
        console.log(`  查询失败：${failed.length}`);
        console.log(`  总耗时：${Date.now() - scriptStart}ms`);

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
