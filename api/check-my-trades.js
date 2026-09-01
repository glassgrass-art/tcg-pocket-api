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

  // 兼容前端传参 player_id 或 playerId
  const playerId = req.query.player_id || req.query.playerId;
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

    // 容错降级：如果双向查询失败（如部分旧表结构不支持or语法），降级为单字段查询
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

    // 格式化输出，全面适配新旧字段及前端展示所需属性
    const formattedData = data.map(trade => {
      const isInitiator = trade.player_id === cleanPlayerId;
      const partnerId = isInitiator 
        ? (trade.partner_player_id || trade.matched_partner_id || '') 
        : trade.player_id;
      
      // 兼容解析新旧字段：you_give / have_cards / matched_card_have
      const youGiveCard = isInitiator 
        ? (trade.you_give || trade.have_cards || trade.matched_card_have) 
        : (trade.you_get || trade.matched_card_want);

      const youGetCard = isInitiator 
        ? (trade.you_get || trade.matched_card_want) 
        : (trade.you_give || trade.have_cards || trade.matched_card_have);

      const giveImg = trade.give_card_img || (typeof youGiveCard === 'string' && youGiveCard ? `https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/images/cards/${youGiveCard}.webp` : '');
      const getImg = trade.get_card_img || (typeof youGetCard === 'string' && youGetCard ? `https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/images/cards/${youGetCard}.webp` : '');

      return {
        ...trade,
        partner_player_id: partnerId || '', // 确保前端能直接取到
        displayPartnerId: partnerId || 'Matching...',
        youGiveCard,
        youGetCard,
        giveImg,
        getImg
      };
    });

    // 同时返回 trades 和 data 兼容前端两种解构习惯
    return res.status(200).json({ 
      success: true, 
      trades: formattedData, 
      data: formattedData 
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
