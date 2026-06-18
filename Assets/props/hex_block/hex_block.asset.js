import { regularConvexPolygonFootprint } from "../../../Libraries/Math/Poly2D.js";
export default {
    id: "hex_block",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Hex block" },
    physics: { isKinetic: true, localFootprint: regularConvexPolygonFootprint(6, 8), wallPhysics: { restitution: 0.18, friction: 0.75 } },
    visuals: { colors: { side: "#26A69A", sideShadow: "#00897B", top: "#4DB6AC", bottom: "#00695C", bodyInspect: "#26A69A", stroke: "#004D40" }, world: { height: 11 } },
};
