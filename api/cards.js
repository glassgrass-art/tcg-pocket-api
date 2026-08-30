module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

  const { rarity = '', setId = '' } = req.query || {};
  
  // 获取环境变量中的 Token
  const GITHUB_TOKEN = process.env.GH_ACCESS_TOKEN;

  try {
    // 换用 GitHub 官方 API 路径获取文件内容（支持私密仓库）
    const DATA_URL = 'https://api.github.com/repos/glassgrass-art/tcg-pocket-api/contents/dist/cards.json';
    
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/vnd.github.v3.raw' // 关键：这个头可以直接把私密文件当成 raw 文本拿下来
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

      // 图片路径继续使用官方 API 链接或者你原先的私密直连
      const imgUrl = `https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/images/cards-by-set/${currentSetIdUpper}/${card.number}.webp`;

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
