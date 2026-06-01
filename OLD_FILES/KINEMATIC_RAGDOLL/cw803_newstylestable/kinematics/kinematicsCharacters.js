const RACES = {
   human: {
      name: 'human',
      headScale: 0.6,
      bodyScale: 1.0,
      legScale: 1.0,
      armScale: 1.0,
      heightMult: 1.0,
      widthMult: 1.0,
   },
};

const DEFAULT_CHARACTER = {
   // Skin
   skinColor: '#e8c090',
   skinLight: '#fff0d0',
   skinDark: '#a07050',

   // Eyes
   eyeColor: '#4080a0',
   eyeLight: '#60a0c0',
   eyeDark: '#204060',

   // Hair (null = bald)
   hairColor: null,
   hairStyle: 'none', // 'none', 'short', 'long', 'mohawk', etc

   // Pants/boots visible at ankles
   pantsColor: '#111',
   pantsDark: '#000',
   shoeColor: '#201008',
};

const WORLD_SEED = 42069;
const characterCache = new Map();

const createSeededRandom = (seed) => {
   let s = seed;
   const next = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
   };
   return {
      next,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      range: (min, max) => min + next() * (max - min),
      chance: (p) => next() < p,
      weightedPick: (items, weights) => {
         const total = weights.reduce((a, b) => a + b, 0);
         let r = next() * total;
         for (let i = 0; i < items.length; i++) {
            r -= weights[i];
            if (r <= 0) return items[i];
         }
         return items[items.length - 1];
      },
   };
};

const generateCharacter = (seed) => {
   const rng = createSeededRandom(seed);
   const raceOptions = ['human'];
   const raceWeights = [1,];
   const raceName = rng.weightedPick(raceOptions, raceWeights);
   const race = RACES[raceName];
   const humanSkins = [
      { base: '#e8c090', light: '#fff0d0', dark: '#a07050' },
      { base: '#c68642', light: '#daa06d', dark: '#8b5a2b' },
      { base: '#8d5524', light: '#b07040', dark: '#5c3a1a' },
      { base: '#ffdbac', light: '#fff0e0', dark: '#d4a574' },
      { base: '#f1c27d', light: '#ffd9a0', dark: '#c99550' },
   ];
   const eyeColors = [
      { base: '#4080a0', light: '#60a0c0', dark: '#204060' },
      { base: '#408040', light: '#60a060', dark: '#204020' },
      { base: '#6b4423', light: '#8b6243', dark: '#3b2413' },
      { base: '#808080', light: '#a0a0a0', dark: '#404040' },
      { base: '#202020', light: '#404040', dark: '#000000' },
      { base: '#40ff40', light: '#80ff80', dark: '#20a020' },
      { base: '#ff4040', light: '#ff8080', dark: '#a02020' },
   ];
   const bodyTypes = [
      //{ name: 'thin', torsoW: 0.08, armW: 0.035, legW: 0.035, weight: 0.85 },
      //{ name: 'average', torsoW: 0.10, armW: 0.045, legW: 0.045, weight: 1.0 },
      { name: 'athletic', torsoW: 0.11, armW: 0.05, legW: 0.048, weight: 1.05 },
      //{ name: 'stocky', torsoW: 0.12, armW: 0.05, legW: 0.055, weight: 1.15 },
      //{ name: 'heavy', torsoW: 0.14, armW: 0.055, legW: 0.06, weight: 1.25 },
   ];
   const torsoShapes = [
      { name: 'rectangle', shoulderMult: 1.0, waistMult: 1.0 },
      { name: 'triangle', shoulderMult: 1.2, waistMult: 0.8 },
      { name: 'inverted', shoulderMult: 0.85, waistMult: 1.1 },
      { name: 'barrel', shoulderMult: 0.95, waistMult: 1.15 },
      { name: 'hourglass', shoulderMult: 1.1, waistMult: 0.75 },
   ];
   const outfitTypes = [
      'shirt_pants', 'tshirt_pants',
   ];
   const fabricColors = [
      { base: '#7e8c96', light: '#9daab4', dark: '#5f6d77' },
      { base: '#a89f91', light: '#c6bdae', dark: '#8a8174' },
      { base: '#6b7c9e', light: '#8b9cbe', dark: '#4c5d7e' },
      { base: '#a0a0a0', light: '#c0c0c0', dark: '#808080' },
      { base: '#a36b6b', light: '#c48a8a', dark: '#824d4d' },
      { base: '#7da37d', light: '#9cc49c', dark: '#5f845f' },
      { base: '#8c8ca3', light: '#acacca', dark: '#6d6d84' },
      { base: '#a37d7d', light: '#c49c9c', dark: '#845f5f' },
      { base: '#6b969e', light: '#8bb6be', dark: '#4c777e' },
      { base: '#9e9e7c', light: '#bebea0', dark: '#7f7f5d' },
   ];
   const hairColors = [
      null, '#402010', '#1a1a1a', '#8b4513', '#d4a460', '#888888', '#aa3030',
   ];
   const hairStyles = ['none', 'short', 'buzzcut', 'mohawk'];
   let skin;
   if (raceName === 'human') { skin = { ...rng.pick(humanSkins), type: 'human' }; }
   let eyes = rng.pick(eyeColors.slice(0, 4));
   const bodyType = rng.pick(bodyTypes);
   const torsoShape = rng.pick(torsoShapes);
   const bodyVariation = {
      torsoW: bodyType.torsoW * rng.range(0.9, 1.1) * race.widthMult,
      armW: bodyType.armW * rng.range(0.9, 1.1) * race.widthMult,
      legW: bodyType.legW * rng.range(0.9, 1.1) * race.widthMult,
      weight: bodyType.weight * rng.range(0.95, 1.05),
      shoulderMult: torsoShape.shoulderMult * rng.range(0.95, 1.05),
      waistMult: torsoShape.waistMult * rng.range(0.95, 1.05),
   };
   const outfitType = rng.pick(outfitTypes);
   let topColor, bottomColor, sleeveStyle;
   topColor = rng.pick(fabricColors);
   bottomColor = rng.pick(fabricColors);
   sleeveStyle = outfitType.startsWith('tshirt') ? 'short' : 'long';
   let hairColor, hairStyle;
   hairColor = rng.pick(hairColors);
   hairStyle = hairColor ? rng.pick(hairStyles.slice(1)) : 'none';
   let ears = 'normal';
   let nose = 'normal';
   if (raceName === 'gnome') nose = 'big_round';
   else if (raceName === 'goblin') nose = 'long_pointy';
   else if (raceName === 'dwarf') nose = 'bulbous';
   return {
      race: raceName,
      raceData: race,
      skinColor: skin.base,
      skinLight: skin.light,
      skinDark: skin.dark,
      skinType: skin.type,
      eyeColor: eyes.base,
      eyeLight: eyes.light,
      eyeDark: eyes.dark,
      bodyType: bodyType.name,
      torsoShape: torsoShape.name,
      torsoW: bodyVariation.torsoW,
      armW: bodyVariation.armW,
      legW: bodyVariation.legW,
      weight: bodyVariation.weight,
      shoulderMult: bodyVariation.shoulderMult,
      waistMult: bodyVariation.waistMult,
      outfitType,
      topColor: topColor.base,
      topLight: topColor.light,
      topDark: topColor.dark,
      bottomColor: bottomColor.base,
      bottomLight: bottomColor.light,
      bottomDark: bottomColor.dark,
      sleeveStyle,
      hairColor,
      hairStyle,
      ears,
      nose,
      shoeColor: rng.pick(['#201008', '#111', '#2a2a2a']),
   };
};

const getCharacter = (entity) => {
   if (!entity || entity.id === undefined) return generateCharacter(0);
   if (!characterCache.has(entity.id)) {
      const seed = entity.id ^ WORLD_SEED;
      characterCache.set(entity.id, generateCharacter(seed));
   }
   return characterCache.get(entity.id);
};

const clearCharacterCache = () => { characterCache.clear(); };