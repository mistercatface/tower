export default{
    "warp": {
        "frequency": 0.003,
        "amplitude": 5,
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
            4,
            8,
            12
        ],
        "wallBase": [
            8,
            15,
            20
        ]
    },
    "motifs": [
        {
            "type": "fractalCracks",
            "coordinateSpace": "eval",
            "frequency": 0.03,
            "octaves": 2,
            "threshold": 0.2,
            "peak": 8,
            "offset": [
                0,
                0
            ],
            "tint": [
                3.7,
                3.5,
                2.6
            ],
            "opacity": 1,
            "blendMode": "add",
            "surfaceMask": "all"
        },
        {
            "type": "filterHSV",
            "hueShift": -180,
            "saturation": 5,
            "value": 0.3,
            "blendMode": "add",
            "opacity": 1,
            "surfaceMask": "all"
        },
        {
            "type": "surfaceGrain",
            "frequency": 0.225,
            "axis": "none",
            "axisStretch": 0.7,
            "octaves": 2,
            "amplitude": 5.5,
            "tint": [
                1,
                1,
                1
            ],
            "opacity": 1,
            "blendMode": "add",
            "surfaceMask": "all"
        },
        {
            "type": "fractalCracks",
            "coordinateSpace": "eval",
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
            "opacity": 1,
            "blendMode": "add",
            "surfaceMask": "all"
        }
    ],
    "animation": {
        "stages": [
            {
                "frames": 2,
                "durationMs": 20000,
                "tracks": [
                    {
                        "targetPath": "motifs[2].frequency",
                        "startValue": 0,
                        "endValue": 360,
                        "easing": "linear"
                    }
                ]
            }
        ]
    }
};