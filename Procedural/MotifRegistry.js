import { baseMetalMotif } from "./Motifs/baseMetal.js";
import { ridgeLinesMotif } from "./Motifs/ridgeLines.js";
import { stainBlotchMotif } from "./Motifs/stainBlotch.js";
import { panelGridMotif } from "./Motifs/panelGrid.js";
import { voronoiCellMotif } from "./Motifs/voronoiCell.js";
import { circuitLatticeMotif } from "./Motifs/circuitLattice.js";

const MOTIF_BY_TYPE = {
    baseMetal: baseMetalMotif,
    ridgeLines: ridgeLinesMotif,
    stainBlotch: stainBlotchMotif,
    panelGrid: panelGridMotif,
    voronoiCell: voronoiCellMotif,
    circuitLattice: circuitLatticeMotif,
};

export function getMotif(type) {
    const motif = MOTIF_BY_TYPE[type];
    if (!motif) {
        throw new Error(`Unknown procedural motif type: ${type}`);
    }
    return motif;
}
