import { SURFACE_MASK_ALL, SURFACE_MASK_FLOOR, SURFACE_MASK_WALL } from "../../../Core/engineEnums.js";
export default {
    "warp": {
        "frequency": 0.004,
        "amplitude": 5,
        "octaves": 2,
        "sampleOffset": [
            200,
            200
        ]
    },
    "palette": {
        "base": [
            14,
            10,
            8
        ],
        "floorBase": [
            10,
            8,
            6
        ],
        "wallBase": [
            10,
            8,
            6
        ]
    },
    "motifs": [
        {
            "type": "baseMetal",
            "structure": {
                "frequency": 0.006,
                "octaves": 3,
                "rgbDelta": [
                    3,
                    2,
                    1
                ]
            },
            "grain": {
                "frequency": 0.4,
                "octaves": 2,
                "amplitude": 0.8
            },
            "surfaceMask": SURFACE_MASK_ALL,
            "blendMode": "add",
            "opacity": 1
        },
        {
            "type": "stainBlotch",
            "surfaceMask": SURFACE_MASK_ALL,
            "coordinateSpace": "eval",
            "frequency": 0.012,
            "threshold": 0.45,
            "peak": 8,
            "offset": [
                50,
                50
            ],
            "tint": [
                -3,
                -2.6,
                -2.2
            ],
            "octaves": 2,
            "blendMode": "add",
            "opacity": 0.75
        },
        {
            "type": "deckPlates",
            "surfaceMask": SURFACE_MASK_FLOOR,
            "cellWorldSize": 8,
            "plateCells": 2,
            "plateRows": 2,
            "groutWidth": 0.04,
            "groutPeak": 12,
            "groutTint": [
                -10,
                -10,
                -8
            ],
            "plateVariation": 6,
            "jitterOffset": [
                0,
                0
            ],
            "rivetSpacing": 16,
            "rivetInset": 4,
            "rivetRadius": 0.018,
            "rivetPeak": 8,
            "rivetTint": [
                1.2,
                0.8,
                0.5
            ],
            "blendMode": "add",
            "opacity": 0.9
        },
        {
            "type": "wallHorizontalBevel",
            "surfaceMask": SURFACE_MASK_WALL,
            "bands": 5,
            "ribFill": 0.6,
            "highlightPeak": 6,
            "shadowPeak": 12,
            "coreWidth": 0.25,
            "corePeak": 15,
            "coreTint": [
                1.8,
                0.8,
                0.2
            ],
            "snakeStrength": 0,
            "blendMode": "add",
            "opacity": 0.8
        },
        {
            "type": "wallLighting",
            "surfaceMask": SURFACE_MASK_WALL,
            "power": 1.3,
            "topDarken": 25,
            "coolBias": 1.06,
            "blendMode": "add",
            "opacity": 1
        },
        {
            "type": "filterHSV",
            "surfaceMask": SURFACE_MASK_ALL,
            "hueShift": -172,
            "saturation": 1.1,
            "value": 0.3,
            "blendMode": "replace",
            "opacity": 1
        }
    ],
    "animation": {
        "stages": [
            {
                "frames": 30,
                "durationMs": 800,
                "tracks": [
                    {
                        "targetPath": "motifs[3].corePeak",
                        "startValue": 15,
                        "endValue": 4,
                        "easing": "easeInOutSine"
                    }
                ]
            },
            {
                "frames": 10,
                "durationMs": 200,
                "tracks": [
                    {
                        "targetPath": "motifs[3].corePeak",
                        "startValue": 4,
                        "endValue": 24,
                        "easing": "easeOutQuad"
                    }
                ]
            },
            {
                "frames": 20,
                "durationMs": 400,
                "tracks": [
                    {
                        "targetPath": "motifs[3].corePeak",
                        "startValue": 24,
                        "endValue": 0,
                        "easing": "easeInQuad"
                    }
                ]
            },
            {
                "frames": 30,
                "durationMs": 600,
                "tracks": [
                    {
                        "targetPath": "motifs[3].corePeak",
                        "startValue": 0,
                        "endValue": 15,
                        "easing": "easeOutCubic"
                    }
                ]
            }
        ]
    }
};