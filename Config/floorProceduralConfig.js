import { combatVisualSettings } from "./Config.js";

/** @typedef {"eval" | "warped"} ProceduralCoordinateSpace */

/**
 * Procedural floor/wall texture profiles. Add motifs here to change the look;
 * implement new motif types under Procedural/Motifs/.
 */
export const floorProceduralProfiles = {
    cleanserStation: {
        warp: {
            frequency: 0.005,
            amplitude: 10,
            octaves: 2,
            sampleOffset: [500, 500],
        },
        palette: {
            base: [24, 26, 30],
            shadow: combatVisualSettings.floorShadow,
        },
        motifs: [
            {
                type: "baseMetal",
                structure: { frequency: 0.005, octaves: 2, rgbDelta: [6, 6, 8] },
                grain: { frequency: 0.8, octaves: 1, amplitude: 3 },
            },
            {
                type: "ridgeLines",
                coordinateSpace: "warped",
                frequency: 0.03,
                threshold: 0.05,
                peak: 16,
                offset: [0, 0],
                tint: [0.5, 1.5, 2.0],
                octaves: 2,
                ridged: true,
            },
            {
                type: "ridgeLines",
                coordinateSpace: "warped",
                frequency: 0.05,
                threshold: 0.04,
                peak: 20,
                offset: [500, 500],
                tint: [1.5, 1.0, 0.5],
                octaves: 2,
                ridged: true,
            },
        ],
    },
};

export const defaultFloorProceduralProfileId = "cleanserStation";

export function getFloorProceduralProfile(profileId = defaultFloorProceduralProfileId) {
    const profile = floorProceduralProfiles[profileId];
    if (!profile) {
        throw new Error(`Unknown floor procedural profile: ${profileId}`);
    }
    return profile;
}
