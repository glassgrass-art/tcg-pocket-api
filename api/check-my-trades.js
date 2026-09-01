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

  const playerId = req.query.player_id || req.query.playerId;
  const cleanPlayerId = (playerId || '').replace(/\D/g, '');

  if (cleanPlayerId.length !== 16) {
    return res.status(400).json({ success: false, error: 'Invalid 16-digit Player ID' });
  }

  try {
    let url = `${cleanBaseUrl}/rest/v1/trades?select=*&or=(player_id.eq.${cleanPlayerId},partner_player_id.eq.${cleanPlayerId})&order=created_at.desc`;
    
    let response = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

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

    const formattedData = data.map(trade => {
      const isInitiator = trade.player_id === cleanPlayerId;
      const partnerId = isInitiator 
        ? (trade.partner_player_id || trade.matched_partner_id || '') 
        : trade.player_id;
      
      // 兼容各个版本的字段名称映射
      const haveCards = trade.have_cards || trade.you_give || trade.matched_card_have || [];
      const wantCards = trade.want_cards || trade.you_get || trade.matched_card_want || [];

      return {
        ...trade,
        partner_player_id: partnerId || '',
        have_cards: haveCards,
        want_cards: wantCards
      };
    });

    return res.status(200).json({ 
      success: true, 
      trades: formattedData, 
      data: formattedData 
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
