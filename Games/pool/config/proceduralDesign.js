import { SURFACE_PROFILE_ID } from "../../../Config/procedural/profileIds.js";

/** Procedural ground/wall look for the pool table playfield. */
export const poolSurfaceProfileId = SURFACE_PROFILE_ID.poolTableFelt;

/**
 * Felt animates on the ground only — rail walls stay static (avoids thousands of wall flipbook bakes).
 * Capped flipbook length + larger batches keep first paint fast while the pulse still plays.
 */
export const poolProceduralDesign = {
    /*
    groundChunkAnimationsOn: false,
    wallAnimationsOn: false,
    animationBakeMaxFrames: 24,
    animationFrameBatchSize: 24,
    */
};
