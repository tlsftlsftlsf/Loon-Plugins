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
    
    console.log(`筛选完成 - 保留:${keptBills.length}条 移除:${removedBills.length}条`);
    
    // 构建通知内容
    let notificationText = `📊 模式: ${flagText} (${flagValue})\n`;
    notificationText += `📊 数据: 原始${originalCount}条 → 保留${keptBills.length}条 → 移除${removedBills.length}条\n`;
    notificationText += `══════════════════════════\n\n`;
    
    // 显示请求体信息
    notificationText += `📝 请求体信息:\n${requestBodyDisplay}\n\n`;
    notificationText += `══════════════════════════\n\n`;
    
    // 显示保留的数据（包含关键词的）
    if (keptBills.length > 0) {
        notificationText += `✅ 保留的数据 (包含关键词):\n`;
        for (let i = 0; i < keptBills.length; i++) {
            const bill = keptBills[i];
            notificationText += `${bill.billCode}\n${bill.receiveAddress}\n`;
            
            // 如果有产品信息也显示
            if (bill.productList && bill.productList.length > 0) {
                notificationText += `产品: ${bill.productList.join(', ')}\n`;
            }
            notificationText += `\n`;
        }
    } else {
        notificationText += `⚠️ 没有包含关键词的数据\n\n`;
    }
    
    notificationText += `══════════════════════════\n\n`;
    
    // 显示移除的数据统计
    if (removedBills.length > 0) {
        notificationText += `🗑️ 移除的数据 (${removedBills.length}条):\n`;
        const displayCount = Math.min(removedBills.length, 10);
        for (let i = 0; i < displayCount; i++) {
            const bill = removedBills[i];
            notificationText += `${bill.billCode || '无单号'}`;
            if (bill.receiveAddress) {
                notificationText += ` - ${bill.receiveAddress.substring(0, 30)}`;
            }
            notificationText += `\n`;
        }
        if (removedBills.length > 10) {
            notificationText += `... 还有${removedBills.length - 10}条数据\n`;
        }
    }
    
    // 发送通知
    if (keptBills.length > 0 || originalCount > 0) {
        $notify("中通监控 - 关键词过滤", `保留:${keptBills.length}条 | 移除:${removedBills.length}条`, notificationText.trim());
        console.log("✅ 通知发送成功");
    } else {
        console.log("ℹ️ 无数据，不发送通知");
    }
    
    // 返回修改后的响应 - 只包含有关键词的数据
    console.log(`✅ 返回过滤后的数据: ${keptBills.length}条`);
    $done({ body: JSON.stringify(data) });
    
} catch (error) {
    console.log("❌ 脚本执行错误: " + error);
    console.log("错误详情: " + error.stack);
    $done({}); // 出错时返回原始响应
}