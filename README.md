# endlessterrain
A Computer Graphic project for procedural terrain generation.

# Schedule
## Phase 1: Core terrain generation
1. Noise function *
   - Generate height values from coordinates
   - `function noise(x, y) { return height: float }`
2. Terrain buffer *
   - Create geometry from noise values
   - `function buffer(chunkId) { return BufferGeometry }`

## Phase 2: Visual enhancement
3. Color shader *
   - Color terrain by height, slope, and other factors
4. Water
   - Add water to low areas and lakes
5. Trees
   - combined with trunk and just ep leaves
   - Generate trees with variation in height, shape, and color

## Phase 3: Lighting and rendering
7. Lighting
   - Sunlight *
   - Shadow *
   - Fog
8. Chunk rendering *
   - Use seed for continuous terrain across chunks
   - Render based on camera distance
   - Control show/hide of chunks for performance

## Status legend
- `*` completed or implemented
- pending items are planned for the next iteration

## Next milestones
- complete water system
- add vegetation
- refine fog and atmosphere
- optimize chunk streaming and LOD

## Current status
- Terrain geometry generation: completed
- Colorized terrain rendering: completed
- Fog and camera controls: added

