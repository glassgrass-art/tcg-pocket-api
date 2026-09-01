export default async function handler(req, res) {
  // 1. 设置 CORS 响应头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { player_id, rarity, have_card_id, want_card_id } = req.body || {};

    // 2. 校验前端入参
    if (!player_id || !rarity || !have_card_id || !want_card_id) {
      return res.status(400).json({ error: 'Missing required trade parameters.' });
    }

    const cleanPlayerId = String(player_id).trim();
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment variables are missing on server.');
    }

    const cleanBaseUrl = supabaseUrl.replace(/\/$/, '');

    // 3. 查询 Supabase 数据库中是否有反向匹配的挂单 (status = open)
    const matchQueryUrl = `${cleanBaseUrl}/rest/v1/trades?rarity=eq.${encodeURIComponent(rarity)}&have_card_id=eq.${encodeURIComponent(want_card_id)}&want_card_id=eq.${encodeURIComponent(have_card_id)}&status=eq.open&limit=1`;

    const matchRes = await fetch(matchQueryUrl, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!matchRes.ok) {
      const errText = await matchRes.text();
      throw new Error(`Failed to query trades from Supabase: ${errText}`);
    }

    const matchingTrades = await matchRes.json();

    // 4. 判断是否找到撮合对象
    if (matchingTrades && matchingTrades.length > 0) {
      // 当在数据库找到匹配的目标 trade 时：
      const partnerTrade = matchingTrades[0];
      const matchedHaveCard = partnerTrade.have_card_id;
      const matchedWantCard = partnerTrade.want_card_id;

      // 4a. 更新原有的挂单记录（Partner 的订单）
      const patchRes = await fetch(`${cleanBaseUrl}/rest/v1/trades?id=eq.${partnerTrade.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          status: 'matched',
          partner_player_id: cleanPlayerId, // 写入当前用户的 ID
          matched_card_have: matchedHaveCard,
          matched_card_want: matchedWantCard
        })
      });

      if (!patchRes.ok) {
        const patchErr = await patchRes.text();
        throw new Error(`Failed to patch partner trade: ${patchErr}`);
      }

      // 4b. 插入当前用户的挂单记录（状态直接设为 matched）
      const newTradeRes = await fetch(`${cleanBaseUrl}/rest/v1/trades`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          player_id: cleanPlayerId,
          rarity,
          have_card_id,
          want_card_id,
          status: 'matched',
          partner_player_id: partnerTrade.player_id, // 写入对方的 ID
          matched_card_have: want_card_id,
          matched_card_want: have_card_id
        })
      });

      if (!newTradeRes.ok) {
        const insertErr = await newTradeRes.text();
        throw new Error(`Failed to insert matched trade for user: ${insertErr}`);
      }

      const insertedTrade = await newTradeRes.json();

      return res.status(200).json({
        success: true,
        matched: true,
        message: 'Instant match found!',
        trade: insertedTrade[0] || insertedTrade
      });

    } else {
      // 5. 若没有找到匹配订单，正常新建一个状态为 'open' 的挂单
      const createRes = await fetch(`${cleanBaseUrl}/rest/v1/trades`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          player_id: cleanPlayerId,
          rarity,
          have_card_id,
          want_card_id,
          status: 'open'
        })
      });

      if (!createRes.ok) {
        const createErr = await createRes.text();
        throw new Error(`Failed to create open trade: ${createErr}`);
      }

      const createdTrade = await createRes.json();

      return res.status(200).json({
        success: true,
        matched: false,
        message: 'Trade request listed successfully.',
        trade: createdTrade[0] || createdTrade
      });
    }

  } catch (error) {
    console.error('Submit Trade Error:', error);
    return res.status(500).json({
      error: error.message || 'Internal Server Error'
    });
  }
}
