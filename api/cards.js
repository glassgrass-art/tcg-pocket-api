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

    // 映射为标准的稀有度简写 (C, U, R, RR, SR, AR, SAR, IM, UR)
    function parseStandardRarity(rawRarity = '', cardMeta = {}) {
      const r = rawRarity.toString().trim();
      const s = r.toLowerCase().replace(/[^a-z0-9]/g, '');

      // 1. 冠位/Immersive (Crown / Immersive)
      if (r.includes('👑') || r.includes('♛') || s.includes('crown') || s.includes('ur')) {
        return 'UR';
      }
      if (s.includes('immersive') || s.includes('im')) {
        return 'IM';
      }

      // 2. 特殊插画 (SAR) / 超级稀有 (SR)
      if (s.includes('sar') || s.includes('specialart') || r.includes('★★') && s.includes('ex')) {
        return 'SAR';
      }
      if (s.includes('sr') || s.includes('2star') || r.includes('☆☆')) {
        return 'SR';
      }

      // 3. 艺术稀有 (AR) / 一星 (AR)
      if (s.includes('ar') || s.includes('artrare') || (r.includes('★') && !r.includes('☆☆'))) {
        return 'AR';
      }

      // 4. 双红卡 / 双星等对应高阶稀有度 (RR)
      if (s.includes('rr') || s.includes('doublerare') || (r.includes('◇◇◇◇') || s.includes('4diamond') && s.includes('ex'))) {
        return 'RR';
      }

      // 5. 常规等级：C, U, R
      const diamondCount = (r.match(/[◊◇◆]/g) || []).length;
      if (diamondCount === 3 || s.includes('3diamond') || s === 'r' || s.includes('rare')) {
        return 'R';
      }
      if (diamondCount === 2 || s.includes('2diamond') || s === 'u' || s.includes('uncommon')) {
        return 'U';
      }
      
      // 默认兜底为 Common (C) 或 1 钻
      return 'C';
    }

    const targetNormRarity = rarity ? rarity.toUpperCase() : '';
    const targetSetId = setId ? setId.toLowerCase() : '';
    const setsMap = {};

    allCards.forEach(card => {
      const currentSetId = (card.set_code || (card.id ? card.id.split('-')[0] : 'other')).toLowerCase();
      const rawSetName = card.set_name || currentSetId.toUpperCase();
      const currentSetName = `${rawSetName} (${currentSetId.toUpperCase()})`;

      if (targetSetId && currentSetId !== targetSetId) return;

      const rawRarity = card.rarity || '◇';
      const normRarity = parseStandardRarity(rawRarity, card);

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
        normRarity: normRarity, // 此时输出为标准的 'C', 'U', 'R', 'RR', 'SR', 'AR', 'SAR', 'IM', 'UR'
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
