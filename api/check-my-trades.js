// api/check-my-trades.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  let cleanBaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!cleanBaseUrl || !supabaseKey) {
    return res.status(500).json({ success: false, error: 'Missing Supabase Env Variables' });
  }

  const { playerId } = req.query;
  const cleanPlayerId = (playerId || '').replace(/\D/g, '');

  if (cleanPlayerId.length !== 16) {
    return res.status(400).json({ success: false, error: 'Invalid 16-digit Player ID' });
  }

  try {
    // 双向查询：匹配该用户是发起方或接收方的挂单
    let url = `${cleanBaseUrl}/rest/v1/trades?select=*&or=(player_id.eq.${cleanPlayerId},partner_player_id.eq.${cleanPlayerId})&order=created_at.desc`;
    
    let response = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    // 容错降级：如果双向查询失败，降级为单字段查询
    if (!response.ok && response.status === 400) {
      url = `${cleanBaseUrl}/rest/v1/trades?select=*&player_id=eq.${cleanPlayerId}&order=created_at.desc`;
      response = await fetch(url, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Supabase error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    // 格式化输出，适配你新增的 you_give 和 you_get 字段
    const formattedData = data.map(trade => {
      const isInitiator = trade.player_id === cleanPlayerId;
      const partnerId = isInitiator 
        ? (trade.partner_player_id || trade.matched_partner_id || '') 
        : trade.player_id;
      
      // 优先读取全新的 you_give/you_get 字段，并兼容旧的 matched_card 字段
      const youGiveCard = isInitiator 
        ? (trade.you_give || trade.matched_card_have) 
        : (trade.you_get || trade.matched_card_want);

      const youGetCard = isInitiator 
        ? (trade.you_get || trade.matched_card_want) 
        : (trade.you_give || trade.matched_card_have);

      const giveImg = trade.give_card_img || (youGiveCard ? `https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/images/cards/${youGiveCard}.webp` : '');
      const getImg = trade.get_card_img || (youGetCard ? `https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/images/cards/${youGetCard}.webp` : '');

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
