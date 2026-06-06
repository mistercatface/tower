const RACES = { human: { name: "human", headScale: 0.6, bodyScale: 1.0, legScale: 1.0, armScale: 1.0, heightMult: 1.0, widthMult: 1.0 } };
const WORLD_SEED = 42069;
const FABRIC_PALETTES = [
    { base: "#7e8c96", light: "#9daab4", dark: "#5f6d77" },
    { base: "#6b7c9e", light: "#8b9cbe", dark: "#4c5d7e" },
    { base: "#7da37d", light: "#9cc49c", dark: "#5f845f" },
    { base: "#6b969e", light: "#8bb6be", dark: "#4c777e" },
];
const HUMAN_SKINS_BY_LIGHTNESS = [
    { base: "#ffdbac", light: "#fff0e0", dark: "#d4a574", type: "human" },
    { base: "#e8c090", light: "#fff0d0", dark: "#a07050", type: "human" },
    { base: "#f1c27d", light: "#ffd9a0", dark: "#c99550", type: "human" },
    { base: "#c68642", light: "#daa06d", dark: "#8b5a2b", type: "human" },
    { base: "#8d5524", light: "#b07040", dark: "#5c3a1a", type: "human" },
];
function createSeededRandom(seed) {
    let s = seed;
    const next = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
    return { next, pick: (arr) => arr[Math.floor(next() * arr.length)], range: (min, max) => min + next() * (max - min) };
}
function hashEnemyType(type) {
    let h = 0;
    for (let i = 0; i < type.length; i++) h = (Math.imul(31, h) + type.charCodeAt(i)) | 0;
    return h;
}
function applyFabricPalette(char, palette) {
    return { ...char, topColor: palette.base, topLight: palette.light, topDark: palette.dark };
}
export function generateCharacter(seed) {
    const rng = createSeededRandom(seed);
    const race = RACES.human;
    const eyeColors = [
        { base: "#4080a0", light: "#60a0c0", dark: "#204060" },
        { base: "#408040", light: "#60a060", dark: "#204020" },
        { base: "#6b4423", light: "#8b6243", dark: "#3b2413" },
        { base: "#808080", light: "#a0a0a0", dark: "#404040" },
    ];
    const bodyTypes = [{ name: "athletic", torsoW: 0.11, armW: 0.05, legW: 0.048, weight: 1.05 }];
    const torsoShapes = [
        { name: "rectangle", shoulderMult: 1.0, waistMult: 1.0 },
        { name: "triangle", shoulderMult: 1.2, waistMult: 0.8 },
        { name: "hourglass", shoulderMult: 1.1, waistMult: 0.75 },
    ];
    const hairColors = [null, "#402010", "#1a1a1a", "#8b4513", "#d4a460"];
    const hairStyles = ["none", "short", "buzzcut", "mohawk"];
    const skin = { ...rng.pick(HUMAN_SKINS_BY_LIGHTNESS) };
    const eyes = rng.pick(eyeColors);
    const bodyType = rng.pick(bodyTypes);
    const torsoShape = rng.pick(torsoShapes);
    const topColor = rng.pick(FABRIC_PALETTES);
    const bottomColor = rng.pick(FABRIC_PALETTES);
    const hairColor = rng.pick(hairColors);
    const hairStyle = hairColor ? rng.pick(hairStyles.slice(1)) : "none";
    return {
        race: "human",
        raceData: race,
        skinColor: skin.base,
        skinLight: skin.light,
        skinDark: skin.dark,
        skinType: skin.type,
        eyeColor: eyes.base,
        eyeLight: eyes.light,
        eyeDark: eyes.dark,
        torsoW: bodyType.torsoW * rng.range(0.9, 1.1),
        armW: bodyType.armW * rng.range(0.9, 1.1),
        legW: bodyType.legW * rng.range(0.9, 1.1),
        weight: bodyType.weight * rng.range(0.95, 1.05),
        shoulderMult: torsoShape.shoulderMult * rng.range(0.95, 1.05),
        waistMult: torsoShape.waistMult * rng.range(0.95, 1.05),
        topColor: topColor.base,
        topLight: topColor.light,
        topDark: topColor.dark,
        bottomColor: bottomColor.base,
        bottomLight: bottomColor.light,
        bottomDark: bottomColor.dark,
        sleeveStyle: rng.next() < 0.5 ? "short" : "long",
        hairColor,
        hairStyle,
        shoeColor: rng.pick(["#201008", "#111", "#2a2a2a"]),
    };
}
/**
 * @param {{
 *   heroSkinSlot?: Record<string, number>,
 *   heroHair?: Record<string, object>,
 *   enemyTypeOutfit?: Record<string, { top: number, bottom: number }>,
 *   enemyTypeTints?: Record<string, object>,
 * }} [overrides]
 */
export function createCharacterResolver(overrides = {}) {
    const characterCache = new Map();
    const { heroSkinSlot = {}, heroHair = {}, enemyTypeOutfit = {}, enemyTypeTints = {} } = overrides;
    function applyEnemyTypeAppearance(char, enemyType) {
        const outfit = enemyTypeOutfit[enemyType.type] ?? { top: 0, bottom: 1 };
        const top = FABRIC_PALETTES[outfit.top % FABRIC_PALETTES.length];
        const bottom = FABRIC_PALETTES[outfit.bottom % FABRIC_PALETTES.length];
        let next = applyFabricPalette(char, top);
        next = { ...next, bottomColor: bottom.base, bottomLight: bottom.light, bottomDark: bottom.dark };
        const tint = enemyTypeTints[enemyType.type];
        if (tint) next = { ...next, ...tint };
        if (!next.hairColor) {
            next.hairColor = "#402010";
            next.hairStyle = next.hairStyle === "none" ? "short" : next.hairStyle;
        }
        return next;
    }
    function applyHeroSkin(char, actor) {
        const slot = heroSkinSlot[actor?.type];
        if (slot === undefined) return char;
        const skin = HUMAN_SKINS_BY_LIGHTNESS[slot];
        return { ...char, skinColor: skin.base, skinLight: skin.light, skinDark: skin.dark, skinType: skin.type };
    }
    function applyHeroHair(char, actor) {
        const hair = heroHair[actor?.type];
        if (!hair) return char;
        return { ...char, ...hair };
    }
    return function getCharacterForActor(actor, seedOverride = null) {
        if (!actor || actor.id === undefined) return generateCharacter(0);
        if (!characterCache.has(actor.id)) {
            const typeSalt = actor.enemyType ? hashEnemyType(actor.enemyType.type) : 0;
            const seed = seedOverride ?? actor.id ^ WORLD_SEED ^ typeSalt;
            let char = generateCharacter(seed);
            if (actor.enemyType) char = applyEnemyTypeAppearance(char, actor.enemyType);
            char = applyHeroSkin(char, actor);
            char = applyHeroHair(char, actor);
            characterCache.set(actor.id, char);
        }
        return characterCache.get(actor.id);
    };
}
