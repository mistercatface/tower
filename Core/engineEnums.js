export const CONSTRAINT_TYPE_DISTANCE = 0;
export const CONSTRAINT_TYPE_ANGLE = 1;
// Constraint
//
// Shape (physics) — not the same as PROP_PRIMITIVE_* catalog ids
export const SHAPE_TYPE_CIRCLE = 1;
export const SHAPE_TYPE_POLYGON = 2;
//
// Prop (catalog / draw) — PROP_PRIMITIVE_* ≠ SHAPE_TYPE_*
export const PROP_PRIMITIVE_SPHERE = 1;
export const PROP_PRIMITIVE_POLYGON = 2;
export const PROP_PRIMITIVE_COUNT = 3;
export const PRIMITIVE_PHYSICS_ROW_CIRCLE = 0;
export const PRIMITIVE_PHYSICS_ROW_POLYGON = 1;
//
export const PROP_DRAW_WALL_CHUNK = 1;
//
export const PROP_RENDER_MODE_NONE = 0;
export const PROP_RENDER_MODE_3D = 1;
//
export const ATTACH_HEADING_FACING = 0;
export const ATTACH_HEADING_VELOCITY = 1;
//
export const ATTACH_OFFSET_PARENT_RADIUS = 1;
//
export const WORLD_RENDER_MODE_FLAT2D = 0;
export const WORLD_RENDER_MODE_RADIAL_SPHERES = 1;
export const WORLD_RENDER_MODE_RADIAL = 2;
export const WORLD_RENDER_MODE_COUNT = 3;
//
export const GRID_NAV_EPOCH_WALL = 0;
export const GRID_NAV_EPOCH_FLOOR = 1;
export const GRID_NAV_EPOCH_TOPOLOGY = 2;
export const GRID_NAV_EPOCH_COUNT = 3;
//
// Wall
export const WALL_SEG_VOXEL = 1;
export const WALL_SEG_EDGE_RAIL = 2;
export const WALL_SEG_STATIC_FACE = 4;
export const WALL_STAMP_VOXEL = 0;
export const WALL_STAMP_RAIL = 1;
export const WALL_FACE_ATLAS_MISS = -1;
export const WALL_FACE_SUBDIV_NONE = -3;
//
// Surface motif mask (profile motif.surfaceMask)
export const SURFACE_MASK_ALL = 0;
export const SURFACE_MASK_FLOOR = 1;
export const SURFACE_MASK_WALL = 2;
export const SURFACE_MASK_WALL_FACE = 3;
export const SURFACE_MASK_WALL_CELL = 4;
export const SURFACE_MASK_COUNT = 5;
//
// Surface motif blend (profile motif.blendMode)
export const BLEND_MODE_REPLACE = 0;
export const BLEND_MODE_ADD = 1;
export const BLEND_MODE_MULTIPLY = 2;
export const BLEND_MODE_SCREEN = 3;
export const BLEND_MODE_OVERLAY = 4;
export const BLEND_MODE_HARD_LIGHT = 5;
export const BLEND_MODE_SOFT_LIGHT = 6;
export const BLEND_MODE_COLOR_DODGE = 7;
export const BLEND_MODE_COLOR_BURN = 8;
export const BLEND_MODE_DIFFERENCE = 9;
export const BLEND_MODE_COUNT = 10;
//
// Surface sample coordinate space
export const COORD_SPACE_EVAL = 0;
export const COORD_SPACE_WARPED = 1;
//
// Motif translate coordinate mode
export const TRANSLATE_MODE_EVAL_AND_WARPED = 0;
export const TRANSLATE_MODE_EVAL_ONLY = 1;
//
export const SPRITE_CACHE_FLAG_LIVE = 1;
export const SPRITE_CACHE_FLAG_BITMAP = 2;
//
// Draw
export const DRAW_KIND_PROP = 0;
export const DRAW_KIND_VOXEL = 1;
export const DRAW_KIND_RAIL = 2;
//
// Kinetic
export const KINETIC_PAIR_CIRCLE_CIRCLE = 0;
export const KINETIC_PAIR_CIRCLE_POLY = 1;
export const KINETIC_PAIR_POLY_POLY = 2;
export const KINETIC_PAIR_COMPOUND = 3;
//
export const ROLL_DRIVE_NONE = -1;
export const ROLL_DRIVE_THRUST = 0;
export const ROLL_DRIVE_BRAKE = 1;
//
// Nav / overlay debug — four parallel ladders (do not conflate):
// PATH_OVERLAY_MODE_* = path overlay draw; EDITOR_NAV_MODE_* = editor toolbar;
// SANDBOX_PATH_VISUAL_* = sandbox path viz; NAV_PATH_DEBUG_* = HPA debug filter.
export const PATH_OVERLAY_MODE_DIRECT = 0;
export const PATH_OVERLAY_MODE_FLOW = 1;
export const PATH_OVERLAY_MODE_HPA = 2;
//
export const EDITOR_NAV_MODE_OFF = 0;
export const EDITOR_NAV_MODE_FLOW = 1;
export const EDITOR_NAV_MODE_HPA = 2;
//
export const SANDBOX_PATH_VISUAL_OFF = 0;
export const SANDBOX_PATH_VISUAL_NORMAL = 1;
export const SANDBOX_PATH_VISUAL_DEBUG = 2;
export const SANDBOX_PATH_VISUAL_COUNT = 3;
//
export const NAV_PATH_DEBUG_OFF = 0;
export const NAV_PATH_DEBUG_ALL = 1;
export const NAV_PATH_DEBUG_REACHABLE = 2;
export const NAV_PATH_DEBUG_COUNT = 3;
//
// Overlay commands
export const OVERLAY_CMD_AABB = 0;
export const OVERLAY_CMD_CIRCLE_STROKE = 1;
export const OVERLAY_CMD_CIRCLE_FILL_STROKE = 2;
export const OVERLAY_CMD_SEGMENT = 3;
export const OVERLAY_CMD_POLYLINE = 4;
export const OVERLAY_CMD_ARROW_HEAD = 5;
export const OVERLAY_CMD_DIRECTION_ARROW = 6;
export const OVERLAY_CMD_AIM_SEGMENT = 7;
// Overlay glyph sprite-cache families
export const OVERLAY_RENDER_KEY_SELECTION_RING = 1;
export const OVERLAY_RENDER_KEY_PATH_DESTINATION = 2;
export const OVERLAY_RENDER_KEY_PATH_ARROW_HEAD = 3;
export const OVERLAY_RENDER_KEY_FLOW_DIRECTION_ARROW = 4;
export const OVERLAY_RENDER_KEY_WIRE_ENDPOINT = 5;
export const OVERLAY_RENDER_KEY_GRID_CELL_HIGHLIGHT = 6;
export const OVERLAY_RENDER_KEY_PATH_DEBUG_NODE = 7;
export const OVERLAY_RENDER_KEY_FLOATING_TEXT = 8;
// Grid stamp filmstrip sprite-cache families
export const GRID_STAMP_RENDER_KEY_FLOOR_BELT = 1;
export const GRID_STAMP_RENDER_KEY_PORTAL = 2;
// Stepped circle ray hit kinds
export const CIRCLE_RAY_HIT_NONE = 0;
export const CIRCLE_RAY_HIT_WALL = 1;
