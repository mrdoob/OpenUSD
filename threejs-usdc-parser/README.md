# USDC Parser for Three.js

A pure JavaScript parser for reading USDC (Universal Scene Description Crate) binary files in Three.js applications. This parser provides a lightweight, dependency-free way to load USD assets in the browser without requiring any native USD libraries.

## Features

- **Pure JavaScript** - No native dependencies, runs entirely in the browser
- **USDC Binary Format** - Full support for the Crate (.usdc) binary format
- **Geometries** - Parse mesh data with vertex positions, normals, UVs, and face topology
- **Materials** - Support for UsdPreviewSurface PBR materials
- **Textures** - Texture reference extraction (loading textures requires additional implementation)
- **Scene Graph** - Hierarchical transform (Xform) support
- **Lights** - Support for RectLight, SphereLight, DistantLight, DiskLight, and DomeLight
- **GLTF-like Feature Set** - Covers similar scope to GLTF for 3D asset interchange

## Architecture

The parser consists of two main components:

### 1. USDCParser (`USDCParser.js`)

Low-level binary parser that reads the USDC file format:

- **Bootstrap Header** - File identification and version
- **Table of Contents** - Section directory
- **Structural Sections** - Tokens, strings, paths, specs, fields, field sets
- **Value Unpacking** - Type-aware value deserialization
- **Schema Extraction** - Geometry, material, light, and transform data extraction

### 2. USDZLoader (`USDZLoader.js`)

Three.js integration layer that converts USD data to Three.js objects:

- **File Loading** - Handles both .usdc and .usdz formats
- **Scene Building** - Creates Three.js scene graph from USD prims
- **Geometry Conversion** - Triangulates USD meshes for Three.js
- **Material Conversion** - Maps USD materials to Three.js PBR materials
- **Light Conversion** - Creates appropriate Three.js lights
- **Transform Application** - Applies USD transforms to Three.js objects

## Installation

```bash
# Copy the source files to your project
cp -r threejs-usdc-parser/src /path/to/your/project/
```

Or use as ES6 modules directly:

```javascript
import { USDZLoader } from './src/USDZLoader.js';
```

## Usage

### Basic Usage

```javascript
import * as THREE from 'three';
import { USDZLoader } from './src/USDZLoader.js';

const scene = new THREE.Scene();
const loader = new USDZLoader();

loader.load('model.usdc', (group) => {
    scene.add(group);
    console.log('USD model loaded:', group);
}, undefined, (error) => {
    console.error('Error loading USD file:', error);
});
```

### Loading from ArrayBuffer

```javascript
const loader = new USDZLoader();

fetch('model.usdc')
    .then(response => response.arrayBuffer())
    .then(buffer => {
        const group = loader.parse(buffer, 'model.usdc');
        scene.add(group);
    });
```

### Using File Input

```html
<input type="file" id="fileInput" accept=".usdc,.usdz" />

<script type="module">
import { USDZLoader } from './src/USDZLoader.js';

const loader = new USDZLoader();

document.getElementById('fileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
        const group = loader.parse(e.target.result, file.name);
        scene.add(group);
    };

    reader.readAsArrayBuffer(file);
});
</script>
```

## USDC File Format

The USDC (Crate) format is the binary representation of USD data. The parser handles:

### File Structure

```
┌─────────────────────────────────────┐
│ Bootstrap Header                    │
│ - Identifier: "PXR-USDC"           │
│ - Version: major.minor.patch       │
│ - TOC Offset: int64                │
│ - Reserved: 64 bytes               │
├─────────────────────────────────────┤
│ Structural Sections                 │
│ - tokens    : Token strings        │
│ - strings   : String data          │
│ - fields    : Field definitions    │
│ - fieldSets : Field groupings      │
│ - specs     : Prim specifications  │
│ - paths     : Prim paths           │
├─────────────────────────────────────┤
│ Table of Contents (at end)          │
│ - Section names and offsets        │
└─────────────────────────────────────┘
```

### Value Representation

Values are encoded in 8 bytes (ValueRep):

```
┌────────────────────────────────────────────────────┐
│ Bit 63: IsArray                                    │
│ Bit 62: IsInlined                                  │
│ Bit 61: IsCompressed                               │
│ Bit 60: IsArrayEdit                                │
│ Bits 56-48: Type enum (256 possible types)        │
│ Bits 47-0: Payload (inline value or file offset) │
└────────────────────────────────────────────────────┘
```

### Supported USD Types

- **Primitives**: Bool, UChar, Int, UInt, Int64, UInt64, Float, Double, Half
- **Vectors**: Vec2f, Vec3f, Vec4f, Vec2d, Vec3d, Vec4d
- **Matrices**: Matrix2d, Matrix3d, Matrix4d
- **Quaternions**: Quatf, Quatd, Quath
- **Strings**: String, Token, AssetPath
- **Arrays**: All types support array variants

## USD Schema Support

### UsdGeom - Geometry

#### Mesh
- `points` - Vertex positions (Vec3f[])
- `normals` - Vertex normals (Vec3f[])
- `faceVertexIndices` - Face connectivity (int[])
- `faceVertexCounts` - Vertices per face (int[])
- `primvars:st` - UV coordinates (Vec2f[])
- `subdivisionScheme` - "none", "catmullClark", etc.

#### Xform (Transform)
- `xformOp:translate` - Translation (Vec3d)
- `xformOp:rotateXYZ` - Euler rotation (Vec3d, degrees)
- `xformOp:scale` - Scale (Vec3d)
- `xformOp:transform` - 4x4 matrix (Matrix4d)

### UsdShade - Materials

#### Material / Shader
- `inputs:diffuseColor` - Base color (Vec3f)
- `inputs:metallic` - Metallic factor (float)
- `inputs:roughness` - Roughness factor (float)
- `inputs:opacity` - Opacity (float)
- `inputs:emissiveColor` - Emission color (Vec3f)
- `inputs:normal` - Normal map
- Texture inputs (file paths as AssetPath)

### UsdLux - Lights

#### RectLight
- `inputs:width`, `inputs:height` - Physical dimensions
- `inputs:intensity`, `inputs:exposure` - Brightness
- `inputs:color` - Light color

#### SphereLight / DiskLight
- `inputs:radius` - Light radius
- `inputs:intensity`, `inputs:exposure` - Brightness
- `inputs:color` - Light color

#### DistantLight
- `inputs:angle` - Angular size
- `inputs:intensity` - Brightness
- `inputs:color` - Light color

#### DomeLight
- `inputs:texture:file` - Environment map
- `inputs:intensity` - Brightness

## API Reference

### USDZLoader

#### Methods

```javascript
load(url, onLoad, onProgress, onError)
```
Load a USD file from URL.

- `url` - File URL
- `onLoad` - Callback function receiving Three.js Group
- `onProgress` - Progress callback (optional)
- `onError` - Error callback (optional)

```javascript
parse(arrayBuffer, filename)
```
Parse USD data from ArrayBuffer.

- `arrayBuffer` - Binary USD data
- `filename` - Original filename (for reference)
- Returns: Three.js Group

### USDCParser

#### Methods

```javascript
parse(buffer)
```
Parse USDC binary data.

- `buffer` - ArrayBuffer containing USDC data
- Returns: USD data object

```javascript
extractMeshGeometry(prim)
```
Extract mesh geometry from prim.

- `prim` - USD prim object
- Returns: Geometry data object

```javascript
extractTransform(prim)
```
Extract transform from prim.

- `prim` - USD prim object
- Returns: Transform data object

```javascript
extractLight(prim)
```
Extract light parameters from prim.

- `prim` - USD prim object
- Returns: Light data object

```javascript
extractMaterial(prim)
```
Extract material/shader data from prim.

- `prim` - USD prim object
- Returns: Material data object

## Limitations and Future Work

### Current Limitations

1. **USDZ Support** - ZIP extraction not yet implemented (only plain .usdc works)
2. **Texture Loading** - Texture file references are extracted but not automatically loaded
3. **Path Compression** - Simplified path reading (full compression algorithm TBD)
4. **Subdivision Surfaces** - Metadata preserved but not evaluated
5. **Value Compression** - Integer compression not yet implemented
6. **Time Samples** - Animation data extracted but not animated
7. **Composition Arcs** - References, payloads, variants not resolved

### Roadmap

- [ ] USDZ (ZIP) archive support
- [ ] Automatic texture loading from file references
- [ ] Full compressed path implementation
- [ ] Integer array decompression
- [ ] Subdivision surface evaluation
- [ ] Animation timeline support
- [ ] Composition arc resolution (references, variants, payloads)
- [ ] Instancing support
- [ ] Skeleton and skinning
- [ ] Volume primitives

## Comparison with GLTF

| Feature | GLTF | This USD Parser | Notes |
|---------|------|----------------|-------|
| Geometries | ✅ | ✅ | Full mesh support |
| Materials (PBR) | ✅ | ✅ | UsdPreviewSurface → Three.js |
| Textures | ✅ | ⚠️ | References extracted, loading TBD |
| Scene Graph | ✅ | ✅ | Hierarchical transforms |
| Lights | ✅ | ✅ | Multiple light types |
| Animations | ✅ | ❌ | Time samples extracted, not animated |
| Skinning | ✅ | ❌ | Future work |
| Morph Targets | ✅ | ❌ | Future work |
| Extensions | ✅ | N/A | USD uses composition instead |

## Examples

See the `examples/` directory for:

- `basic-example.html` - Complete demo with file loading UI
- More examples coming soon!

## Contributing

Contributions are welcome! Key areas for improvement:

1. USDZ archive extraction
2. Texture loading implementation
3. Animation support
4. Composition arc resolution
5. Performance optimizations

## License

Apache 2.0 (matching OpenUSD license)

## References

- [OpenUSD Documentation](https://openusd.org/)
- [USD File Format Specification](https://openusd.org/release/spec_usd.html)
- [Three.js Documentation](https://threejs.org/docs/)
- [GLTF Specification](https://www.khronos.org/gltf/) (for feature comparison)

## Technical Details

### Binary Format Implementation

The parser implements the USDC "Crate" format as defined in:
- `pxr/usd/sdf/crateFile.h` - Core format structures
- `pxr/usd/sdf/crateData.h` - Data abstraction
- `pxr/usd/sdf/crateDataTypes.h` - Type definitions

### Design Philosophy

This parser is designed to be:

1. **Self-contained** - No external dependencies beyond Three.js
2. **Readable** - Clear code structure for educational purposes
3. **Extensible** - Easy to add new schema support
4. **Browser-first** - Optimized for web usage
5. **GLTF-comparable** - Similar feature scope to GLTF for familiar workflows

## Acknowledgments

Based on the OpenUSD project by Pixar Animation Studios and the USD community.

Special thanks to the Three.js team for the excellent 3D framework.
