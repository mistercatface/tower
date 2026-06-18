import block from "../block/block.asset.js";
import { extendPropAlias } from "../shared/propAlias.js";
export default extendPropAlias(block, {
    id: "box_2x4",
    sandbox: { tags: ["shapes"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "2×4 box" },
    defaultVisualOverride: { tint: "#78909C" },
});
