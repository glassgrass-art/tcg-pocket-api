module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

  const { rarity = '', setId = '' } = req.query || {};

  try {
    const DATA_URL = 'https://raw.githubusercontent.com/chase-mew/pokemon-tcg-pocket-cards/main/data/v5/cards.json';
    
    const response = await fetch(DATA_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(9000)
    });

    if (!response.ok) throw new Error(`Upstream Data Fetch Failed: ${response.status}`);
    const allCards = await response.json();

    // 细分所有稀有度档位
    function parseNormRarity(rawRarity = '') {
      const r = rawRarity.toString().trim();
      const s = r.toLowerCase().replace(/[^a-z0-9]/g, '');

      // 1. 菱形系列 (1 ~ 4 钻)
      if (r.includes('◊') || r.includes('◇') || r.includes('◆') || s === '1' || s.includes('diamond') || s === 'common') {
        const diamondCount = (r.match(/[◊◇◆]/g) || []).length;
        if (diamondCount >= 4 || s.includes('4diamond')) return '4diamond';
        if (diamondCount === 3 || s.includes('3diamond')) return '3diamond';
        if (diamondCount === 2 || s.includes('2diamond')) return '2diamond';
        return '1diamond';
      }

      // 2. 皇冠卡
      if (r.includes('👑') || r.includes('♛') || s.includes('crown')) {
        return 'crown';
      }

      // 3. 彩色星星 (SAR 等 / 彩色双星或特殊闪星)
      if (s.includes('sar') || s.includes('2starcolor') || r.includes('★★') || (r.includes('★') && (s.includes('ex') || s.includes('special')))) {
        return 'shinystar2';
      }

      // 4. 彩色单星 (AR 等)
      if (s === 'ar' || s.includes('1starcolor') || (r.includes('★') && !r.includes('☆☆') && !r.includes('☆☆☆'))) {
        // 如果是纯彩色单星
        return 'shinystar1';
      }

      // 5. 普通三星 (☆☆☆)
      if (r.includes('☆☆☆') || s.includes('3star') || s.includes('ur')) {
        return '3star';
      }

      // 6. 普通二星 (☆☆)
      if (r.includes('☆☆') || s.includes('2star') || s.includes('sr')) {
        return '2star';
      }

      // 7. 普通一星 (☆ 或 单星)
      if (r.includes('☆') || s.includes('1star')) {
        return '1star';
      }

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
    return res.status(500).json({ success: false, error: error.message });
  }
};
