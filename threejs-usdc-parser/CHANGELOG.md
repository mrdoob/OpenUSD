# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-01-XX

### Added

#### Core Parser
- Initial implementation of USDC (Crate) binary format parser
- Bootstrap header reading (file identification, version, TOC offset)
- Table of Contents (TOC) parsing
- Structural section parsing:
  - Tokens (string interning)
  - Strings (raw string data)
  - Fields (property definitions)
  - Field Sets (grouped properties)
  - Specs (prim specifications)
  - Paths (prim hierarchy paths)
- ValueRep unpacking (8-byte value representation)
- Type system support for 60+ USD types:
  - Primitives: Bool, Int, UInt, Float, Double, etc.
  - Vectors: Vec2f, Vec3f, Vec4f, Vec2d, Vec3d, Vec4d
  - Matrices: Matrix2d, Matrix3d, Matrix4d
  - Quaternions: Quatf, Quatd, Quath
  - Strings: String, Token, AssetPath
  - Arrays of all supported types
- Inline value optimization support
- Scene building from parsed data

#### Schema Support

##### UsdGeom (Geometry)
- Mesh primitive support:
  - Vertex positions (`points`)
  - Vertex normals (`normals`)
  - Face topology (`faceVertexIndices`, `faceVertexCounts`)
  - UV coordinates (`primvars:st`)
  - Subdivision scheme metadata
- Xform (Transform) support:
  - Translation (`xformOp:translate`)
  - Rotation (`xformOp:rotateXYZ`)
  - Scale (`xformOp:scale`)
  - 4x4 matrix transforms (`xformOp:transform`)

##### UsdShade (Materials)
- Material extraction
- UsdPreviewSurface shader inputs:
  - Diffuse color
  - Metallic
  - Roughness
  - Opacity
  - Emissive color
  - Texture references (extraction only)

##### UsdLux (Lights)
- RectLight support (rectangular area light)
- SphereLight support (spherical point light)
- DiskLight support (disk-shaped area light)
- DistantLight support (directional light)
- DomeLight support (environment/hemisphere light)
- Light parameters:
  - Color
  - Intensity
  - Exposure
  - Shape-specific dimensions (width, height, radius, angle)

#### Three.js Integration
- USDZLoader class for Three.js integration
- Automatic scene graph hierarchy construction
- Geometry conversion:
  - USD mesh → Three.js BufferGeometry
  - Fan triangulation for n-gons
  - Automatic normal computation when not provided
- Material conversion:
  - USD materials → Three.js MeshStandardMaterial
  - PBR parameter mapping
  - Transparency support
- Light conversion:
  - USD lights → Three.js lights (RectAreaLight, PointLight, DirectionalLight, HemisphereLight)
  - Intensity and exposure calculation
  - Color conversion
- Transform application:
  - TRS decomposition
  - Matrix transforms
  - Hierarchical transform composition

#### Examples and Documentation
- Basic HTML example with file upload
- Interactive viewer with:
  - OrbitControls camera
  - Statistics display
  - Wireframe toggle
  - Camera reset
- Comprehensive README with:
  - Feature overview
  - Installation instructions
  - Usage examples
  - API reference
  - File format documentation
  - Comparison with GLTF
- Integration guide covering:
  - Browser integration
  - Node.js integration
  - React integration
  - Custom material processing
  - Texture loading patterns
  - Progress tracking
  - Memory management
  - Performance optimization
- Test utilities:
  - Node.js test script
  - Structure validation
  - File parsing verification

#### Developer Tools
- package.json for npm compatibility
- ES6 module exports (browser and Node.js)
- Test runner script
- Comprehensive inline code documentation

### Technical Details

#### File Format Support
- USDC version 0.8.0 (current OpenUSD default)
- Bootstrap structure (96 bytes)
- Section-based file organization
- Little-endian byte order
- Memory-efficient parsing (no full file buffering required)

#### Performance Characteristics
- Zero-copy value reading where possible
- Lazy evaluation of time samples
- Efficient string interning via token table
- Minimal memory allocation during parse

### Known Limitations

#### Not Yet Implemented
- USDZ (ZIP) archive extraction
- Automatic texture file loading
- Full compressed path algorithm
- Integer array compression/decompression
- Subdivision surface evaluation
- Time sample animation playback
- Composition arcs:
  - References
  - Variants
  - Payloads
  - Inherits
  - Specializes
- Instancing
- Skinning/skeleton rigs
- Blend shapes/morph targets
- Volume primitives
- Curves and nurbs

#### Partial Implementations
- Path reading (simplified, not fully compressed format)
- Value unpacking (subset of types implemented)
- Primvar interpolation (metadata preserved, not evaluated)

### Browser Compatibility
- Requires ES6+ (class syntax, arrow functions, BigInt)
- Requires DataView and TypedArrays
- Tested on:
  - Chrome 90+
  - Firefox 88+
  - Safari 14+
  - Edge 90+

### Dependencies
- Three.js (peer dependency, >=0.150.0)
- No other runtime dependencies

### File Size
- USDCParser.js: ~28KB unminified
- USDZLoader.js: ~15KB unminified
- Total: ~43KB (estimated ~12KB gzipped)

## [Unreleased]

### Planned Features
- USDZ (ZIP) archive support with dependency resolution
- Automatic texture loading
- Animation timeline support
- Variant selection
- Reference and payload resolution
- Skinning and blend shapes
- Curve primitives
- Performance optimizations:
  - Worker thread parsing
  - Streaming large files
  - Progressive loading
- Additional examples:
  - Animation playback
  - Variant switching
  - Material editor
  - Performance comparison

### Under Consideration
- USD ASCII (.usda) format support
- USD writing capabilities
- Composition arc evaluation
- Full OpenSubdiv integration for subdivision surfaces
- WebGPU acceleration
- Draco-style geometry compression
- Basis Universal texture compression

---

## Version History Legend

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security vulnerability fixes
