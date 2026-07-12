import { SURFACE_MASK_ALL, BLEND_MODE_REPLACE, BLEND_MODE_ADD } from "../../../Core/engineEnums.js";;
export const myProfile = {
    warp: { frequency: 0.004, amplitude: 5, octaves: 2, sampleOffset: [200, 200] },
    palette: { base: [14, 10, 8], floorBase: [0, 0, 0], wallBase: [4, 0, 0] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.003, octaves: 4, rgbDelta: [-4, 4, -1] }, grain: { frequency: 0.35, octaves: 2, amplitude: 1.5 }, surfaceMask: SURFACE_MASK_ALL, blendMode: BLEND_MODE_REPLACE },
        { type: "filterLevels", blackPoint: 0, whitePoint: 18, gamma: 0.5, surfaceMask: SURFACE_MASK_ALL, blendMode: BLEND_MODE_ADD },
        { type: "filterHSV", hueShift: 118, saturation: 0.6, value: 5, surfaceMask: SURFACE_MASK_ALL, blendMode: BLEND_MODE_ADD },
    ]};
export default myProfile;
