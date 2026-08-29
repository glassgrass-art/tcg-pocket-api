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

    // 终极宽容的稀有度归一化函数：完美兼容 ◊、◇、◆ 各种变体与数量统计
    function parseNormRarity(rawRarity = '') {
      const r = rawRarity.toString().trim();
      const s = r.toLowerCase().replace(/[^a-z0-9]/g, '');

      // 1. 动态统计所有形式的菱形数量 (支持 ◊、◇、◆)
      if (r.includes('◊') || r.includes('◇') || r.includes('◆') || s === '1' || s.includes('diamond') || s === 'common') {
        const diamondCount = (r.match(/[◊◇◆]/g) || []).length;
        
        if (diamondCount >= 4 || s.includes('4diamond') || s.includes('four')) return '4diamond';
        if (diamondCount === 3 || s.includes('3diamond') || s.includes('three')) return '3diamond';
        if (diamondCount === 2 || s.includes('2diamond') || s.includes('two')) return '2diamond';
        
        // 默认或者只有 1 个菱形符号时
        return '1diamond';
      }

      // 2. 匹配彩色星星 (★) 与 双星 (☆☆) ➔ 归类为 2星 (2star)
      if (r.includes('★') || r.includes('☆☆') || s.includes('2star') || s.includes('sar') || s.includes('sr') || s.includes('twostars')) {
        return '2star';
      }

      // 3. 匹配普通单星 (☆) ➔ 归类为 1星 (1star)
      if (r.includes('☆') || s.includes('1star') || s.includes('onestar') || s === 'ar') {
        return '1star';
      }

      // 4. 匹配三星
      if (r.includes('☆☆☆') || s.includes('3star') || s.includes('threestars') || s.includes('ur')) {
        return '3star';
      }

      // 5. 匹配皇冠
      if (r.includes('👑') || r.includes('♛') || s.includes('crown')) {
        return 'crown';
      }

      // 6. 闪卡 / 其他
      if (s.includes('shiny') || r.startsWith('S')) {
        return 'shinystar1';
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
        rarity: rawRarity,       // 原始符号（例如网页下方展示的 ◊ 等）
        normRarity: normRarity,   // 归一化英文标准值（用于筛选）
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
