export default async function handler(req, res) {
    // 强制设置 CORS / Content-Type
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        // 安全解析 body
        let body = req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                return res.status(400).json({ success: false, error: 'Invalid JSON body' });
            }
        }

        const { playerId, rarity, have, want } = body || {};

        // 严格校验四个必要参数
        if (
            !playerId || 
            !rarity || 
            !Array.isArray(have) || have.length === 0 || 
            !Array.isArray(want) || want.length === 0
        ) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required trade parameters (Must select at least 1 Have card and 1 Want card).' 
            });
        }

        // TODO: 此处插入你的 Supabase / 数据库写入及匹配逻辑
        // 示例返回值：
        return res.status(200).json({
            success: true,
            matched: false,
            tradeId: 'TRADE_' + Date.now()
        });

    } catch (error) {
        console.error('Submit Trade Error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    }
}
