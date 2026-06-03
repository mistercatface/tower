import { EASING_OPTIONS } from "../../../Math/Easing.js";
import { BLEND_OPTIONS } from "../../../Procedural/util/blend.js";
import { MOTIF_TYPES } from "../../../Procedural/MotifRegistry.js";

export { EASING_OPTIONS, BLEND_OPTIONS, MOTIF_TYPES };

export const LAYER_OPTIONS = [
    { id: "all", label: "All" },
    { id: "floor", label: "Floor only" },
    { id: "wall", label: "Wall only" },
    { id: "wallFace", label: "Wall face" },
    { id: "wallCell", label: "Wall cell top" },
];

export const WARP_FIELDS = [
    { path: "warp.frequency", label: "Warp frequency", min: 0, max: 0.02, step: 0.0005 },
    { path: "warp.amplitude", label: "Warp amplitude", min: 0, max: 20, step: 1 },
    { path: "warp.octaves", label: "Warp octaves", min: 1, max: 4, step: 1 },
    { path: "warp.sampleOffset.0", label: "Warp offset X", min: -10000, max: 10000, step: 10 },
    { path: "warp.sampleOffset.1", label: "Warp offset Y", min: -10000, max: 10000, step: 10 },
];

export const PALETTE_FIELDS = [
    { path: "palette.floorBase.0", label: "Floor R", min: 0, max: 64, step: 1 },
    { path: "palette.floorBase.1", label: "Floor G", min: 0, max: 64, step: 1 },
    { path: "palette.floorBase.2", label: "Floor B", min: 0, max: 64, step: 1 },
    { path: "palette.wallBase.0", label: "Wall R", min: 0, max: 64, step: 1 },
    { path: "palette.wallBase.1", label: "Wall G", min: 0, max: 64, step: 1 },
    { path: "palette.wallBase.2", label: "Wall B", min: 0, max: 64, step: 1 },
];

/** Context motifs shift coordinates for layers below; they are not painted or blended. */
export function isContextMotif(type) {
    return MOTIF_TYPES[type]?.isContext === true;
}

/** Numeric motif params that can drive profile.animation. */
export function getAnimatableMotifFields(motifConfig) {
    const schema = MOTIF_TYPES[motifConfig?.type];
    if (!schema) {
        return [];
    }
    return schema.fields.filter((field) => !field.options);
}
