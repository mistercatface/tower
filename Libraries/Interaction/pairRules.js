/**
 * Declarative pair interaction rules (exclusions + inclusions).
 * Exclusion match → pair rejected. Inclusion rules (if any) must all match.
 */

/**
 * @typedef {object} FieldClause
 * @property {string} [prop]
 * @property {string} [resolve]
 * @property {boolean} [isUndefined]
 * @property {*} [equals]
 *
 * @typedef {object} PairRule
 * @property {'self' | 'other' | 'either' | 'pair'} target
 * @property {string} [prop]
 * @property {boolean} [isUndefined]
 * @property {*} [equals]
 * @property {string} [has] — dotted path must be truthy
 * @property {string} [hasFn] — dotted path must be a function
 * @property {string} [bothSet]
 * @property {boolean} [equal]
 * @property {string} [bothResolve] — both resolved values equal
 * @property {[string, string]} [crossFaction] — inclusion: one entity each faction (either order)
 * @property {boolean} [selfIdLessThanOther] — pair: self.id < other.id (dedup ordering)
 * @property {boolean} [sameEntity] — pair: self === other
 * @property {string} [pairResolve] — pair: pairResolvers[key](self, other)
 * @property {FieldClause} [self]
 * @property {FieldClause} [other]
 *
 * @typedef {object} PairFilterConfig
 * @property {PairRule[]} [exclusions]
 * @property {PairRule[]} [inclusions]
 * @property {PairRule[]} [inclusionsAny] — at least one must match (when non-empty)
 * @property {Record<string, (entity: object) => *>} [resolvers]
 * @property {Record<string, (self: object, other: object) => boolean>} [pairResolvers]
 */

function getPath(obj, path) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length; i++) {
        if (cur == null) return undefined;
        cur = cur[parts[i]];
    }
    return cur;
}

/**
 * @param {object} entity
 * @param {FieldClause} clause
 * @param {Record<string, (entity: object) => *>} resolvers
 */
function matchFieldClause(entity, clause, resolvers) {
    let value;
    if (clause.prop !== undefined) {
        value = entity[clause.prop];
    } else if (clause.resolve !== undefined) {
        const fn = resolvers[clause.resolve];
        if (!fn) return false;
        value = fn(entity);
    } else {
        return false;
    }

    if (clause.isUndefined) return value === undefined;
    if (clause.equals !== undefined) return value === clause.equals;
    return false;
}

/**
 * @param {object} entity
 * @param {PairRule} rule
 */
function matchEntityRule(entity, rule, resolvers) {
    if (rule.has !== undefined) {
        return Boolean(getPath(entity, rule.has));
    }
    if (rule.hasFn !== undefined) {
        return typeof getPath(entity, rule.hasFn) === "function";
    }

    let value;
    if (rule.prop !== undefined) {
        value = entity[rule.prop];
    } else if (rule.resolve !== undefined) {
        const fn = resolvers[rule.resolve];
        if (!fn) return false;
        value = fn(entity);
    } else {
        return false;
    }

    if (rule.isUndefined) return value === undefined;
    if (rule.equals !== undefined) return value === rule.equals;
    return false;
}

/**
 * @param {PairRule} rule
 * @param {object} self
 * @param {object} other
 * @param {Record<string, (entity: object) => *>} resolvers
 * @param {Record<string, (self: object, other: object) => boolean>} [pairResolvers]
 */
export function pairRuleMatches(rule, self, other, resolvers, pairResolvers = {}) {
    if (rule.target === "self") {
        return matchEntityRule(self, rule, resolvers);
    }
    if (rule.target === "other") {
        return matchEntityRule(other, rule, resolvers);
    }
    if (rule.target === "either") {
        return matchEntityRule(self, rule, resolvers) || matchEntityRule(other, rule, resolvers);
    }

    if (rule.target === "pair") {
        if (rule.bothSet !== undefined) {
            const a = self[rule.bothSet];
            const b = other[rule.bothSet];
            if (a == null || b == null) return false;
            return rule.equal ? a === b : a !== b;
        }

        if (rule.bothResolve !== undefined) {
            const fn = resolvers[rule.bothResolve];
            if (!fn) return false;
            const a = fn(self);
            const b = fn(other);
            if (a == null || b == null) return false;
            return rule.equal ? a === b : a !== b;
        }

        if (rule.crossFaction) {
            const [fa, fb] = rule.crossFaction;
            const a = self.faction ?? resolvers.faction?.(self);
            const b = other.faction ?? resolvers.faction?.(other);
            return (a === fa && b === fb) || (a === fb && b === fa);
        }

        if (rule.selfIdLessThanOther) {
            return self.id < other.id;
        }

        if (rule.sameEntity) {
            return self === other;
        }

        if (rule.pairResolve !== undefined) {
            const fn = pairResolvers[rule.pairResolve];
            return fn ? fn(self, other) : false;
        }

        if (rule.self && rule.other) {
            return matchFieldClause(self, rule.self, resolvers) && matchFieldClause(other, rule.other, resolvers);
        }
    }

    return false;
}

/**
 * @param {PairFilterConfig} config
 * @param {object} self
 * @param {object} other
 */
export function pairFilterAllows(config, self, other) {
    const exclusions = config.exclusions ?? [];
    const inclusions = config.inclusions ?? [];
    const inclusionsAny = config.inclusionsAny ?? [];
    const resolvers = config.resolvers ?? {};
    const pairResolvers = config.pairResolvers ?? {};

    for (const rule of exclusions) {
        if (pairRuleMatches(rule, self, other, resolvers, pairResolvers)) {
            return false;
        }
    }

    for (const rule of inclusions) {
        if (!pairRuleMatches(rule, self, other, resolvers, pairResolvers)) {
            return false;
        }
    }

    if (inclusionsAny.length > 0) {
        let any = false;
        for (const rule of inclusionsAny) {
            if (pairRuleMatches(rule, self, other, resolvers, pairResolvers)) {
                any = true;
                break;
            }
        }
        if (!any) return false;
    }

    return true;
}

/**
 * Layer pair-filter configs (resolvers merge; rule arrays concatenate).
 *
 * @param {PairFilterConfig[]} configs
 * @returns {PairFilterConfig}
 */
export function mergePairFilter(...configs) {
    /** @type {PairFilterConfig} */
    const merged = {};

    for (const config of configs) {
        if (!config) continue;

        if (config.resolvers) {
            merged.resolvers = { ...merged.resolvers, ...config.resolvers };
        }
        if (config.pairResolvers) {
            merged.pairResolvers = { ...merged.pairResolvers, ...config.pairResolvers };
        }
        for (const key of /** @type {const} */ (["exclusions", "inclusions", "inclusionsAny"])) {
            const rules = config[key];
            if (rules?.length) {
                merged[key] = [...(merged[key] ?? []), ...rules];
            }
        }
    }

    return merged;
}

export {};
