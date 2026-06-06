import { registerEntityCatalog } from "../../../Entities/EntityRegistry.js";

/** @type {import("../../../Entities/EntityRegistryTypes.js").EntityCatalog} */
export const yardballEntityCatalog = {
    enemies: {},
    allies: {},
    runParty: [],
    events: {},
};

export function registerYardballEntities() {
    registerEntityCatalog(yardballEntityCatalog);
}
