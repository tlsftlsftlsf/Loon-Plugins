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
            
            // 写入剪贴板，并将 openUrl 设置为当前 App 的 URL Scheme
            // 点击通知时自动复制手机号，并直接唤起/停留在多多买菜门店端，绝不跳进 Loon
            $notification.post(
                '收件人手机号',
                '点击自动复制，留在当前应用',
                `📱 手机号：${phone}`,
                {
                    clipboard: phone,
                    openUrl: "netbar://"    // 唤起多多买菜门店端
                }
            );
            
            console.log(`[56xiniao] ✅ 提取成功: ${phone}`);
        }
    } catch (e) {
        console.log(`[56xiniao] ❌ 解析错误: ${e.message}`);
    }
}

$done({ body: $response.body });
