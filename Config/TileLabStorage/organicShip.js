export default {
    "warp": {
        "frequency": 0.0025,
        "amplitude": 4,
        "octaves": 2,
        "sampleOffset": [
            100,
            100
        ]
    },
    "palette": {
        "base": [
            10,
            2,
            5
        ],
        "floorBase": [
            0,
            0,
            18
        ],
        "wallBase": [
            0,
            64,
            64
        ]
    },
    "motifs": [
        {
            "type": "fractalCracks",
            "coordinateSpace": "eval",
            "frequency": 0.05,
            "octaves": 4,
            "threshold": 0.65,
            "peak": 13,
            "offset": [
                0,
                0
            ],
            "tint": [
                -5,
                -5,
                -5
            ],
            "surfaceMask": "all",
            "blendMode": "add",
            "opacity": 1
        },
        {
            "type": "hexGrid",
            "cellWorldSize": 64,
            "groutWidth": 0.2,
            "groutPeak": 11,
            "groutTint": [
                5,
                -1,
                4
            ],
            "cellVariation": 2,
            "jitterOffset": [
                0,
                0
            ],
            "bevelWidth": 0.025,
            "highlightPeak": 8,
            "shadowPeak": -6,
            "bevelTint": [
                1,
                1,
                1
            ],
            "bevelFalloff": 0.1,
            "surfaceMask": "all",
            "blendMode": "replace",
            "opacity": 1
        },
        {
            "type": "filterHSV",
            "hueShift": -140,
            "saturation": 0.5,
            "value": 1,
            "surfaceMask": "all",
            "blendMode": "replace",
            "opacity": 1
        }
    ]
};