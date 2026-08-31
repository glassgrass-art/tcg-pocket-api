export default async function handler(req, res) {
  // 设置 CORS 响应头
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  let supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const envErr = 'Missing SUPABASE_URL or SUPABASE_ANON_KEY in Vercel environment variables.';
    console.error(envErr);
    return res.status(500).json({ success: false, error: envErr });
  }

  // 1. 严格清洗域名根路径，防止重复拼上 /rest/v1
  let cleanBaseUrl = supabaseUrl.trim().replace(/\/+$/, '');
  cleanBaseUrl = cleanBaseUrl.replace(/\/rest\/v1\/?$/, ''); // 如果配置里写了 /rest/v1，先剥离掉

  // Supabase REST API 请求辅助函数
  const supabaseFetch = async (path, options = {}) => {
    // 确保 path 格式正确
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${cleanBaseUrl}/rest/v1${cleanPath}`;

    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Profile': 'public',
      'Accept-Profile': 'public',
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
    const text = await response.text();

    if (!response.ok) {
      console.error(`[Supabase Fetch Error] Target URL: ${url} | Status: ${response.status}`);
      throw new Error(`Supabase API (${response.status}): ${text}`);
    }

    return text ? JSON.parse(text) : null;
  };

  try {
    const { playerId, rarity, have, want } = req.body || {};

    // 2. 数据合法性校验
    if (!playerId || String(playerId).replace(/\D/g, '').length !== 16) {
      return res.status(400).json({ success: false, error: 'Invalid 16-digit Player ID format' });
    }
    if (!rarity || !have || !want || !Array.isArray(have) || !Array.isArray(want)) {
      return res.status(400).json({ success: false, error: 'Invalid payload parameters' });
    }
    if (have.length === 0 || want.length === 0) {
      return res.status(400).json({ success: false, error: 'Must select at least ONE Have card and ONE Want card' });
    }

    // 3. 查询活跃的待匹配条目
    const searchPath = `/trades?select=*&rarity=eq.${encodeURIComponent(rarity)}&status=eq.active&player_id=neq.${encodeURIComponent(playerId)}`;
    const candidates = await supabaseFetch(searchPath, { method: 'GET' });

    let matchedTrade = null;
    let cardAtoB = null;
    let cardBtoA = null;

    // 4. 交叉匹配算法
    if (candidates && candidates.length > 0) {
      for (const candidate of candidates) {
        const candidateHave = candidate.have_cards || candidate.have || [];
        const candidateWant = candidate.want_cards || candidate.want || [];

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

    // 5. 场景 A：即时命中匹配
    if (matchedTrade) {
      const newTrades = await supabaseFetch('/trades', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          player_id: playerId,
          rarity,
          have_cards: have,
          want_cards: want,
          have: have,
          want: want,
          status: 'matched',
          matched_with: matchedTrade.id,
          matched_card_have: cardAtoB,
          matched_card_want: cardBtoA
        })
      });

      const newTrade = newTrades ? newTrades[0] : null;

      await supabaseFetch(`/trades?id=eq.${matchedTrade.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'matched',
          matched_with: newTrade ? newTrade.id : null,
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

    // 6. 场景 B：存入挂单池等待匹配
    const pendingTrades = await supabaseFetch('/trades', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({
        player_id: playerId,
        rarity,
        have_cards: have,
        want_cards: want,
        have: have,
        want: want,
        status: 'active'
      })
    });

    const pendingTrade = pendingTrades ? pendingTrades[0] : {};

    return res.status(200).json({
      success: true,
      matched: false,
      tradeId: pendingTrade.id || 'N/A',
      message: 'Added to trade pool! Waiting for a matching trader.'
    });

  } catch (err) {
    console.error('Submit Trade Error:', err.message || err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
