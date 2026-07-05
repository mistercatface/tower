import fs from "fs";

const root = process.cwd();

function read(path) {
    return fs.readFileSync(`${root}/${path}`, "utf8");
}

function write(path, content) {
    fs.writeFileSync(`${root}/${path}`, content);
}

function extractBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    if (start === -1) throw new Error(`Missing start marker: ${startMarker}`);
    const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
    if (end === -1) throw new Error(`Missing end marker: ${endMarker}`);
    return {
        before: source.slice(0, start),
        chunk: source.slice(start, end),
        after: source.slice(end),
    };
}

// 1) Move props behaviors block (2498+) to sandbox — keep floor button tick in props
let props = read("Libraries/Props/props.js");
const propsBehaviorStart = "// --- MERGED FROM cueStrikeBehavior.js ---";
const propsBehaviorEnd = props.length;
const propsParts = {
    before: props.slice(0, props.indexOf(propsBehaviorStart)),
    chunk: props.slice(props.indexOf(propsBehaviorStart)),
    after: "",
};
write("Libraries/Props/props.js", propsParts.before.trimEnd() + "\n");

let sandbox = read("Libraries/Sandbox/sandbox.js");
sandbox =
    sandbox.trimEnd() +
    "\n// --- MERGED FROM props sandbox behaviors ---\n" +
    propsParts.chunk.trim() +
    "\n";
write("Libraries/Sandbox/sandbox.js", sandbox);

// 2) Move ground nav from navigation (2489-2969)
let nav = read("Libraries/Navigation/navigation.js");
const navGroundStart = "// --- MERGED FROM directGroundNavBehavior.js ---";
const navGroundEnd = "// --- MERGED FROM NavRuntime.js ---";
const navParts = extractBetween(nav, navGroundStart, navGroundEnd);
write("Libraries/Navigation/navigation.js", navParts.before.trimEnd() + "\n" + navParts.after.trimStart());

sandbox = read("Libraries/Sandbox/sandbox.js");
sandbox =
    sandbox.trimEnd() +
    "\n// --- MERGED FROM navigation ground nav ---\n" +
    navParts.chunk.trim() +
    "\n";
write("Libraries/Sandbox/sandbox.js", sandbox);

// 3) Move render sandbox tail (camera + overlay + grid stamp) — stop before losShadow if present
let render = read("Libraries/Render/render.js");
const renderTailStart = "// --- MERGED FROM sandboxCameraTarget.js ---";
let renderTailEnd = "// --- MERGED FROM losShadow.js ---";
if (render.indexOf(renderTailEnd) === -1) renderTailEnd = render.length;
else {
    const losStart = render.indexOf(renderTailEnd);
    render = render.slice(0, losStart).trimEnd() + "\n" + render.slice(losStart);
}
const renderParts = extractBetween(render, renderTailStart, renderTailEnd === render.length ? null : renderTailEnd);
write("Libraries/Render/render.js", renderParts.before.trimEnd() + "\n" + (renderParts.after || "").trimStart());

sandbox = read("Libraries/Sandbox/sandbox.js");
sandbox =
    sandbox.trimEnd() +
    "\n// --- MERGED FROM render sandbox tail ---\n" +
    renderParts.chunk.trim() +
    "\n";
write("Libraries/Sandbox/sandbox.js", sandbox);

console.log("Phase2 rehome chunks moved.");
console.log("props.js lines:", read("Libraries/Props/props.js").split("\n").length);
console.log("sandbox.js lines:", read("Libraries/Sandbox/sandbox.js").split("\n").length);
console.log("navigation.js lines:", read("Libraries/Navigation/navigation.js").split("\n").length);
console.log("render.js lines:", read("Libraries/Render/render.js").split("\n").length);
