import { spherePanelsCacheKey } from "../../../Libraries/Props/propSpherePanels.js";

export default {
    id: "blue_ball",
    primitive: "sphere",
    sandbox: { tags: ["shapes", "nav"], dragLaunch: { minPower: 25, maxPower: 500 } },
    physics: {
        radius: 4,
        isKinetic: true,
        rolls: true,
        density: 0.007958,
        friction: 4,
        wallPhysics: { restitution: 0.35, friction: 0.4 },
        getCustomSpriteCacheKey: spherePanelsCacheKey,
    },
    visuals: { panelCount: 6, latBands: 5, panels: ["#42A5F5", "#1E88E5", "#90CAF9", "#1565C0", "#64B5F6", "#0D47A1"], stroke: null },
};
