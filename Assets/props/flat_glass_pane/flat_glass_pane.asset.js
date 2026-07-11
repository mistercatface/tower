import { boxLocalFootprint } from "../../../Libraries/Math/math.js";
export default {
    id: "flat_glass_pane",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], resizableBox: true, spawnLabel: "Flat glass pane", dragInteract: true, dragLaunch: { minPower: 20, maxPower: 260 } },
    physics: {
        localFootprint: boxLocalFootprint(12, 8),
        density: 0.45 / 256,
        wallPhysics: { restitution: 0.06, friction: 0.25 },
        pairRestitution: 0.06,
        fracture: { mode: "glass" },
    },
    visuals: { flat: true, colors: { fill: "#B3E5FC", stroke: "rgba(1, 87, 155, 0.45)" }, lineWidth: 0.4 },
};
