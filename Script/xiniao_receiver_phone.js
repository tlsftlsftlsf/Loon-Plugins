// ============================================
// Loon 脚本：提取喜鸟收件人真实手机号
// 点击通知复制到剪贴板，不跳转
// ============================================

const url = $request.url;

if (url.includes('receiverPhone')) {
    try {
        const body = JSON.parse($response.body);
        
        if (body && body.success === true && body.data) {
            const phone = String(body.data).trim();
            
            // attach 同时设置 clipboard 和空 openUrl
            $notification.post(
                '收件人手机号',
                '点击通知复制手机号',
                `📱 手机号：${phone}`,
                {
                    clipboard: phone,
                    openUrl: ""    // 阻止跳转其他应用
                }
            );
            
            console.log(`[56xiniao] ✅ 提取成功: ${phone}`);
        }
    } catch (e) {
        console.log(`[56xiniao] ❌ 解析错误: ${e.message}`);
    }
}

$done({ body: $response.body });
