export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  let cleanBaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!cleanBaseUrl || !supabaseKey) {
    return res.status(500).json({ success: false, error: 'Missing Supabase Env Variables' });
  }

  const { playerId } = req.query;
  const cleanPlayerId = (playerId || '').replace(/\D/g, '');

  if (cleanPlayerId.length !== 16) {
    return res.status(400).json({ success: false, error: 'Invalid 16-digit Player ID' });
  }

  try {
    // 1. 查询该玩家的所有挂单（无论是发起方还是被撮合方）
    const url = `${cleanBaseUrl}/rest/v1/trades?select=*&or=(player_id.eq.${cleanPlayerId},partner_player_id.eq.${cleanPlayerId})&order=created_at.desc`;
    const response = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Supabase error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    // 2. 规范化返回数据：确保始终能准确拿到“对方 Player ID”以及卡牌图片
    const formattedData = data.map(trade => {
      const isInitiator = trade.player_id === cleanPlayerId;
      
      // 对方 ID
      const partnerId = isInitiator ? trade.partner_player_id : trade.player_id;
      
      // 我送出的 & 我收到的
      const youGiveCard = isInitiator ? trade.matched_card_have : trade.matched_card_want;
      const youGetCard = isInitiator ? trade.matched_card_want : trade.matched_card_have;

      // 如果数据库存储了图片 URL，直接使用；否则生成默认 CDN 拼接规则
      const giveImg = trade.give_card_img || `https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/images/cards/${youGiveCard}.webp`;
      const getImg = trade.get_card_img || `https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/images/cards/${youGetCard}.webp`;

      return {
        ...trade,
        displayPartnerId: partnerId || 'Matching...',
        youGiveCard,
        youGetCard,
        giveImg,
        getImg
      };
    });

    return res.status(200).json({ success: true, data: formattedData });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
