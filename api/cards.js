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

    // 你截图里实际存在的真实文件夹白名单（用于精准匹配目录名）
    const validFolders = [
      'B3a', 'A4a', 'A2b', 'A1', 'A3a', 'B1', 'B4a', 'PROMO-B', 
      'B2b', 'B3b', 'A1a', 'A4b', 'A2a', 'A2', 'A3b', 'B4', 
      'B3', 'B2', 'A3', 'A4', 'B1a', 'PROMO-A', 'B2a'
    ];
    const folderMap = {};
    validFolders.forEach(f => {
      folderMap[f.toLowerCase()] = f; // 用小写做key，映射到真实大小写文件夹名
    });

    allCards.forEach(card => {
      const rawSet = (card.set || 'other').trim();
      const lowerSet = rawSet.toLowerCase();
      const currentSetId = lowerSet;
      const currentSetIdUpper = rawSet.toUpperCase();

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

      // 智能匹配你截图里实际存在的文件夹目录名称，防止因大小写或横杠导致图片找不到
      let matchedFolderName = folderMap[lowerSet] || rawSet;
      // 如果属于 promo 这类，做个兜底
      if (lowerSet.includes('promo')) {
        if (lowerSet.includes('b')) matchedFolderName = 'PROMO-B';
        else matchedFolderName = 'PROMO-A';
      }

      // 拼出精准指向你仓库中对应文件夹的图片路径
      const imgUrl = `https://raw.githubusercontent.com/glassgrass-art/tcg-pocket-api/main/dist/images/cards-by-set/${matchedFolderName}/${card.number}.webp`;

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
