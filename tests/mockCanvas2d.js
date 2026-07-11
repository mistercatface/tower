export function createMockCanvas2d(width, height) {
    const ops = [];
    let gco = "source-over";
    let alpha = 1;
    return {
        ops,
        canvas: { width, height },
        save() {
            ops.push({ op: "save" });
        },
        restore() {
            ops.push({ op: "restore" });
        },
        beginPath() {
            ops.push({ op: "beginPath" });
        },
        moveTo(x, y) {
            ops.push({ op: "moveTo", x, y });
        },
        lineTo(x, y) {
            ops.push({ op: "lineTo", x, y });
        },
        closePath() {
            ops.push({ op: "closePath" });
        },
        fill() {
            ops.push({ op: "fill" });
        },
        fillRect(x, y, w, h) {
            ops.push({ op: "fillRect", x, y, w, h });
        },
        clearRect(x, y, w, h) {
            ops.push({ op: "clearRect", x, y, w, h });
        },
        setTransform() {
            ops.push({ op: "setTransform" });
        },
        arc(x, y, r, start, end) {
            ops.push({ op: "arc", x, y, r, start, end });
        },
        drawImage() {
            ops.push({ op: "drawImage" });
        },
        createPattern(image, repetition) {
            ops.push({ op: "createPattern", repetition });
            return {
                setTransform() {
                    ops.push({ op: "patternSetTransform" });
                },
            };
        },
        createRadialGradient() {
            return { addColorStop() {} };
        },
        set globalCompositeOperation(v) {
            gco = v;
            ops.push({ op: "gco", value: v });
        },
        get globalCompositeOperation() {
            return gco;
        },
        set globalAlpha(v) {
            alpha = v;
            ops.push({ op: "alpha", value: v });
        },
        get globalAlpha() {
            return alpha;
        },
        set fillStyle(v) {
            ops.push({ op: "fillStyle", value: v });
        },
        clip() {
            ops.push({ op: "clip" });
        },
        createImageData(w, h) {
            return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData() {
            ops.push({ op: "putImageData" });
        },
        rect(x, y, w, h) {
            ops.push({ op: "rect", x, y, w, h });
        },
        getTransform() {
            return { a: 1 };
        },
    };
}

export function createMockDrawCtx() {
    const gradient = { addColorStop() {} };
    return {
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        createLinearGradient: () => gradient,
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        fill() {},
        stroke() {},
    };
}
