module.exports = async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

  const { rarity = '', setId = '' } = req.query || {};

  try {
    const DATA_URL = 'https://raw.githubusercontent.com/chase-mew/pokemon-tcg-pocket-cards/main/data/v5/cards.json';
    
    const response = await fetch(DATA_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(9000)
    });

    if (!response.ok) {
      throw new Error(`Upstream Data Fetch Failed: ${response.status}`);
    }

    const allCards = await response.json();

    // 稀有度归一化映射
    function parseNormRarity(rawRarity = '') {
      const r = rawRarity.trim();
      if (r === '◇') return '1diamond';
      if (r === '◇◇') return '2diamond';
      if (r === '◇◇◇') return '3diamond';
      if (r === '◇◇◇◇') return '4diamond';
      if (r === '☆') return '1star';
      if (r === '☆☆' || r === '★') return '2star';
      if (r === '☆☆☆') return '3star';
      if (r === '👑' || r === '♛') return 'crown';
      if (r.toUpperCase().includes('SHINY') || r.toUpperCase().startsWith('S')) return 'shinystar1';
      return 'other';
    }

    const targetNormRarity = rarity ? rarity.toLowerCase() : '';
    const targetSetId = setId ? setId.toLowerCase() : '';
    const setsMap = {};

    allCards.forEach(card => {
      const currentSetId = (card.set_code || (card.id ? card.id.split('-')[0] : 'other')).toLowerCase();
      const rawSetName = card.set_name || currentSetId.toUpperCase();
      const currentSetName = `${rawSetName} (${currentSetId.toUpperCase()})`;

      if (targetSetId && currentSetId !== targetSetId) return;

      const rawRarity = card.rarity || '◇';
      const normRarity = parseNormRarity(rawRarity);

      if (targetNormRarity && normRarity !== targetNormRarity) return;

      if (!setsMap[currentSetId]) {
        setsMap[currentSetId] = {
          setId: currentSetId.toUpperCase(),
          setName: currentSetName,
          cards: []
        };
      }

      const imgUrl = card.image || `https://raw.githubusercontent.com/chase-mew/pokemon-tcg-pocket-cards/main/images/webp/cards/${currentSetId}/${card.id.split('-')[1] || card.id}.webp`;

      setsMap[currentSetId].cards.push({
        id: card.id,
        name: card.name,
        setId: currentSetId.toUpperCase(),
        setName: currentSetName,
        rarity: rawRarity,
        normRarity: normRarity,
        image: imgUrl
      });
    });

    const result = Object.values(setsMap).map(set => ({
      ...set,
      totalCards: set.cards.length
    }));

    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to process cards database', 
      details: error.message 
    });
  }
};
