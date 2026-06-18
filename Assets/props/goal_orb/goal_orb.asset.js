export default {
    id: "goal_orb",
    primitive: "sphere",
    sandbox: { spawnLabel: "Goal orb", tags: ["goal"], groundNav: false },
    physics: { radius: 5, isKinetic: false, spatialRole: "trigger", propPixelSize: 10 },
    visuals: { panelCount: 8, latBands: 4, panels: ["#FFEB3B", "#FDD835", "#FFF176", "#FBC02D", "#FFD54F", "#FFEE58", "#FFF59D", "#FFC107"], stroke: "#F57F17" },
};
