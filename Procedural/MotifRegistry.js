import { baseMetalMotif } from "./Motifs/baseMetal.js";
import { ridgeLinesMotif } from "./Motifs/ridgeLines.js";
import { stainBlotchMotif } from "./Motifs/stainBlotch.js";
import { panelGridMotif } from "./Motifs/panelGrid.js";
import { deckPlatesMotif } from "./Motifs/deckPlates.js";
import { hexGridMotif } from "./Motifs/hexGrid.js";
import { voronoiCellMotif } from "./Motifs/voronoiCell.js";
import { circuitLatticeMotif } from "./Motifs/circuitLattice.js";
import { surfaceGrainMotif } from "./Motifs/surfaceGrain.js";
import { wallLightingMotif } from "./Motifs/wallLighting.js";
import { wallCircuitSnakeMotif } from "./Motifs/wallCircuitSnake.js";
import { wallHorizontalBevelMotif } from "./Motifs/wallHorizontalBevel.js";
import { panelBayMotif } from "./Motifs/panelBay.js";
import { concentricRingsMotif } from "./Motifs/concentricRings.js";
import { circuitTracesMotif } from "./Motifs/circuitTraces.js";
import { celticWeaveMotif } from "./Motifs/celticWeave.js";
import { topoContoursMotif } from "./Motifs/topoContours.js";
import { starburstMotif } from "./Motifs/starburst.js";

const MOTIF_BY_TYPE = {
    baseMetal: baseMetalMotif,
    ridgeLines: ridgeLinesMotif,
    stainBlotch: stainBlotchMotif,
    panelGrid: panelGridMotif,
    deckPlates: deckPlatesMotif,
    hexGrid: hexGridMotif,
    voronoiCell: voronoiCellMotif,
    circuitLattice: circuitLatticeMotif,
    surfaceGrain: surfaceGrainMotif,
    wallLighting: wallLightingMotif,
    wallCircuitSnake: wallCircuitSnakeMotif,
    wallHorizontalBevel: wallHorizontalBevelMotif,
    panelBay: panelBayMotif,
    concentricRings: concentricRingsMotif,
    circuitTraces: circuitTracesMotif,
    celticWeave: celticWeaveMotif,
    topoContours: topoContoursMotif,
    starburst: starburstMotif,
};

export function getMotif(type) {
    const motif = MOTIF_BY_TYPE[type];
    if (!motif) {
        throw new Error(`Unknown procedural motif type: ${type}`);
    }
    return motif;
}


