# Three.js USDC Parser Integration Plan

## Overview

Integrate our comprehensive USDC parser into three.js by replacing the stub `USDCParser.js` with a full implementation that matches Three.js patterns.

## Current State

**Three.js (stub):**
```javascript
class USDCParser {
    parse(buffer) {
        // TODO
        return new Group();
    }
}
```

**Our Implementation:**
- USDCParser.js (1493 lines) - Binary parsing
- USDZLoader.js (1290 lines) - Three.js integration  
- IntegerCompression.js (186 lines) - Compression codec
- Total: 2,969 lines

## Integration Architecture

### Single File Approach (Recommended)

Create one comprehensive `USDCParser.js` (~2600 lines) that includes:

1. **Embedded Helper Classes** (~400 lines)
   - HalfFloat - 16-bit float conversion
   - SimpleLZ4 - Basic LZ4 decompression
   - IntegerCompression - Delta+classification codec

2. **Core USDC Parsing** (~1000 lines)
   - Bootstrap header reading
   - Table of Contents parsing
   - Section reading (tokens, strings, fields, specs, paths)
   - Value unpacking (60+ USD types)
   - Compressed path reconstruction

3. **Three.js Scene Building** (~1200 lines)
   - Object creation (8 geometry types)
   - Material conversion (PBR materials)
   - Texture loading (from assets parameter)
   - Light creation (5 types)
   - Camera creation
   - Animation building (TimeSamples → AnimationClip)
   - Transform application

### Key Interface

```javascript
class USDCParser {
    parse(buffer, assets = {}) {
        // 1. Parse USDC binary format
        const usdData = this.parseUSDC(buffer);
        
        // 2. Build Three.js scene
        const group = this.buildThreeScene(usdData, assets);
        
        // 3. Load textures from assets
        this.loadTextures(group, usdData, assets);
        
        // 4. Build animations
        if (animations) group.animations = animations;
        
        return group;
    }
}
```

### Assets Parameter

The `assets` object maps file paths to Blob URLs:

```javascript
{
    'textures/diffuse.png': 'blob:http://localhost/...',
    'textures/normal.png': 'blob:http://localhost/...',
    'model.usdc': ArrayBuffer
}
```

This is populated by `USDLoader.js` when extracting USDZ archives with fflate.

## Implementation Steps

### Step 1: Create Helper Classes

Embed these classes at the top of USDCParser.js:

```javascript
// HalfFloat - IEEE 754 16-bit float
class HalfFloat {
    static toFloat(half) { /* ... */ }
}

// SimpleLZ4 - Basic LZ4 decompression
class SimpleLZ4 {
    static decompress(compressed, size) { /* ... */ }
}

// IntegerCompression - Delta+classification codec
class IntegerCompression {
    static decompressIntegers(buffer, count, is64Bit) { /* ... */ }
}
```

### Step 2: Add Core Parsing Methods

From our USDCParser.js:

- `constructor()` - Initialize type enums and state
- `reset()` - Clear parser state
- `readBootstrap()` - Read bootstrap header
- `readTableOfContents()` - Read TOC
- `readTokens/Strings/Fields/FieldSets/Specs/Paths()` - Read sections
- `unpackValueRep()` - Unpack 8-byte value representation
- `readValue/readArrayValue/readSingleValue()` - Read values
- `readDictionary/TimeSamples/ListOp()` - Complex types
- `buildDecompressedPaths()` - Reconstruct compressed paths

### Step 3: Add Schema Extraction Methods

From our USDCParser.js:

- `extractMeshGeometry(prim)` - Extract mesh data
- `extractTransform(prim)` - Extract xform data
- `extractLight(prim)` - Extract light parameters
- `extractMaterial(prim)` - Extract material/shader data
- `resolveShaderConnections()` - Traverse shader graph
- `extractTextureConnections()` - Get texture file paths

### Step 4: Add Scene Building Methods

From our USDZLoader.js, adapted to not require TextureLoader:

- `buildThreeScene(usdData, assets)` - Main scene builder
- `createObject(prim, usdData, assets)` - Object factory
- `createMesh/Points/BasisCurves()` - Geometry creation
- `createCamera()` - Camera creation
- `createCube/Sphere/Cylinder/Cone/Capsule()` - Parametric shapes
- `createXform()` - Transform groups
- `createLight()` - Light creation
- `convertGeometry()` - USD mesh → BufferGeometry
- `findAndCreateMaterial()` - Material creation
- `applyTransform()` - Apply transforms
- `buildAnimations()` - Animation creation

### Step 5: Texture Loading (Simplified)

Since Three.js USDLoader.js handles texture loading at a higher level, we:

1. **Extract texture paths** from shader graphs
2. **Store them in material.userData**
3. **Let USDLoader apply textures** after calling parse()

Alternative: Add a `loadTexture()` helper that uses the TextureLoader from Three.js:

```javascript
loadTexture(path, assets) {
    if (assets[path]) {
        // Asset is a Blob URL
        const texture = this.textureLoader.load(assets[path]);
        return texture;
    }
    return null;
}
```

### Step 6: Main parse() Method

```javascript
parse(buffer, assets = {}) {
    // Step 1: Parse binary format
    this.reset();
    this.buffer = buffer;
    this.view = new DataView(buffer);
    
    const bootstrap = this.readBootstrap();
    const toc = this.readTableOfContents();
    
    this.readTokens();
    this.readStrings();
    this.readFields();
    this.readFieldSets();
    this.readSpecs();
    this.readPaths();
    
    const usdData = this.buildScene();
    
    // Step 2: Build Three.js objects
    const group = this.buildThreeScene(usdData, assets);
    
    // Step 3: Animations
    const animations = this.buildAnimations(usdData, group);
    if (animations.length > 0) {
        group.animations = animations;
    }
    
    return group;
}
```

## Three.js Import Pattern

```javascript
import {
    BufferAttribute,
    BufferGeometry,
    BoxGeometry,
    SphereGeometry,
    CylinderGeometry,
    ConeGeometry,
    CapsuleGeometry,
    ClampToEdgeWrapping,
    Group,
    HemisphereLight,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshStandardMaterial,
    MirroredRepeatWrapping,
    OrthographicCamera,
    PerspectiveCamera,
    PointLight,
    Points,
    PointsMaterial,
    RectAreaLight,
    RepeatWrapping,
    DirectionalLight,
    AnimationClip,
    VectorKeyframeTrack,
    NumberKeyframeTrack,
    QuaternionKeyframeTrack,
    Vector3,
    Color,
    Float32BufferAttribute,
    MathUtils
} from 'three';
```

## Testing Strategy

### Test 1: Simple USDC File
```javascript
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';

const loader = new USDLoader();
loader.load('cube.usdc', (group) => {
    console.log('Loaded:', group.children);
});
```

### Test 2: USDZ with Textures
```javascript
loader.load('textured.usdz', (group) => {
    console.log('Materials:', group.children[0].material);
});
```

### Test 3: Animated USD
```javascript
loader.load('animated.usdc', (group) => {
    if (group.animations.length > 0) {
        const mixer = new AnimationMixer(group);
        mixer.clipAction(group.animations[0]).play();
    }
});
```

## File Size Justification

- **USDAParser.js** (text format): ~1,000 lines
- **USDCParser.js** (binary format): ~2,600 lines

The binary format requires 2.6x more code due to:
- Binary parsing infrastructure (bootstrap, TOC, sections)
- Integer compression/decompression
- Path compression/decompression  
- Half-float conversion
- 60+ type system vs simple text parsing
- Complex value unpacking (ValueRep format)

## Compatibility

- **Matches**: Three.js import style, interface, patterns
- **No dependencies**: Everything embedded
- **Tested with**: Three.js r150+
- **Browser support**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## Next Steps

1. Create USDCParser.js (~2600 lines)
2. Test with three.js examples
3. Submit PR to three.js repository
4. Update three.js documentation

