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
            console.log("=== 解码后请求体 ===");
            console.log(decodedBody);
            console.log("=== 解码后结束 ===");
        } catch (e) {
            console.log("URL解码失败，使用原始body");
            requestBodyDisplay = body;
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
    if (heavyKeptBills.length > 0) {
        console.log("=== 保留重件(>3kg，由重到轻)清单 ===");
        heavyKeptBills.forEach((b, i) => console.log(`${i + 1}. 重量:${formatWeight(b)} 单号:${b.billCode || '无'} 地址:${b.receiveAddress || '无'}`));
    }
    if (removedBills.length > 0) {
        console.log("=== 移除包裹清单 ===");
        removedBills.forEach((b, i) => console.log(`${i + 1}. 重量:${formatWeight(b)} 单号:${b.billCode || '无'} 地址:${b.receiveAddress || '无'}`));
    }
    
    // 构建通知内容：将【保留的单号与地址】调整到最顶端，通知弹出的瞬间无需展开即可直接看到
    let notificationText = "";
    
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
    
    notificationText += `══════════════════════════\n\n`;
    
    // 显示移除的包裹
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
    
    // 发送通知 (加容错保护，避免通知接口异常中断数据返回)
    try {
        if (keptBills.length > 0 || originalCount > 0) {
            const maxWt = heavyKeptBills.length > 0 ? `最大${formatWeight(heavyKeptBills[0])}` : "无大件";
            const subTitle = `重件:${heavyKeptBills.length}条(${maxWt}) | 保留:${keptBills.length} | 移除:${removedBills.length}`;
            $notify("中通监控 - 关键词过滤", subTitle, notificationText.trim(), {
                clipboard: clipText.trim()
            });
            console.log("✅ 通知发送成功");
        } else {
            console.log("ℹ️ 无数据，不发送通知");
        }
    } catch (notifyErr) {
        console.log("⚠️ 发送通知异常 (不影响数据过滤): " + notifyErr);
    }
    
    // 返回修改后的响应 - 只包含有关键词的数据
    console.log(`✅ 返回过滤后的数据: ${keptBills.length}条`);
    $done({ body: JSON.stringify(data) });
    
} catch (error) {
    console.log("❌ 脚本执行错误: " + error);
    console.log("错误详情: " + error.stack);
    $done({}); // 出错时返回原始响应
}