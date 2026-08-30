module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

  const { rarity = '', setId = '' } = req.query || {};

  try {
    const DATA_URL = 'https://cdn.jsdelivr.net/npm/pokemon-tcg-pocket-database/dist/cards.json';
    
    const response = await fetch(DATA_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(9000)
    });

    if (!response.ok) throw new Error(`Upstream Data Fetch Failed: ${response.status}`);
    const allCards = await response.json();

    const targetNormRarity = rarity ? rarity.toUpperCase() : '';
    const targetSetId = setId ? setId.toLowerCase() : '';
    const setsMap = {};

    allCards.forEach(card => {
      const currentSetId = (card.set || 'other').toLowerCase();
      const currentSetIdUpper = currentSetId.toUpperCase();

      if (targetSetId && currentSetId !== targetSetId) return;

      const rawRarity = (card.rarity || 'C').toUpperCase();
      const normRarity = rawRarity;

      if (targetNormRarity && normRarity !== targetNormRarity) return;

      if (!setsMap[currentSetId]) {
        setsMap[currentSetId] = {
          setId: currentSetIdUpper,
          setName: `Expansion ${currentSetIdUpper}`,
          cards: []
        };
      }

      // 修正图片链接：优先使用 card.image 字段，如果没有则通过标准的 jsDelivr 路径拼接
      let imgUrl = card.image;
      if (imgUrl) {
        // 如果 image 字段是相对路径，拼上 jsDelivr 的 dist/images 目录
        if (!imgUrl.startsWith('http')) {
          imgUrl = `https://cdn.jsdelivr.net/npm/pokemon-tcg-pocket-database/dist/images/${imgUrl}`;
        }
      } else {
        // 兜底：使用标准编号路径
        imgUrl = `https://cdn.jsdelivr.net/npm/pokemon-tcg-pocket-database/dist/images/${currentSetId}/${card.number}.webp`;
      }

      setsMap[currentSetId].cards.push({
        id: `${currentSetIdUpper}-${card.number}`,
        name: card.name,
        setId: currentSetIdUpper,
        setName: `Expansion ${currentSetIdUpper}`,
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
    return res.status(500).json({ success: false, error: error.message });
  }
};
