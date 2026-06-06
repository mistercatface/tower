export const CRATE_LABEL_VARIANTS = ["Images/crate_label_1.png", "Images/crate_label_2.png", "Images/crate_label_3.png"];

export const CRATE_LABEL_FACES = ["+x", "-x", "+z", "-z"];

/** Wooden shipping crate — dimensions, side labels, colors. */
export const WOOD_CRATE = {
    labelVariants: CRATE_LABEL_VARIANTS,
    halfExtents: { x: 0.55, y: 0.5, z: 0.55 },
    label: {
        faces: CRATE_LABEL_FACES,
        y0: 0.18,
        y1: 0.82,
        u0: 0,
        v0: 0,
        u1: 1,
        v1: 1,
    },
    colors: {
        side: "#8D6E63",
        sideShadow: "#6D4C41",
        top: "#A1887F",
        bottom: "#5D4037",
        bodyInspect: "#8D6E63",
        stroke: "#3E2723",
    },
    world: { height: 10 },
};
