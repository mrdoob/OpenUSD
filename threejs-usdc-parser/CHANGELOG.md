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

## [0.2.0] - 2024-01-XX (Phase 2 Complete)

### Added

#### USDZ Archive Support
- ZIP archive extraction for .usdz files
- USDZArchive class for managing archived assets
- Automatic root file detection (lexicographically first .usdc/.usda)
- Asset path resolution with relative/absolute handling
- Data URL conversion for embedded textures
- USDTextureManager for texture loading and caching

#### Texture Loading
- Async texture loading from USDZ archives or external URLs
- Three.js TextureLoader integration
- Texture caching to avoid duplicate loads
- Color space handling (sRGB vs linear)
- Texture wrapping mode support (repeat, clamp, mirror)
- Blob/DataURL conversion for in-memory textures

#### Relationship Support
- Proper USD relationship parsing (SdfSpecTypeRelationship)
- Parse targetPaths field from relationships
- Material binding via relationships (correct USD semantics)
- Associate relationships with parent prims
- Helper methods for path manipulation

#### Animation Support
- TimeSamples to AnimationClip conversion
- Position, rotation, scale animations
- Quaternion rotation support
- Individual axis rotations (rotateX/Y/Z)
- Degree to radian conversion for rotations
- USD to Three.js quaternion reordering
- AnimationMixer compatible output
- Multiple animated objects per scene

#### Additional Geometry Types
- **Points (UsdGeomPoints)** - Point cloud rendering
  - THREE.Points creation
  - Width/size support
  - Vertex colors (primvars:displayColor)
  - Normal support
  - PointsMaterial with size attenuation
- **BasisCurves (UsdGeomBasisCurves)** - Curve rendering
  - Linear and cubic curve support
  - Multiple curves per prim
  - Curve colors (primvars:displayColor)
  - Line width support
  - Basis types: bezier, bspline, catmullRom
  - Wrap modes: nonperiodic, periodic, pinned

#### Shader Graph Support
- Shader connection traversal
- Material → Shader → Texture path resolution
- UsdUVTexture node extraction
- Shader graph property mapping
- Connection type detection (direct value vs shader connection)
- Extract texture file paths from connected nodes
- Wrap mode extraction from texture nodes

#### Advanced Type Support (from Phase 1 continuation)
- Half-float (16-bit float) conversion
- Matrix2d, Matrix3d support
- Vec2i, Vec3i, Vec4i (integer vectors)
- Vec2h, Vec3h, Vec4h (half-precision vectors)
- Dictionary (nested key-value pairs)
- TimeSamples (animation keyframes)
- ListOp operations (explicit, added, deleted, ordered)

#### Integer Compression
- Delta+classification encoding
- 2-bit codes for common values
- Support for compressed geometry arrays
- SimpleLZ4 decompression (basic implementation)
- IntegerCompression utility class

#### Compressed Paths
- Full compressed path reconstruction
- Jump table traversal
- Hierarchical path building
- Property path handling (negative token indices)

### Changed

#### USDCParser.js
- Enhanced extractMaterial() to follow relationship connections
- Added shader graph traversal methods
- Prim structure now includes relationships property
- BuildScene now processes relationship specs
- Improved error handling with try-catch blocks

#### USDZLoader.js
- parseAsync() method for async USDZ/texture loading
- parseUSDZ() for ZIP archive extraction
- parseUSDC() for standalone USDC with external textures
- buildThreeSceneAsync() with async texture loading
- loadTexturesForMaterial() with shader graph support
- Added animation building in scene construction
- createPoints() for point cloud geometry
- createBasisCurves() for curve geometry
- Store lastParsedPrims for shader graph access

### Fixed
- Material bindings now use relationships (correct USD spec)
- Texture paths resolved from shader graphs
- Animation timing correctly converted to Three.js format
- Quaternion ordering fixed for Three.js

### Technical Improvements
- Async/await pattern for texture loading
- Non-blocking USDZ extraction
- Proper USD semantics for relationships
- Shader graph connection resolution
- Correct color space handling

### Performance
- Texture caching reduces duplicate loads
- Path normalization optimized
- Lazy texture loading only when needed

### Documentation
- PHASE2_SUMMARY.md with detailed implementation notes
- Updated README with new features
- Inline code documentation for new methods

## [Unreleased]

### Planned Features (Phase 3)
- Cameras (UsdGeomCamera)
- Parametric shapes (Capsule, Cone, Cylinder, Sphere, Cube)
- Advanced shader graph patterns
- Error handling & validation improvements
- Performance optimizations:
  - Worker thread parsing
  - Lazy loading
  - Geometry/material sharing
- Testing suite:
  - Unit tests
  - Integration tests
  - Visual regression tests
- Variant selection
- Reference and payload resolution
- Skinning and blend shapes
- Additional examples:
  - Animation playback
  - Variant switching
  - Material editor

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
