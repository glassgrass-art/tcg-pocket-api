module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

  const { rarity = '', setId = '' } = req.query || {};

  try {
    // 切换到 flibustier 的完整数据源
    const DATA_URL = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/cards.json';
    
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
      // flibustier 数据结构中字段通常为 card.set, card.number, card.name, card.rarity, card.image
      const currentSetId = (card.set || 'other').toLowerCase();
      const currentSetIdUpper = currentSetId.toUpperCase();

      if (targetSetId && currentSetId !== targetSetId) return;

      // 直接获取官方规范稀有度代号 (如 C, U, R, RR, SR, AR, SAR, IM, UR, S, SSR 等)
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

      // flibustier 的图片拼接规则: cards-by-set/{set}/{number}.webp 或自带 image 字段
      const imgUrl = card.image 
        ? `https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/images/${card.image}` 
        : `https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/cards-by-set/${currentSetId}/${card.number}.webp`;

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
