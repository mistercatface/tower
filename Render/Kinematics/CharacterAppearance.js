const RACES = {
    human: {
        name: "human",
        headScale: 0.6,
        bodyScale: 1.0,
        legScale: 1.0,
        armScale: 1.0,
        heightMult: 1.0,
        widthMult: 1.0,
    },
};

export const DEFAULT_CHARACTER = {
    skinColor: "#e8c090",
    skinLight: "#fff0d0",
    skinDark: "#a07050",
    eyeColor: "#4080a0",
    eyeLight: "#60a0c0",
    eyeDark: "#204060",
    hairColor: null,
    hairStyle: "none",
    pantsColor: "#111",
    pantsDark: "#000",
    shoeColor: "#201008",
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

export function generateCharacter(seed) {
    const rng = createSeededRandom(seed);
    const race = RACES.human;
    const humanSkins = [
        { base: "#e8c090", light: "#fff0d0", dark: "#a07050" },
        { base: "#c68642", light: "#daa06d", dark: "#8b5a2b" },
        { base: "#8d5524", light: "#b07040", dark: "#5c3a1a" },
        { base: "#ffdbac", light: "#fff0e0", dark: "#d4a574" },
        { base: "#f1c27d", light: "#ffd9a0", dark: "#c99550" },
    ];
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
    const fabricColors = [
        { base: "#7e8c96", light: "#9daab4", dark: "#5f6d77" },
        { base: "#6b7c9e", light: "#8b9cbe", dark: "#4c5d7e" },
        { base: "#7da37d", light: "#9cc49c", dark: "#5f845f" },
        { base: "#6b969e", light: "#8bb6be", dark: "#4c777e" },
    ];
    const hairColors = [null, "#402010", "#1a1a1a", "#8b4513", "#d4a460"];
    const hairStyles = ["none", "short", "buzzcut", "mohawk"];

    const skin = { ...rng.pick(humanSkins), type: "human" };
    const eyes = rng.pick(eyeColors);
    const bodyType = rng.pick(bodyTypes);
    const torsoShape = rng.pick(torsoShapes);
    const topColor = rng.pick(fabricColors);
    const bottomColor = rng.pick(fabricColors);
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

export function getCharacterForActor(actor, seedOverride = null) {
    if (!actor || actor.id === undefined) return generateCharacter(0);
    if (!characterCache.has(actor.id)) {
        const seed = seedOverride ?? (actor.id ^ WORLD_SEED);
        characterCache.set(actor.id, generateCharacter(seed));
    }
    return characterCache.get(actor.id);
}

export function clearCharacterAppearanceCache() {
    characterCache.clear();
}
