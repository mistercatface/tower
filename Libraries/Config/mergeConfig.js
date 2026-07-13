export function replaceRecordContents(target, source) {
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, source);
}
