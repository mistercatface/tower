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
            4,
            4,
            4
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
            "surfaceMask": "all",
            "blendMode": "add",
            "opacity": 1
        },
        {
            "type": "stainBlotch",
            "surfaceMask": "all",
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
            "surfaceMask": "floor",
            "cellWorldSize": 32,
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
            "blendMode": "multiply",
            "opacity": 0.9
        },
        {
            "type": "wallHorizontalBevel",
            "surfaceMask": "wall",
            "bands": 6,
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
            "type": "circuitTraces",
            "surfaceMask": "all",
            "coordinateSpace": "warped",
            "gridSize": 32,
            "lineWidth": 1.5,
            "density": 0.45,
            "diagDensity": 0.2,
            "peak": 25,
            "tint": [
                2.2,
                0.8,
                0.2
            ],
            "padEnabled": true,
            "blendMode": "add",
            "opacity": 0.85
        },
        {
            "type": "wallLighting",
            "surfaceMask": "wall",
            "power": 1.3,
            "topDarken": 25,
            "coolBias": 1.06,
            "blendMode": "multiply",
            "opacity": 1
        },
        {
            "type": "filterHSV",
            "surfaceMask": "all",
            "hueShift": 0,
            "saturation": 1.4,
            "value": 0.85,
            "blendMode": "replace",
            "opacity": 1
        }
    ],
    "animation": {
        "stages": [
            {
                "frames": 30,
                "durationMs": 600,
                "tracks": [
                    {
                        "targetPath": "motifs[1].frequency",
                        "startValue": 0.05,
                        "endValue": 0,
                        "easing": "easeInCubic"
                    }
                ]
            },
            {
                "frames": 30,
                "durationMs": 600,
                "tracks": [
                    {
                        "targetPath": "motifs[1].frequency",
                        "startValue": 0,
                        "endValue": 0.05,
                        "easing": "easeOutCubic"
                    }
                ]
            }
        ]
    }
};