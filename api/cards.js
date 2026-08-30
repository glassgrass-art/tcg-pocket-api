module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

  const { rarity = '', setId = '' } = req.query || {};
  const GITHUB_TOKEN = process.env.GH_ACCESS_TOKEN;

  try {
    const DATA_URL = 'https://api.github.com/repos/glassgrass-art/tcg-pocket-api/contents/dist/cards.json';
    
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/vnd.github.v3.raw'
    };
    
    if (GITHUB_TOKEN) {
      fetchHeaders['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    }

    const response = await fetch(DATA_URL, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(9000)
    });

    if (!response.ok) throw new Error(`Upstream Data Fetch Failed: ${response.status}`);
    const allCards = await response.json();

    const targetNormRarity = rarity ? rarity.toUpperCase() : '';
    const targetSetId = setId ? setId.toLowerCase() : '';
    const setsMap = {};

    const validFolders = [
      'B3a', 'A4a', 'A2b', 'A1', 'A3a', 'B1', 'B4a', 'PROMO-B', 
      'B2b', 'B3b', 'A1a', 'A4b', 'A2a', 'A2', 'A3b', 'B4', 
      'B3', 'B2', 'A3', 'A4', 'B1a', 'PROMO-A', 'B2a'
    ];
    const folderMap = {};
    validFolders.forEach(f => {
      folderMap[f.toLowerCase()] = f;
    });

    // 官方稀有度图标映射（对应你截图里的 dist/images/rarities/）
    const rarityIconMap = {
      'C': 'diamond.webp',
      'U': 'diamond.webp',
      'R': 'diamond.webp',
      'RR': 'diamond.webp',
      'AR': 'star.webp',
      'SR': 'shiny-star.webp',   // 二星（SR/SAR共用）
      'SAR': 'shiny-star.webp',  // 二星（SR/SAR共用）
      'UR': 'crown.webp',
      'S': 'shiny-star.webp',
      'SSR': 'shiny-star.webp'
    };

    allCards.forEach(card => {
      const rawSet = (card.set || 'other').trim();
      const lowerSet = rawSet.toLowerCase();
      const currentSetId = lowerSet;
      const currentSetIdUpper = rawSet.toUpperCase();

      if (targetSetId && currentSetId !== targetSetId) return;

      const rawRarity = (card.rarity || 'C').toUpperCase();

      // 1. 过滤掉 IM（无法交换）
      if (rawRarity === 'IM') return;

      // 2. 将 SAR 归一化合并到 SR（在游戏里都是二星）
      let normRarity = rawRarity;
      if (rawRarity === 'SAR') {
        normRarity = 'SR';
      }

      if (targetNormRarity && normRarity !== targetNormRarity) return;

      if (!setsMap[currentSetId]) {
        setsMap[currentSetId] = {
          setId: currentSetIdUpper,
          setName: `Expansion ${currentSetIdUpper}`,
          cards: []
        };
      }

      let matchedFolderName = folderMap[lowerSet] || rawSet;
      if (lowerSet.includes('promo')) {
        if (lowerSet.includes('b')) matchedFolderName = 'PROMO-B';
        else matchedFolderName = 'PROMO-A';
      }

      const imgUrl = `https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/images/cards-by-set/${matchedFolderName}/${card.number}.webp`;
      
      // 匹配官方稀有度图标路径
      const iconFileName = rarityIconMap[normRarity] || 'star.webp';
      const rarityIconUrl = `https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/images/rarities/${iconFileName}`;

      setsMap[currentSetId].cards.push({
        id: `${currentSetIdUpper}-${card.number}`,
        name: card.name,
        setId: currentSetIdUpper,
        setName: `Expansion ${currentSetIdUpper}`,
        rarity: rawRarity, // 保留原始稀有度标签
        normRarity: normRarity, // 归一化后的稀有度（SR和SAR会统一）
        image: imgUrl,
        rarityIcon: rarityIconUrl // 官方稀有度图标
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
