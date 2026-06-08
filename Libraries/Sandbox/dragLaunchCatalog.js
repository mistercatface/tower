import { getPropAsset, getWorldPropDefinitions } from "../Props/PropCatalog.js";
import { isDragLaunchProp } from "./dragLaunch.js";
/** @returns {string[]} */
export function listDragLaunchPropIds() {
    const ids = [];
    const defs = getWorldPropDefinitions();
    for (const id of Object.keys(defs)) if (isDragLaunchProp(getPropAsset(id))) ids.push(id);
    return ids.sort();
}
/** @returns {string} */
export function getDefaultDragLaunchPropId() {
    const ids = listDragLaunchPropIds();
    if (ids.includes("beach_ball")) return "beach_ball";
    return ids[0] ?? "beach_ball";
}
