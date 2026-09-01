// 提交交易匹配 (彻底修复数组提取与报错问题)
async function submitTradeMatch() {
    // 强制转换为纯 String 数组
    const haveIds = Object.keys(userTradeData.have || {}).filter(id => userTradeData.have[id] === true);
    const wantIds = Object.keys(userTradeData.want || {}).filter(id => userTradeData.want[id] === true);
    
    const rawPlayerId = document.getElementById('playerIdInput').value;
    const playerId = rawPlayerId.replace(/\D/g, '');

    // 调试打印：在控制台看看发出去的具体数据
    console.log("Submitting Trade Payload:", {
        playerId,
        rarity: currentRarity,
        have: haveIds,
        want: wantIds
    });

    if (haveIds.length === 0 || wantIds.length === 0) {
        alert(currentLang.startsWith('zh') ? '提交失败：必须至少选择 1 张【我有】和 1 张【想要】的卡牌！' : 'Submit failed: You must select at least 1 HAVE and 1 WANT card!');
        return;
    }

    if (playerId.length !== 16) {
        alert(currentLang.startsWith('zh') ? '请输入正确的 16 位 Player ID！' : 'Please enter a valid 16-digit Player ID.');
        return;
    }

    try {
        const res = await fetch('/api/submit-trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerId: String(playerId),
                rarity: String(currentRarity),
                have: haveIds,
                want: wantIds
            })
        });

        const data = await res.json();
        
        if (!res.ok || !data.success) {
            throw new Error(data.error || `Server error ${res.status}`);
        }

        if (data.matched) {
            const info = data.matchDetails || {};
            addNotification(`🎉 Instant Match Found! Partner ID: ${info.partnerPlayerId}`);
            alert(`🎉 匹配成功！\n\n对方 Player ID: ${info.partnerPlayerId}\n你将付出: ${info.youGive}\n你将获得: ${info.youGet}`);
        } else {
            addNotification(`✅ Trade request saved! Order ID: ${data.tradeId}`);
            alert(`✅ 挂单已成功提交至数据库！\n单号: ${data.tradeId}`);
        }

        postSubmitReset();

    } catch (err) {
        alert(`提交失败: ${err.message}`);
    }
}
