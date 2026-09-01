// 当在数据库找到匹配的目标 trade 时：
const partnerTrade = matchingTrades[0];

// 1. 更新原有的挂单记录（Partner 的订单）
await fetch(`${cleanBaseUrl}/rest/v1/trades?id=eq.${partnerTrade.id}`, {
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

// 2. 插入当前用户的挂单记录（状态直接设为 matched）
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
    status: 'matched',
    partner_player_id: partnerTrade.player_id, // 写入对方的 ID
    matched_card_have: matchedWantCard,
    matched_card_want: matchedHaveCard
  })
});
