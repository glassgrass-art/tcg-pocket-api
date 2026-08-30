import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端（自动读取 Vercel 环境变量）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // 跨域与请求方法限制
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

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
    const { data: candidates, error: searchErr } = await supabase
      .from('trades')
      .select('*')
      .eq('rarity', rarity)
      .eq('status', 'active')
      .neq('player_id', playerId);

    if (searchErr) throw searchErr;

    let matchedTrade = null;
    let cardAtoB = null;
    let cardBtoA = null;

    // 3. 交叉匹配算法：寻找是否有双向匹配的候选人
    if (candidates && candidates.length > 0) {
      for (const candidate of candidates) {
        // A(当前用户)的 HAVE 是否包含 B(候选人)的 WANT
        const commonHaveA_WantB = have.find(card => candidate.want_cards.includes(card));
        // B(候选人)的 HAVE 是否包含 A(当前用户)的 WANT
        const commonHaveB_WantA = candidate.have_cards.find(card => want.includes(card));

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
      const { data: newTrade, error: insertErr } = await supabase
        .from('trades')
        .insert([{
          player_id: playerId,
          rarity,
          have_cards: have,
          want_cards: want,
          status: 'matched',
          matched_with: matchedTrade.id,
          matched_card_have: cardAtoB,
          matched_card_want: cardBtoA
        }])
        .select()
        .single();

      if (insertErr) throw insertErr;

      // 更新对方挂单状态为 matched
      const { error: updateErr } = await supabase
        .from('trades')
        .update({
          status: 'matched',
          matched_with: newTrade.id,
          matched_card_have: cardBtoA,
          matched_card_want: cardAtoB
        })
        .eq('id', matchedTrade.id);

      if (updateErr) throw updateErr;

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
    const { data: pendingTrade, error: pendingErr } = await supabase
      .from('trades')
      .insert([{
        player_id: playerId,
        rarity,
        have_cards: have,
        want_cards: want,
        status: 'active'
      }])
      .select()
      .single();

    if (pendingErr) throw pendingErr;

    return res.status(200).json({
      success: true,
      matched: false,
      tradeId: pendingTrade.id,
      message: 'Added to trade pool! Waiting for a matching trader.'
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
