export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        const { playerId, rarity, have, want } = req.body;

        // 严格检查四个必要参数
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

        // ...写入数据库或匹配逻辑...
        
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
