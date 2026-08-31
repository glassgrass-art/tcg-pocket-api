import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ success: false, error: 'Query parameter is required' });
  }

  try {
    // 优先匹配订单 ID 或 Player ID
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .or(`id.eq.${query},player_id.eq.${query}`)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    return res.status(200).json({ success: true, trades });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
