import { baseMetalMotif } from "./Motifs/baseMetal.js";
import { ridgeLinesMotif } from "./Motifs/ridgeLines.js";

const MOTIF_BY_TYPE = {
    baseMetal: baseMetalMotif,
    ridgeLines: ridgeLinesMotif,
};

export function getMotif(type) {
    const motif = MOTIF_BY_TYPE[type];
    if (!motif) {
        throw new Error(`Unknown procedural motif type: ${type}`);
    }
    return motif;
}
