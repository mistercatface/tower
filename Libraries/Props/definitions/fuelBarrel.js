export const FUEL_BARREL_LABEL_SRC = "Images/fuel_barrel_label.png";

/** Cylindrical fuel barrel — dimensions, label band, colors. */
export const FUEL_BARREL = {
    labelSrc: FUEL_BARREL_LABEL_SRC,
    halfHeight: 1.05,
    bodyRadius: 0.5,
    label: {
        y0: 0.21,
        y1: 0.79,
        angleCenter: -Math.PI / 2,
        angleSpan: 1.36,
        radialSegments: 10,
        verticalSegments: 18,
    },
    world: {
        height: 22,
        bandT0: 0.28,
        bandT1: 0.72,
        arcHalf: 0.92,
    },
    colors: {
        body: { shadow: "#7A8088", mid: "#B4BAC2", highlight: "#E2E6EC" },
        bodyFire: { shadow: "#4A2018", mid: "#8A3020", highlight: "#C04828" },
        bodyInspect: "#B4BAC2",
        lip: "#9AA0A8",
        top: "#C8CDD4",
        stroke: "#505860",
        tab: "#8A9098",
    },
};