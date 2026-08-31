export default async function handler(req, res) {
  // 跨域与请求方法限制
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      success: false,
      error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY in Vercel environment variables.'
    });
  }

  // 统一封装 Supabase REST API 请求辅助函数
  const supabaseFetch = async (path, options = {}) => {
    const url = `${supabaseUrl}/rest/v1${path}`;
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Supabase Error (${response.status}): ${text}`);
    }

    return text ? JSON.parse(text) : null;
  };

  try {
    const { playerId, rarity, have, want } = req.body;

    // 1. 数据合法性防呆校验
    if (!playerId || playerId.replace(/\D/g, '').length !== 16) {
      return res.status(400).json({ success: false, error: 'Invalid 16-digit Player ID format' });
    }
    if (!rarity || !have || !want || !Array.isArray(have) || !Array.isArray(want)) {
      return res.status(400).json({ success: false, error: 'Invalid payload parameters' });
    }
    if (have.length === 0 || want.length === 0) {
      return res.status(400).json({ success: false, error: 'Must select at least ONE Have card and ONE Want card' });
    }

    // 2. 搜索数据库中同稀有度、处于 active 状态且非自己的挂单
    const searchPath = `/trades?select=*&rarity=eq.${encodeURIComponent(rarity)}&status=eq.active&player_id=neq.${encodeURIComponent(playerId)}`;
    const candidates = await supabaseFetch(searchPath, { method: 'GET' });

    let matchedTrade = null;
    let cardAtoB = null;
    let cardBtoA = null;

    // 3. 交叉匹配算法：寻找是否有双向匹配的候选人
    if (candidates && candidates.length > 0) {
      for (const candidate of candidates) {
        // A(当前用户)的 HAVE 是否包含 B(候选人)的 WANT
        const commonHaveA_WantB = have.find(card => candidate.want_cards?.includes(card));
        // B(候选人)的 HAVE 是否包含 A(当前用户)的 WANT
        const commonHaveB_WantA = candidate.have_cards?.find(card => want.includes(card));

        if (commonHaveA_WantB && commonHaveB_WantA) {
          matchedTrade = candidate;
          cardAtoB = commonHaveA_WantB; // A 给 B 的卡
          cardBtoA = commonHaveB_WantA; // B 给 A 的卡
          break;
        }
      }
    }

    // 4. 场景 A：命中匹配，更新双方订单状态为 matched
    if (matchedTrade) {
      // 写入当前用户的匹配完成记录
      const newTrades = await supabaseFetch('/trades', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          player_id: playerId,
          rarity,
          have_cards: have,
          want_cards: want,
          status: 'matched',
          matched_with: matchedTrade.id,
          matched_card_have: cardAtoB,
          matched_card_want: cardBtoA
        })
      });

      const newTrade = newTrades[0];

      // 更新对方挂单状态为 matched
      await supabaseFetch(`/trades?id=eq.${matchedTrade.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'matched',
          matched_with: newTrade.id,
          matched_card_have: cardBtoA,
          matched_card_want: cardAtoB
        })
      });

      return res.status(200).json({
        success: true,
        matched: true,
        message: 'Match found instantly!',
        partnerPlayerId: matchedTrade.player_id,
        youGive: cardAtoB,
        youGet: cardBtoA
      });
    }

    // 5. 场景 B：未命中匹配，将当前订单作为 active 写入数据库等待匹配
    const pendingTrades = await supabaseFetch('/trades', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({
        player_id: playerId,
        rarity,
        have_cards: have,
        want_cards: want,
        status: 'active'
      })
    });

    const pendingTrade = pendingTrades[0];

    return res.status(200).json({
      success: true,
      matched: false,
      tradeId: pendingTrade.id,
      message: 'Added to trade pool! Waiting for a matching trader.'
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
