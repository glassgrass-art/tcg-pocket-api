export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  let cleanBaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!cleanBaseUrl || !supabaseKey) {
    return res.status(500).json({ success: false, error: 'Missing Supabase Env Variables' });
  }

  const supabaseFetch = async (path, options = {}) => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${cleanBaseUrl}/rest/v1${cleanPath}`;

    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase API (${response.status}): ${text}`);
    return text ? JSON.parse(text) : null;
  };

  try {
    const { playerId, rarity, have, want } = req.body || {};

    // 1. 基础校验
    if (!playerId || String(playerId).replace(/\D/g, '').length !== 16) {
      return res.status(400).json({ success: false, error: 'Invalid 16-digit Player ID format' });
    }
    if (!rarity || !Array.isArray(have) || !Array.isArray(want) || have.length === 0 || want.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select rarity and cards.' });
    }

    // 2. 秒级检索是否有符合条件的活跃挂单（排除自己）
    const searchPath = `/trades?select=*&rarity=eq.${encodeURIComponent(rarity)}&status=eq.active&player_id=neq.${encodeURIComponent(playerId)}`;
    const candidates = await supabaseFetch(searchPath, { method: 'GET' });

    let matchedTrade = null;
    let cardAtoB = null; // 当前用户给对方的卡
    let cardBtoA = null; // 对方给当前用户的卡

    if (candidates && candidates.length > 0) {
      for (const candidate of candidates) {
        const candidateHave = candidate.have || candidate.have_cards || [];
        const candidateWant = candidate.want || candidate.want_cards || [];

        // 交叉匹配检查：A的Have在B的Want里，且B的Have在A的Want里
        const commonHaveA_WantB = have.find(card => candidateWant.includes(card));
        const commonHaveB_WantA = candidateHave.find(card => want.includes(card));

        if (commonHaveA_WantB && commonHaveB_WantA) {
          matchedTrade = candidate;
          cardAtoB = commonHaveA_WantB;
          cardBtoA = commonHaveB_WantA;
          break;
        }
      }
    }

    // 3. 场景 A：实时撮合成功！更新双方状态为 matched
    if (matchedTrade) {
      // 写入当前用户记录（标记状态为 matched）
      const newTrades = await supabaseFetch('/trades', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          player_id: playerId,
          rarity,
          have,
          want,
          have_cards: have,
          want_cards: want,
          status: 'matched',
          matched_with: matchedTrade.id,
          matched_card_have: cardAtoB,
          matched_card_want: cardBtoA
        })
      });

      const newTrade = newTrades ? newTrades[0] : null;

      // 更新被匹配对象的状态为 matched（锁定该单，防止被别人再次匹配）
      await supabaseFetch(`/trades?id=eq.${matchedTrade.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'matched',
          matched_with: newTrade ? newTrade.id : null,
          matched_card_have: cardBtoA,
          matched_card_want: cardAtoB
        })
      });

      // 直接向当前提交者返回对方的联系方式与交易卡牌
      return res.status(200).json({
        success: true,
        matched: true,
        message: '🎉 Match Found Instantly!',
        matchDetails: {
          partnerPlayerId: matchedTrade.player_id,
          youGive: cardAtoB,
          youGet: cardBtoA
        }
      });
    }

    // 4. 场景 B：未实时命中，进入 active 挂单池排队
    const pendingTrades = await supabaseFetch('/trades', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({
        player_id: playerId,
        rarity,
        have,
        want,
        have_cards: have,
        want_cards: want,
        status: 'active'
      })
    });

    return res.status(200).json({
      success: true,
      matched: false,
      tradeId: pendingTrades?.[0]?.id || 'N/A',
      message: 'Added to trade pool! Waiting for a matching trader.'
    });

  } catch (err) {
    console.error('Submit Trade Error:', err.message || err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
