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
    const body = req.body || {};

    // 兼容前端不同的命名方式（下划线和驼峰）
    const player_id = body.player_id || body.playerId;
    const rarity = body.rarity;
    const have_card_id = body.have_card_id || body.haveCardId || body.have_card;
    const want_card_id = body.want_card_id || body.wantCardId || body.want_card;

    // 2. 校验参数
    if (!player_id || !rarity || !have_card_id || !want_card_id) {
      return res.status(400).json({
        error: 'Missing required trade parameters.',
        received: { player_id, rarity, have_card_id, want_card_id }
      });
    }

    const cleanPlayerId = String(player_id).trim();
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment variables are missing on server.');
    }

    const cleanBaseUrl = supabaseUrl.replace(/\/$/, '');

    // 3. 查询 Supabase 中是否存在反向匹配订单 (status = open)
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

    // 4. 实时匹配分支
    if (matchingTrades && matchingTrades.length > 0) {
      const partnerTrade = matchingTrades[0];
      const matchedHaveCard = partnerTrade.have_card_id;
      const matchedWantCard = partnerTrade.want_card_id;

      // 更新对方订单状态为 matched
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
          partner_player_id: cleanPlayerId,
          matched_card_have: matchedHaveCard,
          matched_card_want: matchedWantCard
        })
      });

      if (!patchRes.ok) {
        const patchErr = await patchRes.text();
        throw new Error(`Failed to patch partner trade: ${patchErr}`);
      }

      // 创建当前用户已匹配的订单
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
          partner_player_id: partnerTrade.player_id,
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
      // 5. 无匹配时直接新建 open 状态订单
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
