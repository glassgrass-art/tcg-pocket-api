module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

  const { rarity = '', setId = '' } = req.query || {};

  try {
    // 1. 将 DATA_URL 改为你自己的 GitHub 仓库 raw 链接或 jsDelivr 加速链接
    // （注意：因为你的仓库是 Private 私密的，jsDelivr 可能会有缓存限制，建议直接用 GitHub 原始文件 raw 链接或带有 token 的访问，如果公开了仓库则可以直接用 jsDelivr）
    const DATA_URL = 'https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/cards.json';
    
    const response = await fetch(DATA_URL, {
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        // 如果仓库是 Private 私密的，这里以后可能需要带上你的 GitHub Personal Access Token：
        // 'Authorization': 'token 你的GitHubToken'
      },
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

      // 2. 将图片路径拼接指向你自己的仓库路径结构 (对照你刚截图里的目录结构：dist/images/cards-by-set/套装名/卡号.webp)
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
