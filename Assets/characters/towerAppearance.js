/** Tower hero / enemy appearance overrides applied by the default character resolver. */

export const towerAppearanceOverrides = {
    heroSkinSlot: {
        companion: 0,
        player: 1,
    },
    heroHair: {
        companion: {
            hairStyle: "barry",
            hairColor: "#5c5048",
            hairLight: "#7a6e62",
            hairDark: "#3a322c",
        },
        player: {
            hairStyle: "brock",
            hairColor: "#241810",
            hairLight: "#3d2a20",
            hairDark: "#120a08",
        },
    },
    enemyTypeOutfit: {
        standard: { top: 0, bottom: 1 },
        tank: { top: 1, bottom: 0 },
        fast: { top: 2, bottom: 3 },
        kamikaze: { top: 3, bottom: 2 },
        spastic: { top: 0, bottom: 3 },
        dodger: { top: 2, bottom: 1 },
        boss: { top: 1, bottom: 2 },
        zombie: { top: 0, bottom: 0 },
    },
    enemyTypeTints: {
        zombie: {
            skinColor: "#4CAF50",
            skinLight: "#81C784",
            skinDark: "#388E3C",
        },
    },
};
