const CALLSIGNS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL"];
const IDLE_MESSAGES = ["Standing by for new coords.", "Sector search complete. Awaiting orders.", "Holding position. Requesting update.", "Grid empty. What is the plan?", "Ready for next assignment."];
const PATROL_MESSAGES = ["Resuming standard beat.", "Checking perimeter sectors.", "Cycling patrol route.", "Moving to check adjacent sector.", "Sweeping low-priority zones." ];

const WEAPONS = {
   PISTOL: {
      name: "Pistol",
      magSize: 12,
      fireDelay: 0.5,
      reloadTime: 0.9,
      accuracy: 0.05,
      recoilAdd: 0.35,
      projectileSpeed: 15,
      projectileColor: '255, 255, 0',
      damage: 1,
      optimalRange: 6,
      soundRadius: 3,
   },
   ASSAULT_RIFLE: {
      name: "Assault Rifle",
      magSize: 30,
      fireDelay: 0.1,
      reloadTime: 1.0,
      accuracy: 0.10,
      recoilAdd: 0.2,
      projectileSpeed: 25,
      projectileColor: '0, 255, 255',
      damage: 1,
      optimalRange: 7,
      soundRadius: 30,
   },
   SHOTGUN: {
      name: "Shotgun",
      magSize: 2,
      fireDelay: 0.25,
      reloadTime: 1.2,
      accuracy: 0.075,
      recoilAdd: 0.6,
      projectileSpeed: 13,
      projectileColor: '255, 100, 100',
      damage: 1,
      isShotgun: true,
      optimalRange: 5,
      soundRadius: 35,
   },
   SNIPER: {
      name: "Sniper",
      magSize: 5,
      fireDelay: 1.0,
      reloadTime: 1.75,
      accuracy: 0.01,
      recoilAdd: 0.6,
      projectileSpeed: 35,
      projectileColor: '0, 255, 0',
      damage: 5,
      optimalRange: 9,
      soundRadius: 50
   }
};

const weaponSwitchMap = {
   '1': 'PISTOL',
   '2': 'ASSAULT_RIFLE',
   '3': 'SHOTGUN',
   '4': 'SNIPER'
};

const VISION_PROFILES = {
    'CASUAL': { fov: 0.95, range: 10, color: '#fffb00ff' },
    'SEARCH': { fov: 0.95, range: 10, color: '#fffb00ff' },
    'COMBAT': { fov: 1.25, range: 16, color: '#ff0000ff' },
};

const SPEEDS = { 
   SNEAK: 2, 
   WALK: 3, 
   RUN: 4, 
};

const DRAW_LAYERS = [
   ['grass'],
   ['wall', 'tree'],
];

const NUM_SKELETONS = 0;
const NUM_CULTISTS = 500;
const TILE_SIZE = 64;
const gridSize = 300;
const GRID_WIDTH = gridSize;
const GRID_HEIGHT = gridSize;
const GRID_SIZE = GRID_WIDTH * GRID_HEIGHT;

let ENTITY_MAX_RECOIL = 0.05;

let TIME_SCALE = 1.0;
let TARGET_TIME_SCALE = 1.0;
let CHARACTER_VIEW_DISTANCE = 32;

let STARTING_STAMINA = 50;
let STARTING_STAMINA_REGEN_RATE = 15.0;
let STARTING_AWARENESS_LEVEL = 0.95;
let STARTING_RECOIL = 0.1;
let STARTING_VAULT_STAMINA_COST = 20;
let STARTING_WALK_SPEED = 4.0;
let STARTING_RUN_SPEED = 1.5;
let STARTING_RELOAD_SPEED = 1.0;