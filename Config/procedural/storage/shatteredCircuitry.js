import { SURFACE_MASK_ALL, BLEND_MODE_ADD, BLEND_MODE_REPLACE, COORD_SPACE_EVAL } from "../../../Core/engineEnums.js";;
export default {
    "warp": {
        "frequency": 0.01,
        "amplitude": 0,
        "octaves": 2,
        "sampleOffset": [
            200,
            300
        ]
    },
    "palette": {
        "base": [
            5,
            10,
            15
        ],
        "floorBase": [
            32,
            32,
            32
        ],
        "wallBase": [
            32,
            32,
            32
        ]
    },
    "motifs": [
        {
            "type": "fractalCracks",
            "coordinateSpace": COORD_SPACE_EVAL,
            "frequency": 0.036,
            "octaves": 3,
            "threshold": 0.59,
            "peak": 2,
            "offset": [
                0,
                0
            ],
            "tint": [
                3.7,
                3.2,
                2.6
            ],
            "surfaceMask": SURFACE_MASK_ALL,
            "blendMode": BLEND_MODE_ADD
        },
        {
            "type": "filterHSV",
            "hueShift": 171,
            "saturation": 5,
            "value": 1.6,
            "surfaceMask": SURFACE_MASK_ALL,
            "blendMode": BLEND_MODE_ADD
        },
        {
            "type": "fractalCracks",
            "coordinateSpace": COORD_SPACE_EVAL,
            "frequency": 0.007,
            "octaves": 1,
            "threshold": 0.53,
            "peak": 19,
            "offset": [
                0,
                0
            ],
            "tint": [
                3.4,
                1.9,
                5
            ],
            "surfaceMask": SURFACE_MASK_ALL,
            "blendMode": BLEND_MODE_REPLACE
        },
        {
            "type": "filterHSV",
            "hueShift": 7,
            "saturation": 5,
            "value": 0,
            "surfaceMask": SURFACE_MASK_ALL,
            "blendMode": BLEND_MODE_ADD
        },
        {
            "type": "filterLevels",
            "blackPoint": 0,
            "whitePoint": 194,
            "gamma": 0.2,
            "blendMode": BLEND_MODE_REPLACE,
            "surfaceMask": SURFACE_MASK_ALL
        }
    ]
};