export const JACKO_LABEL_SRC = "Images/jacko_fuel_barrel.png";

/** Jacko Fuel soda can — dimensions, label band, colors. Data only; no Render imports. */
export const JACKO_CAN = {
    labelSrc: JACKO_LABEL_SRC,
    halfHeight: 1.05,
    bodyRadius: 0.5,
    label: {
        y0: 0.21,
        y1: 0.79,
        angleCenter: -Math.PI / 2,
        angleSpan: Math.PI * 1.15,
        radialSegments: 10,
        verticalSegments: 18,
    },
    combat: {
        height: 22,
        /** Frustum-normalized band; combat isometric projection uses a different scale than inspect y0/y1. */
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
        tab: "#D8DCE2",
    },
};
