import { spherePanelsCacheKey } from "../../../Libraries/Props/propSpherePanels.js";

export default {
    id: "snake_head",
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
    visuals: { panelCount: 6, latBands: 5, panels: ["#B0BEC5", "#90A4AE", "#CFD8DC", "#78909C", "#ECEFF1", "#607D8B"], stroke: null },
};
