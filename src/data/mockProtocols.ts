import { Protocol } from '../types/protocol';

export const PROTOCOLS: Protocol[] = [
    {
        id: 'p1',
        name: 'Arthritis Relief Protocol',
        description: 'Focuses on peripheral joints and local inflammation reduction.',
        stingingPoints: [
            { id: 'st36_l', name: 'ST36 (Left)' },
            { id: 'st36_r', name: 'ST36 (Right)' },
            { id: 'li4_l', name: 'LI4 (Left)' },
            { id: 'li4_r', name: 'LI4 (Right)' },
        ]
    },
    {
        id: 'p2',
        name: 'Immune Modulation Protocol',
        description: 'Systemic support for autoimmune conditions or chronic fatigue.',
        stingingPoints: [
            { id: 'gv14', name: 'GV14' },
            { id: 'bl23_l', name: 'BL23 (Left)' },
            { id: 'bl23_r', name: 'BL23 (Right)' },
        ]
    },
    {
        id: 'p3',
        name: 'Chronic Back Pain Protocol',
        description: 'Focuses on spinal alignment points and lumbar relief.',
        stingingPoints: [
            { id: 'bl23_l', name: 'BL23 (Left)' },
            { id: 'bl23_r', name: 'BL23 (Right)' },
            { id: 'l4', name: 'L4' },
            { id: 'c7', name: 'C7' },
        ]
    }
];
