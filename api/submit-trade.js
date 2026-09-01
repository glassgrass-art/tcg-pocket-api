// api/submit-trade.js
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端（使用 Service Role Key 避免 RLS 权限限制）
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
}

export default async function handler(req, res) {
  // 设置 CORS 与 HTTP 方法检查
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // 1. 检查环境变量配置
  if (!supabase) {
    console.error('Supabase Client Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ 
      success: false, 
      error: 'Database configuration missing on server. Check Vercel environment variables.' 
    });
  }

  const { playerId, rarity, have, want } = req.body || {};

  // 2. 校验入参格式
  if (!playerId || playerId.length !== 16 || !rarity || !Array.isArray(have) || !have.length || !Array.isArray(want) || !want.length) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid payload. Ensure 16-digit playerId, valid rarity, and non-empty have/want arrays.' 
    });
  }

  try {
    // 3. 超时包装函数，确保单个数据库请求最多等待 8 秒
    const withTimeout = (promise, ms = 8000) => {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Database Operation Timed Out')), ms);
      });
      return Promise.race([
        promise.then(res => { clearTimeout(timeoutId); return res; }),
        timeoutPromise
      ]);
    };

    // 4. 在数据库中寻找潜在匹配订单 (限制查找前 20 条 pending 挂单)
    const { data: candidateTrades, error: searchErr } = await withTimeout(
      supabase
        .from('trades')
        .select('*')
        .eq('rarity', rarity)
        .eq('status', 'pending')
        .neq('player_id', playerId)
        .order('created_at', { ascending: true })
        .limit(20)
    );

    if (searchErr) {
      console.error('Supabase Search Error:', searchErr);
      throw new Error(`Search failed: ${searchErr.message}`);
    }

    let matchedTrade = null;
    let youGiveCard = null;
    let youGetCard = null;

    if (candidateTrades && candidateTrades.length > 0) {
      for (const trade of candidateTrades) {
        // 检查对方想要的卡片是否在你的 HAVE 列表中
        const giveMatch = have.find(hId => trade.want_cards.includes(hId));
        // 检查你想要的卡片是否在对方的 HAVE 列表中
        const getMatch = want.find(wId => trade.have_cards.includes(wId));

        if (giveMatch && getMatch) {
          matchedTrade = trade;
          youGiveCard = giveMatch;
          youGetCard = getMatch;
          break;
        }
      }
    }

    // 5A. 撮合成功：更新对方订单，并插入自己的已撮合订单
    if (matchedTrade) {
      // 更新对方挂单状态
      await withTimeout(
        supabase
          .from('trades')
          .update({
            status: 'matched',
            partner_player_id: playerId,
            you_give: youGetCard,
            you_get: youGiveCard,
            updated_at: new Date().toISOString()
          })
          .eq('id', matchedTrade.id)
      );

      // 插入自己的已被撮合记录
      const { data: myTradeRecord, error: myTradeErr } = await withTimeout(
        supabase
          .from('trades')
          .insert([{
            player_id: playerId,
            rarity: rarity,
            have_cards: have,
            want_cards: want,
            status: 'matched',
            partner_player_id: matchedTrade.player_id,
            you_give: youGiveCard,
            you_get: youGetCard,
            created_at: new Date().toISOString()
          }])
          .select()
          .single()
      );

      if (myTradeErr) throw myTradeErr;

      return res.status(200).json({
        success: true,
        matched: true,
        tradeId: myTradeRecord?.id,
        matchDetails: {
          partnerPlayerId: matchedTrade.player_id,
          youGive: youGiveCard,
          youGet: youGetCard
        }
      });
    }

    // 5B. 未找到撮合：直接保存新挂单入库
    const { data: newTrade, error: insertErr } = await withTimeout(
      supabase
        .from('trades')
        .insert([{
          player_id: playerId,
          rarity: rarity,
          have_cards: have,
          want_cards: want,
          status: 'pending',
          created_at: new Date().toISOString()
        }])
        .select()
        .single()
    );

    if (insertErr) {
      console.error('Supabase Insert Error:', insertErr);
      throw new Error(`Insert failed: ${insertErr.message}`);
    }

    return res.status(200).json({
      success: true,
      matched: false,
      tradeId: newTrade.id
    });

  } catch (err) {
    console.error('API Exec Failure:', err);
    return res.status(500).json({ 
      success: false, 
      error: err.message || 'Internal Server Error' 
    });
  }
}
