// --- mapData.js ---
// REALISTIC TACTICAL THEME + ORGANIC TERRAIN ENGINE

const T_GRASS = 0;
const T_WALL = 1;
const T_FLOOR = 2;
const T_TREE = 3;
const T_SPAWN_SKEL = 4;

const BiomeList = [];
const Biomes = {};

// --- 1. MATERIAL DATABASE (Refined for Realism) ---
const Materials = {
    // Man-Made
    CONCRETE:   { f: '#2a2a2a', w: '#555555', o: '#777777', a: 'rgba(200,200,200,0.1)' },
    MILITARY:   { f: '#252a30', w: '#4a5560', o: '#5da0a0', a: 'rgba(100,200,200,0.15)' }, 
    RUST:       { f: '#29201d', w: '#5c483a', o: '#a05b30', a: 'rgba(255,150,50,0.1)' },
    OFFICE:     { f: '#353538', w: '#8a8a80', o: '#999990', a: 'rgba(200,200,180,0.1)' }, 
    LAB:        { f: '#202025', w: '#708090', o: '#a0c0ff', a: 'rgba(150,220,255,0.4)' },
    
    // Natural (Fixed Colors)
    // DIRT: Desaturated brownish-grey (No more yellow/poop color)
    DIRT:       { f: '#2e2b28', w: '#423d38', o: '#5c544d', a: 'rgba(0,0,0,0)' },
    // MOSS: Dark forest floor, distinct from walls
    MOSS:       { f: '#1a2118', w: '#2f3b2b', o: '#4a5e40', a: 'rgba(100,150,80,0.2)' },
    // CAVES: Cold, dark stone
    WET_CAVE:   { f: '#151517', w: '#2a2a30', o: '#3e4a5e', a: 'rgba(100,120,150,0.3)' },
    MAGMA:      { f: '#1f1515', w: '#362020', o: '#5e3030', a: 'rgba(255,100,50,0.2)' }
};

// --- 2. DEFINITION HELPERS ---

const def = (key, matKey, styleType, obsName, extra = {}) => {
    const mat = Materials[matKey] || Materials.CONCRETE;
    const biome = {
        id: BiomeList.length,
        key: key,
        grass: { style: 'mgs_unified', color: mat.f },
        wall: { style: 'mgs_unified', color: mat.w, outline: mat.o },
        obstacle: obsName,
        obstacleColor: mat.o,
        procColor: mat.a,
        themeType: styleType, 
        tags: [],
        ...extra
    };
    if(extra.tags) biome.tags = extra.tags;
    Biomes[key] = biome;
    BiomeList.push(biome);
};

const caveVariant = (key, matKey) => {
    const mat = Materials[matKey];
    const biome = {
        id: BiomeList.length,
        key: key,
        grass: { style: 'mgs_unified', color: mat.f },
        wall: { style: 'mgs_unified', color: mat.w, outline: mat.o },
        obstacle: 'tactical_rock', 
        obstacleColor: mat.w,
        procColor: mat.a,
        themeType: 'NATURAL',
        tags: ['cave', 'cave_variant']
    };
    Biomes[key] = biome;
    BiomeList.push(biome);
};

// --- 3. BIOME CONFIGURATION ---

def('BARRACKS',         'MILITARY', 'MILITARY',   'crate_supply_mgs');
def('HIVE',             'MILITARY', 'MILITARY',   'crate_supply_mgs');
def('CARGO_DECK',       'RUST',     'INDUSTRIAL', 'crate_industrial_mgs');
def('SCAFFOLDING',      'RUST',     'INDUSTRIAL', 'crate_scaffold');
def('SERVER_FARM',      'LAB',      'HIGH_TECH',  'server_rack_mgs');
def('COLLIDER_COMPLEX', 'LAB',      'HIGH_TECH',  'clean_crate_mgs');
def('CRYO_WARD',        'LAB',      'HIGH_TECH',  'cryo_tank_mgs');
def('OFFICE_COMPLEX',   'OFFICE',   'MILITARY',   'office_cabinet_mgs');
def('RUINS',            'CONCRETE', 'ANCIENT',    'tactical_block');
def('STONE_COMPLEX',    'CONCRETE', 'ANCIENT',    'tech_pillar_mgs');

def('CAVE',             'DIRT',     'NATURAL',    'tactical_rock', { tags: ['cave'] });
def('TREE_MAZE',        'MOSS',     'NATURAL',    'tactical_bush');

caveVariant('CAVE_MOSS',    'MOSS');     
caveVariant('CAVE_WET',     'WET_CAVE'); 
caveVariant('CAVE_CRYSTAL', 'WET_CAVE'); 
caveVariant('CAVE_MAGMA',   'MAGMA');    

// --- 4. ORGANIC GENERATORS (New System) ---
// These generate full-tile textures using high-density noise instead of shapes.
const OrganicGenerators = {
    // Dirt / Rock Ground
    // Trick: Uses varying sizes of noise to create "Grit"
    DIRT: (c) => [
        // 1. Heavy Grain (The "Sand")
        
        // 2. Dark Patches (The "Mud") - Low opacity, overlapping edges
        { type: 'specks', count: 40, color: 'rgba(0,0,0,0.15)', shape: 'rect', minSize: 0.05, maxSize: 0.15, x:-0.2, y:-0.2, w:1.4, h:1.4 },
        
        // 3. Highlights (The "Pebbles")
        { type: 'specks', count: 20, color: 'rgba(255,255,255,0.05)', shape: 'rect', minSize: 0.02, maxSize: 0.04 }
    ],

    // Grass / Moss
    // Trick: Uses huge numbers of tiny vertical dashes to simulate "blades"
    MOSS: (c) => [
        // 1. Base Texture
        
        // 2. Undergrowth (Dark)
        { type: 'specks', count: 100, color: 'rgba(0,0,0,0.2)', shape: 'rect', minSize: 0.02, maxSize: 0.05 },
        
        // 3. Highlights (Tips of grass)
        { type: 'specks', count: 50, color: 'rgba(255,255,255,0.08)', shape: 'rect', minSize: 0.01, maxSize: 0.03 }
    ],

    // Cave Wall (Rough Stone)
    ROCK_WALL: (c) => [
        // 1. Deep Texture
        
        // 2. Cracks (Rough paths)
        { type: 'path', points:[{x:0,y:0},{x:1,y:1}], stroke:'rgba(0,0,0,0.3)', width:2, roughness:5 },
        { type: 'path', points:[{x:1,y:0},{x:0,y:1}], stroke:'rgba(0,0,0,0.3)', width:2, roughness:5 },
        
        // 3. Facets (Large overlays)
        { type: 'specks', count: 5, color: 'rgba(255,255,255,0.05)', shape: 'rect', minSize: 0.2, maxSize: 0.5 },
        { type: 'specks', count: 5, color: 'rgba(0,0,0,0.2)', shape: 'rect', minSize: 0.2, maxSize: 0.5 }
    ]
};

// --- 5. TECH GENERATORS (Standard) ---
const Generators = {
    MILITARY: (c) => [
        { type: 'rect', x: 0.02, y: 0.02, w: 0.96, h: 0.96, stroke: 'rgba(0,0,0,0.3)', width: 1, fill: false },
        { type: 'rivets', x: 0.05, y: 0.05, w: 0.9, h: 0.9, count: 4, size: 0.03, color: 'rgba(0,0,0,0.2)' },
        { type: 'rect', x: 0, y: 0, w: 1, h: 1, stroke: 'rgba(255,255,255,0.05)', width: 2, fill: false }
    ],
    INDUSTRIAL: (c) => [
        { type: 'grid', gap: 0.25, stroke: 'rgba(0,0,0,0.2)', width: 1 },
        { type: 'rect', x: 0.1, y: 0.1, w: 0.8, h: 0.8, stroke: 'rgba(0,0,0,0.4)', width: 1, fill: false }
    ],
    HIGH_TECH: (c) => [
        { type: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'rgba(255,255,255,0.02)' }, 
        { type: 'path', points:[{x:0.2,y:0},{x:0.2,y:1}], stroke: 'rgba(255,255,255,0.1)', width: 1 }
    ],
    ANCIENT: (c) => [
        { type: 'rect', x: 0, y: 0, w: 1, h: 1, stroke: 'rgba(0,0,0,0.2)', width: 1, fill: false },
        { type: 'specks', count: 5, color: 'rgba(0,0,0,0.2)', minSize: 0.05, maxSize: 0.1 }
    ]
};

const GenerateMGSUnified = (c, outline, x, y, regionId) => {
    const biome = BiomeList[regionId];
    const theme = biome.themeType || 'MILITARY'; 
    
    const isStructure = !!outline; 
    const isRoof = (outline === 'roof');
    const isSide = (isStructure && !isRoof); 

    // 1. Background
    let baseColor = c;
    if (isRoof && c.includes('#')) {
        // Simple hex darkening for roofs
        // We leave it as is for natural tiles to avoid hard borders
    }
    
    let layers = [];
    layers.push({ type: 'rect', x: 0, y: 0, w: 1, h: 1, color: baseColor });

    // 2. Select Engine (Organic vs Tech)
    if (theme === 'NATURAL') {
        // --- NATURAL LOGIC ---
        let organicGen;
        
        if (isStructure) {
            organicGen = OrganicGenerators.ROCK_WALL;
        } else if (biome.key.includes('MOSS') || biome.key.includes('TREE')) {
            organicGen = OrganicGenerators.MOSS;
        } else {
            organicGen = OrganicGenerators.DIRT;
        }
        
        layers.push(...organicGen(c));
        
        // No Bevels for nature! They look like tiles.
        // Instead, we might add a subtle shadow overlay for walls
        if (isSide) {
             layers.push({ type: 'gradient', dir: 'y', color: 'rgba(0,0,0,0)', color2: 'rgba(0,0,0,0.5)', x:0, y:0, w:1, h:1 });
        }

    } else {
        // --- MAN-MADE LOGIC ---
        
        // Wall Structure
        if (isSide) {
            layers.push({ type: 'rect', x: 0, y: 0.8, w: 1, h: 0.2, color: 'rgba(0,0,0,0.4)' }); // Baseboard
            layers.push({ type: 'rect', x: 0, y: 0, w: 1, h: 0.1, color: 'rgba(255,255,255,0.1)' }); // Header
            if (x % 2 === 0) layers.push({ type: 'line', x1: 1, y1: 0, x2: 1, y2: 1, stroke: 'rgba(0,0,0,0.3)', width: 1 });
        }

        // Texture
        const generator = Generators[theme] || Generators['MILITARY'];
        const accent = (biome.procColor) ? biome.procColor : 'rgba(255,255,255,0.1)';
        const pattern = generator(accent);
        
        pattern.forEach(step => {
            if (!isStructure && step.color && typeof step.color === 'string' && step.color.includes('rgba')) {
                 step.color = step.color.replace('0.6', '0.1').replace('0.4', '0.1').replace('0.2', '0.05');
            }
            layers.push(step);
        });

        // Polish
        if (isStructure) {
            if (isSide) {
                layers.push({ type: 'rect', x: 0, y: 0, w: 1, h: 1, stroke: outline, width: 2, fill: false });
            }
            layers.push({ type: 'bevel', width: 2 });
        }
    }

    // Hero Detail (Man-made only)
    if (theme !== 'NATURAL') {
        const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const randVal = seed - Math.floor(seed);
        if (randVal > 0.96) {
            if (theme === 'INDUSTRIAL') {
                layers.push({ type: 'stripes', stroke: '#AA0', stripeWidth: 0.1, gap: 0.2, clip: {x:0.1, y:0.1, w:0.8, h:0.8} });
            } else {
                layers.push({ type: 'rect', x: 0.3, y: 0.3, w: 0.4, h: 0.4, color: 'rgba(0,0,0,0.3)', stroke: 'rgba(255,255,255,0.2)', width: 1 });
            }
        }
    }

    return layers;
};

const TextureStyles = {
    'mgs_unified': { floor: GenerateMGSUnified, wall: GenerateMGSUnified },
    
    // Objects
    'tactical_rock': { base: (c) => [ 
        { type: 'specks', shape: 'circle', color: c, count: 1, minSize: 0.8, maxSize: 0.9, fill: true }, 
    ]},
    'tactical_bush': { base: (c) => [ 
        { type: 'rect', fill: true, color: c, x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    ]},
    'tactical_block': { base: (c) => [ 
        { type: 'rect', fill: true, color: c, x: 0, y: 0, w: 1, h: 1 }, 
        { type: 'rect', stroke: 'rgba(0,0,0,0.3)', width: 4, x: 0.1, y: 0.1, w: 0.8, h: 0.8, fill: false },
        { type: 'bevel', width: 2 }
    ]},
    'server_rack_mgs': { base: (c) => [ 
        { type: 'rect', fill: true, color: '#222', x: 0.2, y: 0.1, w: 0.6, h: 0.8 }, 
        { type: 'bevel', width: 2 }, 
        { type: 'rect', stroke: '#000', width: 1, x: 0.2, y: 0.1, w: 0.6, h: 0.8 }, 
        { type: 'line', stroke: '#0F0', width: 2, x1: 0.25, y: 0.2, x2: 0.75, y2: 0.2 },
        { type: 'line', stroke: '#0F0', width: 2, x1: 0.25, y: 0.3, x2: 0.75, y2: 0.3 },
        { type: 'line', stroke: '#0F0', width: 2, x1: 0.25, y: 0.4, x2: 0.75, y2: 0.4 },
        { type: 'line', stroke: '#0F0', width: 2, x1: 0.25, y: 0.5, x2: 0.75, y2: 0.5 },
    ]},
    'clean_crate_mgs': { base: (c) => [ 
        { type: 'rect', fill: true, color: '#EEE', x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 
        { type: 'rect', stroke: '#CCC', width: 2, x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
        { type: 'line', stroke: '#AAA', width: 2, x1: 0.1, y: 0.1, x2: 0.9, y2: 0.9 },
        { type: 'line', stroke: '#AAA', width: 2, x1: 0.9, y1: 0.1, x2: 0.1, y2: 0.9 },
        { type: 'bevel', width: 2 } 
    ]},
    'crate_supply_mgs': { base: (c) => [ 
        { type: 'rect', fill: true, color: '#3A4A5A', x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 
        { type: 'bevel', width: 2 }, 
        { type: 'rect', stroke: 'rgba(255,255,255,0.3)', width: 2, x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 
        { type: 'rect', fill: true, color: '#CD5C5C', x: 0.4, y: 0.4, w: 0.2, h: 0.2 } 
    ]},
    'cryo_tank_mgs': { base: (c) => [ 
        { type: 'rect', fill: true, color: '#DDD', x: 0.2, y: 0.1, w: 0.6, h: 0.8 }, 
        { type: 'rect', fill: true, color: '#A0E0FF', x: 0.3, y: 0.2, w: 0.4, h: 0.4 }, 
        { type: 'bevel', width: 2 } 
    ]},
    'crate_industrial_mgs': { base: (c) => [ 
        { type: 'rect', fill: true, color: '#8B4513', x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 
        { type: 'bevel', width: 2 }, 
        { type: 'linesH', stroke: 'rgba(0,0,0,0.3)', gap: 0.2, clip: {x:0.1, y:0.1, w:0.8, h:0.8} }
    ]},
    'office_cabinet_mgs': { base: (c) => [ 
        { type: 'rect', fill: true, color: '#888', x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 
        { type: 'line', stroke: '#666', width: 1, x1: 0.1, y1: 0.4, x2: 0.9, y2: 0.4 }, 
        { type: 'rect', fill: true, color: '#AAA', x: 0.45, y: 0.2, w: 0.1, h: 0.05 },
        { type: 'bevel', width: 2 } 
    ]},
    'crate_scaffold': { base: (c) => [ 
        { type: 'rect', fill: true, color: '#F0E68C', x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 
        { type: 'stripes', stroke: '#000', stripeWidth: 0.1, gap: 0.2, clip: {x:0.1, y:0.1, w:0.8, h:0.8} },
        { type: 'bevel', width: 2 } 
    ]},
    'tech_pillar_mgs': { base: (c) => [{type:'rect', fill:true, color:c, x:0.2, y:0.2, w:0.6, h:0.6}, {type:'bevel', width:2}] }
};

const ObstacleList = ['crate_supply_mgs', 'crate_industrial_mgs', 'clean_crate_mgs'];

const getBiomeById = (id) => {
    return BiomeList[id] || Biomes.CAVE;
};