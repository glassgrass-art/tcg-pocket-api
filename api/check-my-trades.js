export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  let cleanBaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!cleanBaseUrl || !supabaseKey) {
    return res.status(500).json({ success: false, error: 'Missing Supabase Env Variables' });
  }

  const { playerId } = req.query;
  const cleanPlayerId = (playerId || '').replace(/\D/g, '');

  if (cleanPlayerId.length !== 16) {
    return res.status(400).json({ success: false, error: 'Invalid 16-digit Player ID' });
  }

  try {
    const url = `${cleanBaseUrl}/rest/v1/trades?select=*&player_id=eq.${encodeURIComponent(cleanPlayerId)}&order=created_at.desc`;
    const response = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Supabase error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
