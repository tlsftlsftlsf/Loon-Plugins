// 兼容 Loon 与 Quantumult X 通知环境
if (typeof $notify === "undefined") {
    var $notify = function(title, subtitle, body, attach) {
        if (typeof $notification !== "undefined" && $notification.post) {
            $notification.post(title, subtitle, body, attach);
        } else {
            console.log("[通知] " + title + " | " + subtitle + "\n" + body);
        }
    };
}

// ====== 推送与通知配置 ======
const BARK_KEY = "BApQ6cMJmhpRwiWGQJmJJj"; // Bark 设备 Key
const ENABLE_BARK = true;                  // 是否启用 Bark 推送
const BARK_GROUP = "快递相关";              // Bark 消息分组 (统一设置为快递相关)
const BARK_TTL = 600;                      // 消息缓存时间(秒)
const ENABLE_LOON_NOTIFY = false;          // 是否启用 Loon 本地通知 (默认关闭)

// 发送 Bark 推送通知 (兼容 Loon 与 Quantumult X)
function sendBarkNotification(title, content, copyText, callback) {
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
        timer = setTimeout(function() {
            console.log("⚠️ Bark 推送等待超时 (1.5s)，放行响应");
            doneCallback();
        }, 1500);
    } catch (e) {
        // 环境不支持 setTimeout 时忽略
    }
    
    const postData = {
        title: title,
        body: content,
        group: BARK_GROUP,
        copy: copyText || "",
        icon: "https://gitlab.com/lodepuly/iconlibrary/-/raw/master/Other_icon/120px/ZTO.png"
    };
    if (BARK_TTL) {
        postData.ttl = BARK_TTL;
    }

    if (typeof $httpClient !== "undefined" && $httpClient.post) {
        $httpClient.post({
            url: "https://api.day.app/" + BARK_KEY,
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            },
            body: JSON.stringify(postData)
        }, function(error, response, data) {
            if (error) {
                console.log("❌ Bark 推送失败: " + error);
            } else {
                console.log("✅ Bark 推送成功");
            }
            doneCallback();
        });
    } else if (typeof $task !== "undefined" && $task.fetch) {
        $task.fetch({
            url: "https://api.day.app/" + BARK_KEY,
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            },
            body: JSON.stringify(postData)
        }).then(function(response) {
            console.log("✅ Bark 推送成功");
            doneCallback();
        }, function(reason) {
            console.log("❌ Bark 推送失败: " + (reason && reason.error ? reason.error : reason));
            doneCallback();
        });
    } else {
        console.log("⚠️ 当前环境不支持网络请求");
        doneCallback();
    }
}

// 辅助函数：安全获取包裹重量
function getBillWeight(item) {
    if (!item) return 0;
    const val = item.routeAllMaxWeight ?? item.weight ?? item.realWeight ?? item.billingWeight ?? item.pkgWeight ?? 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
}

// 辅助函数：格式化重量字符串
function formatWeight(item) {
    const w = getBillWeight(item);
    return w > 0 ? `${w}kg` : "0kg";
}

// 简化稳定版 - 中通监控
// 关键词列表 - 每行一个词，支持注释（以#开头的行）
// 只保留包含这些关键词的地址，其他全部移除
const includeWords = `
郎
东航
天伦
金牛
安居小区
鑫港
华川保温
米朗
牛头王
金鑫
恒泰
霍庄村4组
霍庄加油站
霍庄社区4组
霍庄八组
霍庄社区四组
西环一路金
霍庄社区八组
千泓
建设西路117
香芝源
中天摩擦
和谐路28号
霍庄四组
傲晨
筑尔梦
山食品
通广实业
彩印
雷山
110
首府
福运超市
中天利车片厂
农商智慧城
汉光酒业
鹏鹏
枣福
科目三
霍庄四队
胜意
霍庄安居
泓源建材
霍庄村四组
汉光酒业
互众添鑫箱包
牛山小区
诚信石材
东北120米
怡丰牛头
太古泉路与西环一路交叉口
发展大道22号
霍庄4组
霍庄四组
建设西路117号
建设西路106号
24号
汉光酒厂
社区四组
恒泰电子厂
大道21
`.split('\n')
.map(word => word.trim())
.filter(word => word && !word.startsWith('#')); // 过滤空行和注释行

try {
    console.log("开始处理响应数据");
    console.log(`加载关键词: ${includeWords.length}个`);
    
    // 安全检查
    if (!$response || !$response.body) {
        console.log("❌ 响应体为空");
        $done({});
        return;
    }
    
    let data;
    try {
        data = JSON.parse($response.body);
    } catch (e) {
        console.log("❌ JSON解析失败: " + e);
        $done({});
        return;
    }
    
    console.log("JSON解析成功");
    
    // 检查数据结构
    if (!data || typeof data !== 'object') {
        console.log("❌ data不是对象");
        $done({});
        return;
    }
    
    if (!data.status) {
        console.log("❌ 缺少status字段");
        $done({});
        return;
    }
    
    if (!data.result || !Array.isArray(data.result)) {
        console.log("❌ result不是数组或不存在");
        $done({});
        return;
    }
    
    const originalCount = data.result.length;
    console.log("数据验证通过，原始结果数量: " + originalCount);
    
    // 提取flag - 根据提供的请求体示例
    let flagValue = "未知";
    let flagText = "未知模式";
    let requestBodyDisplay = "无请求体";
    
    if ($request && $request.body) {
        const body = $request.body;
        
        // 解码URL编码的请求体用于显示
        let decodedBody;
        try {
            decodedBody = decodeURIComponent(body);
            requestBodyDisplay = decodedBody;
        } catch (e) {
            requestBodyDisplay = body;
            decodedBody = body;
        }
        
        // 多种方式检测arriveNotDispatchFlag
        if (decodedBody.includes('"arriveNotDispatchFlag" : 1') || 
            decodedBody.includes('"arriveNotDispatchFlag":1') ||
            decodedBody.includes('"arriveNotDispatchFlag" :1') ||
            decodedBody.includes('"arriveNotDispatchFlag": 1') ||
            body.includes('arriveNotDispatchFlag%22%20%3A%201') ||
            body.includes('arriveNotDispatchFlag%22%3A1')) {
            flagValue = "1";
            flagText = "有到未派";
        } else if (decodedBody.includes('"arriveNotDispatchFlag" : 0') || 
                   decodedBody.includes('"arriveNotDispatchFlag":0') ||
                   decodedBody.includes('"arriveNotDispatchFlag" :0') ||
                   decodedBody.includes('"arriveNotDispatchFlag": 0') ||
                   body.includes('arriveNotDispatchFlag%22%20%3A%200') ||
                   body.includes('arriveNotDispatchFlag%22%3A0')) {
            flagValue = "0";
            flagText = "全部发件";
        }
        
        console.log(`检测到flag: ${flagValue} (${flagText})`);
    }
    
    // 关键词筛选 - 只保留包含关键词的数据
    const keptBills = [];     // 保留的数据
    const removedBills = [];  // 移除的数据
    
    for (let i = 0; i < data.result.length; i++) {
        const item = data.result[i];
        if (item && item.receiveAddress) {
            let shouldKeep = false;
            for (let j = 0; j < includeWords.length; j++) {
                if (item.receiveAddress.includes(includeWords[j])) {
                    shouldKeep = true;
                    break;
                }
            }
            if (shouldKeep) {
                // 包含关键词，保留
                keptBills.push(item);
            } else {
                // 不包含关键词，移除
                removedBills.push(item);
            }
        } else {
            // 没有地址信息的也移除
            removedBills.push(item);
        }
    }
    
    // 更新响应数据 - 只保留包含关键词的数据
    data.result = keptBills;
    
    // 筛选保留数据中重量大于 3kg 的包裹，并按重量从大到小排序
    const heavyKeptBills = keptBills
        .filter(item => getBillWeight(item) > 3)
        .sort((a, b) => getBillWeight(b) - getBillWeight(a));
    
    // 移除包裹同样按重量从大到小排序
    removedBills.sort((a, b) => getBillWeight(b) - getBillWeight(a));
    
    console.log(`筛选完成 - 保留:${keptBills.length}条 (重件>3kg:${heavyKeptBills.length}条) 移除:${removedBills.length}条`);
    
    // 控制台输出详细列表 (包含详细信息，方便在 Loon 脚本日志中随时核对)
    if (removedBills.length > 0) {
        console.log(`=== 🗑️ 移除包裹清单 (${removedBills.length}条) ===`);
        removedBills.forEach((b, i) => console.log(`${i + 1}. 重量:${formatWeight(b)} 单号:${b.billCode || '无'} 地址:${b.receiveAddress || '无'}`));
    }
    if (heavyKeptBills.length > 0) {
        console.log("=== ⚖️ 保留重件(>3kg，由重到轻)清单 ===");
        heavyKeptBills.forEach((b, i) => console.log(`${i + 1}. 重量:${formatWeight(b)} 单号:${b.billCode || '无'} 地址:${b.receiveAddress || '无'}`));
    }
    
    // 构建通知内容：将【移除包裹】放在最顶端优先警示，紧接着展示【保留重件(>3kg，由重到轻)】
    let notificationText = "";
    
    // 【顶端】优先显示移除的异常包裹
    if (removedBills.length > 0) {
        notificationText += `🗑️ 移除包裹 (${removedBills.length}条):\n`;
        for (let i = 0; i < removedBills.length; i++) {
            const bill = removedBills[i];
            const code = bill.billCode || "无单号";
            const addr = bill.receiveAddress || "无地址";
            const wt = formatWeight(bill);
            notificationText += `${i + 1}. ${wt} | ${code}\n   ${addr}\n`;
        }
        notificationText += `\n`;
    } else {
        notificationText += `🗑️ 移除包裹: 0条\n\n`;
    }
    
    notificationText += `══════════════════════════\n\n`;
    
    // 【接下来】显示保留的重件（>3kg 由重到轻排序）
    if (heavyKeptBills.length > 0) {
        notificationText += `⚖️ 保留重件 >3kg (${heavyKeptBills.length}条，由重到轻):\n`;
        for (let i = 0; i < heavyKeptBills.length; i++) {
            const bill = heavyKeptBills[i];
            const code = bill.billCode || "无单号";
            const addr = bill.receiveAddress || "无地址";
            const wt = formatWeight(bill);
            const prod = (bill.productList && bill.productList.length > 0) ? ` [${bill.productList.join(", ")}]` : "";
            notificationText += `${i + 1}. ${wt} | ${code}${prod}\n   ${addr}\n`;
        }
        notificationText += `\n`;
    } else if (keptBills.length > 0) {
        notificationText += `✅ 保留包裹 (${keptBills.length}条，均为<3kg小件):\n`;
        const showCount = Math.min(keptBills.length, 5);
        for (let i = 0; i < showCount; i++) {
            const bill = keptBills[i];
            const code = bill.billCode || "无单号";
            const addr = bill.receiveAddress || "无地址";
            const wt = formatWeight(bill);
            notificationText += `${i + 1}. ${wt} | ${code}\n   ${addr}\n`;
        }
        if (keptBills.length > showCount) {
            notificationText += `... 以及其他 ${keptBills.length - showCount} 件小件\n`;
        }
        notificationText += `\n`;
    } else {
        notificationText += `⚠️ 无保留包裹 (全部被移除)\n\n`;
    }
    
    notificationText += `══════════════════════════\n`;
    // 统计概览放在通知最末尾，避免遮挡顶部核心包裹信息
    notificationText += `📊 统计: 原始${originalCount}条 → 保留${keptBills.length}条 (重件:${heavyKeptBills.length}条) → 移除${removedBills.length}条 | 模式: ${flagText}`;
    
    // 剪贴板内容整理（点击通知可一键复制）
    let clipText = "";
    if (heavyKeptBills.length > 0) {
        clipText += `【重件>3kg清单】\n` + heavyKeptBills.map(b => `${formatWeight(b)} | ${b.billCode} | ${b.receiveAddress || ''}`).join('\n') + `\n\n`;
    }
    if (removedBills.length > 0) {
        clipText += `【移除件清单】\n` + removedBills.map(b => `${formatWeight(b)} | ${b.billCode} | ${b.receiveAddress || ''}`).join('\n') + `\n\n`;
    }
    clipText += `【全部保留单号】\n` + keptBills.map(b => b.billCode).join('\n');
    
    // 构建 Bark 标题：醒目提示移除数量与重件数量
    let barkTitle = "中通监控";
    if (removedBills.length > 0) {
        barkTitle += ` - ⚠️移除:${removedBills.length}件`;
    }
    if (heavyKeptBills.length > 0) {
        barkTitle += ` ⚖️重件:${heavyKeptBills.length}件`;
    }
    barkTitle += ` (保留:${keptBills.length}件)`;

    // 1. Loon 本地通知 (根据配置决定是否发送)
    if (ENABLE_LOON_NOTIFY) {
        try {
            if (keptBills.length > 0 || originalCount > 0) {
                const maxWt = heavyKeptBills.length > 0 ? `最大${formatWeight(heavyKeptBills[0])}` : "无大件";
                const subTitle = `重件:${heavyKeptBills.length}条(${maxWt}) | 保留:${keptBills.length} | 移除:${removedBills.length}`;
                $notify("中通监控 - 关键词过滤", subTitle, notificationText.trim(), {
                    clipboard: clipText.trim()
                });
                console.log("✅ Loon 本地通知发送成功");
            }
        } catch (notifyErr) {
            console.log("⚠️ Loon 本地通知异常 (不影响数据过滤): " + notifyErr);
        }
    } else {
        console.log("ℹ️ Loon 本地通知已关闭 (优先使用 Bark 推送)");
    }
    
    // 详细请求体移至末尾打印，避免干扰顶部的包裹日志视线
    if (requestBodyDisplay && requestBodyDisplay !== "无请求体") {
        console.log("=== 📝 详细请求体(末尾) ===");
        console.log(requestBodyDisplay);
        console.log("=== 详细请求体结束 ===");
    }
    
    // 2. Bark 推送并返回响应数据
    if (ENABLE_BARK && (keptBills.length > 0 || originalCount > 0)) {
        console.log("正在发送 Bark 推送...");
        sendBarkNotification(barkTitle, notificationText.trim(), clipText.trim(), function() {
            console.log(`✅ 返回过滤后的数据: ${keptBills.length}条`);
            $done({ body: JSON.stringify(data) });
        });
    } else {
        console.log(`✅ 返回过滤后的数据: ${keptBills.length}条`);
        $done({ body: JSON.stringify(data) });
    }
    
} catch (error) {
    console.log("❌ 脚本执行错误: " + error);
    console.log("错误详情: " + error.stack);
    $done({}); // 出错时返回原始响应
}