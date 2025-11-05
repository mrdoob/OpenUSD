# Three.js Integration for USDC Parser

This directory contains files ready to be integrated into the three.js repository.

## Files for Integration

1. **USDCParser.js** → `examples/jsm/loaders/usd/USDCParser.js`
   - Replaces the current stub implementation
   - Complete USDC binary format parser with Three.js scene building
   - ~2600 lines (matches complexity of USDAParser.js which is ~1000 lines for simpler text format)

## Integration Steps

### 1. Replace USDCParser.js

```bash
cp USDCParser.js <three.js-repo>/examples/jsm/loaders/usd/USDCParser.js
```

### 2. Test with USDLoader

The existing `USDLoader.js` already has the correct interface:

```javascript
// From USDLoader.js
if (isCrateFile(buffer)) {
    const usdc = new USDCParser();
    return usdc.parse(buffer, assets);  // ← This is the interface we match
}
```

### 3. Test with Sample Files

```javascript
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';

const loader = new USDLoader();
loader.load('model.usdz', (group) => {
    scene.add(group);
    console.log('Loaded USDZ with', group.children.length, 'objects');
});
```

## What's Included

### Geometry Types (8 types)
- Mesh - Polygonal geometry with triangulation
- Points - Point clouds
- BasisCurves - Hair, cables
- Cube, Sphere, Cylinder, Cone, Capsule - Parametric shapes

### Cameras
- Perspective & Orthographic

### Materials & Textures
- PBR materials (UsdPreviewSurface)
- Texture loading from assets parameter
- Shader graph traversal

### Animation
- TimeSamples → AnimationClip conversion

### Lights (5 types)
- RectLight, DiskLight, SphereLight, DistantLight, DomeLight

## Interface Compatibility

Our implementation matches the Three.js interface exactly:

```javascript
class USDCParser {
    parse(buffer, assets = {}) {
        // Parse USDC binary format
        // Build Three.js scene objects
        // Load textures from assets
        // Return a Group
    }
}
```

Where `assets` is an object mapping file paths to URLs:
```javascript
{
    'textures/diffuse.png': 'blob:http://...',
    'textures/normal.png': 'blob:http://...'
}
```

## Differences from Standalone Version

1. **No JSZip dependency** - Three.js USDLoader handles USDZ extraction with fflate
2. **Uses assets parameter** - Instead of USDZArchive
3. **Returns Group** - Instead of data structure
4. **Three.js imports** - Uses individual imports, not `import * as THREE`
5. **Embedded helpers** - HalfFloat, IntegerCompression, SimpleLZ4 are embedded

## Size Comparison

- USDAParser.js (text format): ~1000 lines
- USDCParser.js (binary format): ~2600 lines

The binary format is more complex due to:
- Bootstrap header parsing
- Table of contents navigation  
- Compressed integers
- Compressed paths
- Complex type system (60+ types)
- Half-float support
- Binary value unpacking

## Testing

Test with:
1. Simple USDC files (geometries only)
2. USDZ files with textures
3. Animated USDC files
4. Files with lights and cameras

## Known Limitations

Same as standalone version:
- No subdivision surface evaluation
- No skeletal animation
- No composition arcs (references, variants)
- Basic shader graphs only

## License

Apache-2.0 (matching OpenUSD and Three.js)
