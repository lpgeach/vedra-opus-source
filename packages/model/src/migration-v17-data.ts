/**
 * The default feedback master as format 17 wrote it, for a 1280 × 720 stage
 * (docs/briefs/P7.5-feedback.md). The 16 → 17 migration scales it to the
 * project's stage and gives everything new ids. Frozen: never edit it, so old
 * projects always become the same thing, whatever the factory makes later.
 */
export const V17_FEEDBACK_MASTER: unknown = {
  id: 'master_4w3b5kn84uv5ukr5',
  name: 'Feedback',
  kind: 'feedback',
  layer: {
    id: 'layer_5hkacoaoroh0clpl',
    name: 'Feedback Layer',
    objects: [],
    timeline: {
      duration: 5,
      cuePoints: [],
    },
    properties: {
      hideOtherLayers: true,
      hideBaseObjects: false,
      pauseBaseTimeline: false,
      blockBaseClicks: false,
      allowSeek: true,
      onRevisit: 'auto',
      transition: null,
    },
  },
  layouts: [
    {
      id: 'layout_bsm0wedgd75z0lmd',
      name: 'Correct',
      layer: {
        id: 'layer_uudrnvzzr530and9',
        name: 'Correct',
        objects: [
          {
            id: 'obj_nntvdscn6wu439vk',
            name: 'Panel',
            frame: {
              x: 64,
              y: 446,
              width: 1152,
              height: 210,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'shape',
            props: {
              geometry: {
                kind: 'roundRect',
                radius: 12,
              },
              appearance: {
                fill: {
                  kind: 'solid',
                  color: {
                    theme: 'background',
                  },
                },
                stroke: {
                  color: {
                    theme: 'accent3',
                  },
                  width: 4,
                  dash: 'solid',
                },
                shadow: null,
                opacity: 1,
              },
              text: null,
            },
          },
          {
            id: 'obj_pk4n3wiy7i192khi',
            name: 'Heading',
            frame: {
              x: 88,
              y: 462,
              width: 1104,
              height: 48,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'text',
            props: {
              text: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Correct',
                      },
                    ],
                  },
                ],
              },
              autofit: 'none',
              padding: 8,
              placeholder: null,
            },
          },
          {
            id: 'obj_1n5cp6e41qh6cmkf',
            name: 'Message',
            frame: {
              x: 88,
              y: 514,
              width: 904,
              height: 118,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'text',
            props: {
              text: {
                type: 'doc',
                content: [],
              },
              autofit: 'none',
              padding: 8,
              placeholder: 'content',
            },
          },
          {
            id: 'obj_1tef2p6fc4vlvapb',
            name: 'Continue',
            frame: {
              x: 1032,
              y: 584,
              width: 160,
              height: 48,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'button',
            props: {
              appearance: {
                fill: {
                  kind: 'solid',
                  color: {
                    theme: 'accent1',
                  },
                },
                stroke: null,
                shadow: null,
                opacity: 1,
              },
              cornerRadius: 6,
              text: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Continue',
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        timeline: {
          duration: 5,
          cuePoints: [],
        },
        properties: {
          hideOtherLayers: true,
          hideBaseObjects: false,
          pauseBaseTimeline: false,
          blockBaseClicks: false,
          allowSeek: true,
          onRevisit: 'auto',
          transition: null,
        },
      },
      role: 'correct',
    },
    {
      id: 'layout_m6q4j1ld4ttby3gf',
      name: 'Incorrect',
      layer: {
        id: 'layer_8na7o30i2pfqy1ry',
        name: 'Incorrect',
        objects: [
          {
            id: 'obj_5qrdj2olbf1qt4d2',
            name: 'Panel',
            frame: {
              x: 64,
              y: 446,
              width: 1152,
              height: 210,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'shape',
            props: {
              geometry: {
                kind: 'roundRect',
                radius: 12,
              },
              appearance: {
                fill: {
                  kind: 'solid',
                  color: {
                    theme: 'background',
                  },
                },
                stroke: {
                  color: {
                    theme: 'accent2',
                  },
                  width: 4,
                  dash: 'solid',
                },
                shadow: null,
                opacity: 1,
              },
              text: null,
            },
          },
          {
            id: 'obj_0jjff95hzty74r41',
            name: 'Heading',
            frame: {
              x: 88,
              y: 462,
              width: 1104,
              height: 48,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'text',
            props: {
              text: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Incorrect',
                      },
                    ],
                  },
                ],
              },
              autofit: 'none',
              padding: 8,
              placeholder: null,
            },
          },
          {
            id: 'obj_x51x0otmrxn2e8mv',
            name: 'Message',
            frame: {
              x: 88,
              y: 514,
              width: 904,
              height: 118,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'text',
            props: {
              text: {
                type: 'doc',
                content: [],
              },
              autofit: 'none',
              padding: 8,
              placeholder: 'content',
            },
          },
          {
            id: 'obj_o5bi47xfgex4csss',
            name: 'Continue',
            frame: {
              x: 1032,
              y: 584,
              width: 160,
              height: 48,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'button',
            props: {
              appearance: {
                fill: {
                  kind: 'solid',
                  color: {
                    theme: 'accent1',
                  },
                },
                stroke: null,
                shadow: null,
                opacity: 1,
              },
              cornerRadius: 6,
              text: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Continue',
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        timeline: {
          duration: 5,
          cuePoints: [],
        },
        properties: {
          hideOtherLayers: true,
          hideBaseObjects: false,
          pauseBaseTimeline: false,
          blockBaseClicks: false,
          allowSeek: true,
          onRevisit: 'auto',
          transition: null,
        },
      },
      role: 'incorrect',
    },
    {
      id: 'layout_zheb6k32c8vdmzb1',
      name: 'Try Again',
      layer: {
        id: 'layer_kazndmy0yl7wg4x0',
        name: 'Try Again',
        objects: [
          {
            id: 'obj_29r57vqhb9jigxdp',
            name: 'Panel',
            frame: {
              x: 64,
              y: 446,
              width: 1152,
              height: 210,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'shape',
            props: {
              geometry: {
                kind: 'roundRect',
                radius: 12,
              },
              appearance: {
                fill: {
                  kind: 'solid',
                  color: {
                    theme: 'background',
                  },
                },
                stroke: {
                  color: {
                    theme: 'accent4',
                  },
                  width: 4,
                  dash: 'solid',
                },
                shadow: null,
                opacity: 1,
              },
              text: null,
            },
          },
          {
            id: 'obj_s804y86xtv1ag2ww',
            name: 'Heading',
            frame: {
              x: 88,
              y: 462,
              width: 1104,
              height: 48,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'text',
            props: {
              text: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Not quite',
                      },
                    ],
                  },
                ],
              },
              autofit: 'none',
              padding: 8,
              placeholder: null,
            },
          },
          {
            id: 'obj_mxtwkrn8lvbg2kkn',
            name: 'Message',
            frame: {
              x: 88,
              y: 514,
              width: 904,
              height: 118,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'text',
            props: {
              text: {
                type: 'doc',
                content: [],
              },
              autofit: 'none',
              padding: 8,
              placeholder: 'content',
            },
          },
          {
            id: 'obj_ivzvgcmts2hwouul',
            name: 'Try Again',
            frame: {
              x: 1032,
              y: 584,
              width: 160,
              height: 48,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'button',
            props: {
              appearance: {
                fill: {
                  kind: 'solid',
                  color: {
                    theme: 'accent1',
                  },
                },
                stroke: null,
                shadow: null,
                opacity: 1,
              },
              cornerRadius: 6,
              text: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Try Again',
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        timeline: {
          duration: 5,
          cuePoints: [],
        },
        properties: {
          hideOtherLayers: true,
          hideBaseObjects: false,
          pauseBaseTimeline: false,
          blockBaseClicks: false,
          allowSeek: true,
          onRevisit: 'auto',
          transition: null,
        },
      },
      role: 'tryAgain',
    },
    {
      id: 'layout_zvzulqnxqzzvf6ik',
      name: 'Thank You',
      layer: {
        id: 'layer_gk07jd56ctyocmze',
        name: 'Thank You',
        objects: [
          {
            id: 'obj_7e73d7hzfnd373mu',
            name: 'Panel',
            frame: {
              x: 64,
              y: 446,
              width: 1152,
              height: 210,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'shape',
            props: {
              geometry: {
                kind: 'roundRect',
                radius: 12,
              },
              appearance: {
                fill: {
                  kind: 'solid',
                  color: {
                    theme: 'background',
                  },
                },
                stroke: {
                  color: {
                    theme: 'accent1',
                  },
                  width: 4,
                  dash: 'solid',
                },
                shadow: null,
                opacity: 1,
              },
              text: null,
            },
          },
          {
            id: 'obj_y6xq8o87t2sdvabm',
            name: 'Heading',
            frame: {
              x: 88,
              y: 462,
              width: 1104,
              height: 48,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'text',
            props: {
              text: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Thank you',
                      },
                    ],
                  },
                ],
              },
              autofit: 'none',
              padding: 8,
              placeholder: null,
            },
          },
          {
            id: 'obj_uht9cw5p7r1b195u',
            name: 'Message',
            frame: {
              x: 88,
              y: 514,
              width: 904,
              height: 118,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'text',
            props: {
              text: {
                type: 'doc',
                content: [],
              },
              autofit: 'none',
              padding: 8,
              placeholder: 'content',
            },
          },
          {
            id: 'obj_0cod48jk22johl2i',
            name: 'Continue',
            frame: {
              x: 1032,
              y: 584,
              width: 160,
              height: 48,
              rotation: 0,
            },
            timing: {
              start: 0,
              duration: 'untilEnd',
            },
            locked: false,
            hiddenInEditor: false,
            initialState: 'normal',
            states: [
              {
                id: 'normal',
                name: 'Normal',
                overrides: {},
              },
            ],
            a11y: {
              altText: '',
              visibleToAssistiveTech: true,
            },
            buttonSet: null,
            animations: {
              entrance: null,
              exit: null,
              motionPaths: [],
            },
            type: 'button',
            props: {
              appearance: {
                fill: {
                  kind: 'solid',
                  color: {
                    theme: 'accent1',
                  },
                },
                stroke: null,
                shadow: null,
                opacity: 1,
              },
              cornerRadius: 6,
              text: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Continue',
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        timeline: {
          duration: 5,
          cuePoints: [],
        },
        properties: {
          hideOtherLayers: true,
          hideBaseObjects: false,
          pauseBaseTimeline: false,
          blockBaseClicks: false,
          allowSeek: true,
          onRevisit: 'auto',
          transition: null,
        },
      },
      role: 'answered',
    },
  ],
};
