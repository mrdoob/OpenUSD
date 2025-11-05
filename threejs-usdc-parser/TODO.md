# USDC Parser - Complete Implementation Roadmap

This document outlines all remaining work to create a production-ready USDC parser for Three.js.

## Priority Levels
- **P0** - Critical for basic functionality
- **P1** - Important for real-world usage
- **P2** - Nice to have / optimization
- **P3** - Advanced features

---

## 1. Core Binary Format (Foundation)

### 1.1 Path Handling [P0]
- [ ] **Compressed Paths Implementation**
  - Current: Simplified path reading
  - Need: Full compressed path format (pathIndexes, elementTokenIndexes, jumps)
  - Files: Look at `_ReadCompressedPaths` in crateFile.cpp
  - Complexity: Medium
  - Impact: Critical - most real USD files use compressed paths

- [ ] **Path Tree Reconstruction**
  - Implement hierarchical path building from compressed data
  - Handle parent-child relationships correctly
  - Support path prefixes and element tokens
  - Estimated: 2-3 days

- [ ] **Path Expression Support**
  - Parse SdfPathExpression type (type enum 57)
  - Used for collections and advanced queries
  - Estimated: 1 day

### 1.2 Value Representation [P0]

- [ ] **Complete Type Support**
  - Currently missing types:
    - [ ] Half precision floats (proper conversion)
    - [ ] Matrix2d, Matrix3d (currently only Matrix4d)
    - [ ] All Quath (half-precision quaternions)
    - [ ] Vec2i, Vec3i, Vec4i (integer vectors)
    - [ ] Vec2h, Vec3h, Vec4h (half-precision vectors)
  - Estimated: 2 days

- [ ] **Integer Compression** [P0]
  - Implement `Sdf_IntegerCompression` decompression
  - Used when ValueRep has `IsCompressed` bit set
  - See: `pxr/usd/sdf/integerCoding.h`
  - Critical for many production files
  - Estimated: 3-4 days

- [ ] **Array Value Reading** [P0]
  - Current: Basic array support
  - Need: Zero-copy array optimization
  - Need: Proper array decompression
  - Need: Array edit support (IsArrayEditBit)
  - Estimated: 2-3 days

- [ ] **Complex Value Types** [P1]
  - [ ] Dictionary (VtDictionary) - nested key-value pairs
  - [ ] ListOp types (TokenListOp, StringListOp, PathListOp, etc.)
  - [ ] TimeSamples - proper structure reading
  - [ ] Payload/PayloadListOp
  - [ ] ReferenceListOp
  - [ ] VariantSelectionMap
  - [ ] Relocates
  - [ ] LayerOffsetVector
  - Estimated: 5-7 days

- [ ] **Value Inlining Edge Cases** [P2]
  - Handle all inlineable value patterns
  - See: `crateValueInliners.h` for full list
  - Identity matrices, zero vectors, etc.
  - Estimated: 1-2 days

### 1.3 Section Reading [P1]

- [ ] **Proper String/Token Separation**
  - Current: Simplified implementation
  - Need: Understand distinction between strings table and tokens
  - Tokens reference strings via indices
  - Estimated: 1 day

- [ ] **Section Validation**
  - Verify section checksums (if present)
  - Validate section sizes
  - Handle corrupted files gracefully
  - Estimated: 2 days

- [ ] **Missing Sections** [P2]
  - [ ] Implement reading of any additional sections
  - [ ] Handle unknown sections gracefully
  - Estimated: 1 day

---

## 2. USDC File Format Features

### 2.1 USDZ Archive Support [P1]

- [ ] **ZIP Extraction**
  - Parse PKZIP format (or use library like JSZip)
  - Extract all files from archive
  - Handle file path resolution
  - Estimated: 2-3 days

- [ ] **Multi-file Composition**
  - Load root layer (first .usdc in archive)
  - Resolve asset references to other files in archive
  - Handle relative paths
  - Estimated: 3-4 days

- [ ] **Asset Resolution**
  - Map texture references to files in archive
  - Handle different asset types (images, audio, etc.)
  - Support for external references
  - Estimated: 2-3 days

### 2.2 Time Samples & Animation [P1]

- [ ] **Time Sample Reading**
  - Properly parse TimeSamples value type
  - Read time codes and sample values
  - Handle in-memory vs file-offset samples
  - See: `TimeSamples` struct in crateFile.h (line 148-200)
  - Estimated: 2-3 days

- [ ] **Animation Timeline**
  - Build animation tracks from time samples
  - Map to Three.js AnimationClip
  - Support different interpolation types:
    - [ ] Linear
    - [ ] Held (step)
    - [ ] Cubic (spline)
  - Estimated: 4-5 days

- [ ] **Frame Rate Handling**
  - Read timeCodesPerSecond metadata
  - Convert to Three.js time units
  - Handle startTimeCode and endTimeCode
  - Estimated: 1 day

- [ ] **Attribute Animation**
  - Animate transforms (position, rotation, scale)
  - Animate material parameters
  - Animate visibility
  - Animate camera parameters
  - Estimated: 3-4 days

### 2.3 Metadata & Properties [P1]

- [ ] **Spec Metadata Reading**
  - assetInfo
  - customData
  - documentation
  - hidden, active flags
  - kind (model, component, group, etc.)
  - Estimated: 2 days

- [ ] **Property Metadata**
  - interpolation (for primvars)
  - displayName
  - displayGroup
  - colorSpace (for textures)
  - Estimated: 1-2 days

- [ ] **Default Values**
  - Read default values from schema definitions
  - Apply fallbacks when values not authored
  - Schema registry lookup
  - Estimated: 2-3 days

### 2.4 Relationships [P1]

- [ ] **Relationship Parsing**
  - Read relationship targets
  - Handle list editing (prepend, append, delete)
  - Support multiple targets
  - Estimated: 2-3 days

- [ ] **Material Bindings** [P0]
  - Currently: Looking for 'material:binding' property
  - Need: Proper relationship traversal
  - Need: Support for material binding collections
  - Need: Inherited material bindings
  - Estimated: 2-3 days

- [ ] **Connection Support**
  - Shader input/output connections
  - Follow connection paths
  - Build shader graphs
  - Estimated: 3-4 days

---

## 3. USD Composition [P2]

### 3.1 Layer Composition

- [ ] **Reference Resolution**
  - Parse reference list ops
  - Load referenced layers
  - Compose referenced prims
  - Handle reference offsets
  - Estimated: 5-7 days

- [ ] **Payload Loading**
  - Parse payload list ops
  - Lazy loading of payloads
  - Unload/reload support
  - Estimated: 3-4 days

- [ ] **Inherit & Specialize**
  - Parse inherit arcs
  - Parse specialize arcs
  - Apply opinions from inherited/specialized prims
  - Estimated: 4-5 days

- [ ] **Variant Sets & Variants**
  - Parse variant definitions
  - Parse variant selections
  - Switch between variants
  - Runtime variant selection API
  - Estimated: 5-6 days

- [ ] **Opinion Strength Ordering**
  - Implement LIVRPS (Local, Inherits, Variants, References, Payloads, Specializes)
  - Resolve value conflicts
  - Handle layer offsets
  - Estimated: 7-10 days
  - Note: This is complex!

### 3.2 Value Resolution [P2]

- [ ] **Property Value Resolution**
  - Compose values across composition arcs
  - Handle value blocking
  - Apply list ops (prepend, append, delete)
  - Time offset application
  - Estimated: 5-7 days

- [ ] **Attribute Connections**
  - Follow attribute connections through composition
  - Handle connection opinions
  - Estimated: 2-3 days

---

## 4. USD Schema Support

### 4.1 UsdGeom Enhancements [P1]

#### Mesh Improvements
- [ ] **Primvar Interpolation**
  - Properly handle interpolation modes:
    - [ ] constant (1 value for mesh)
    - [ ] uniform (1 value per face)
    - [ ] varying (1 value per vertex, linear interp)
    - [ ] vertex (1 value per vertex, subdiv interp)
    - [ ] faceVarying (1 value per face-vertex)
  - Estimated: 3-4 days

- [ ] **Subdivision Surfaces** [P2]
  - Evaluate Catmull-Clark subdivision
  - Option to use subdivision approximation
  - Or integrate OpenSubdiv.js (if available)
  - Estimated: 7-10 days (complex!)

- [ ] **Additional Primvars**
  - Display color
  - Display opacity
  - Texture coordinate sets (multiple UVs)
  - Vertex colors
  - Custom primvars
  - Estimated: 2-3 days

- [ ] **Mesh Features**
  - [ ] doubleSided attribute
  - [ ] purpose (render, proxy, guide)
  - [ ] visibility attribute
  - [ ] Extent (bounding box)
  - Estimated: 1-2 days

#### Other Geometry Types [P1]
- [ ] **BasisCurves** (hair, fur)
  - Parse curve data
  - Convert to Three.js Line or custom curve geometry
  - Handle widths and normals
  - Estimated: 3-4 days

- [ ] **Points** (point clouds)
  - Parse point positions
  - Parse point widths
  - Convert to Three.js Points
  - Estimated: 1-2 days

- [ ] **NurbsCurves** [P2]
  - Parse NURBS curve data
  - Evaluate or convert to polyline
  - Estimated: 3-4 days

- [ ] **Capsule, Cone, Cube, Cylinder, Sphere** [P1]
  - Parse parametric geometry parameters
  - Generate Three.js geometry
  - Estimated: 2-3 days

- [ ] **GeomSubset** [P2]
  - Material assignment per face group
  - Parse indices for subsets
  - Create multi-material meshes
  - Estimated: 2-3 days

#### Camera Support [P1]
- [ ] **UsdGeomCamera**
  - Parse camera parameters:
    - focalLength
    - horizontalAperture
    - verticalAperture
    - clippingRange
    - projection (perspective/orthographic)
  - Convert to Three.js Camera
  - Estimated: 2-3 days

#### Transform Enhancements [P1]
- [ ] **Complete Xform Op Support**
  - Handle all xformOp types:
    - [ ] transform (matrix)
    - [ ] translate
    - [ ] scale
    - [ ] rotateX, rotateY, rotateZ
    - [ ] rotateXYZ, rotateXZY, rotateYXZ, rotateYZX, rotateZXY, rotateZYX
    - [ ] orient (quaternion)
  - Parse xformOpOrder
  - Compose transform stack correctly
  - Handle resetXformStack
  - Estimated: 3-4 days

- [ ] **Instancing** [P2]
  - Parse instanceable flag
  - Detect instanced prims
  - Use Three.js InstancedMesh
  - Handle instance proxies
  - Estimated: 4-5 days

### 4.2 UsdShade Improvements [P1]

- [ ] **Shader Graph Support**
  - Parse UsdShadeNodeGraph
  - Parse UsdShadeShader nodes
  - Build node graph from connections
  - Map to Three.js material properties
  - Estimated: 5-7 days

- [ ] **UsdPreviewSurface Complete**
  - Currently: Basic properties
  - Add missing inputs:
    - [ ] specularColor
    - [ ] useSpecularWorkflow
    - [ ] clearcoat
    - [ ] clearcoatRoughness
    - [ ] displacement
    - [ ] occlusion
    - [ ] ior
  - Estimated: 2-3 days

- [ ] **Texture Loading** [P0]
  - Load texture files from asset paths
  - Support formats: PNG, JPG, EXR, etc.
  - Handle texture transforms (scale, offset, rotation)
  - sRGB vs linear color space handling
  - Estimated: 3-4 days

- [ ] **Normal Maps**
  - Load normal textures
  - Handle tangent space computation
  - Support scale parameter
  - Estimated: 1-2 days

- [ ] **Additional Shader Types** [P2]
  - UsdUVTexture (2D texture sampling)
  - UsdPrimvarReader (read primvar values)
  - UsdTransform2d (texture transforms)
  - Custom shader nodes
  - Estimated: 4-5 days

- [ ] **Material Variants** [P2]
  - Support material variant sets
  - Switch materials at runtime
  - Estimated: 2-3 days

### 4.3 UsdLux Enhancements [P1]

- [ ] **Light Features**
  - Currently: Basic parameters
  - Add missing parameters:
    - [ ] diffuse/specular multipliers
    - [ ] normalize (for area lights)
    - [ ] enableColorTemperature
    - [ ] texture support (dome lights)
    - [ ] shaping API (cone angle, softness)
    - [ ] shadow API (shadow enable, color, distance)
  - Estimated: 2-3 days

- [ ] **Light Filters** [P2]
  - Parse light filter prims
  - Apply filters to lights
  - (Limited Three.js support)
  - Estimated: 3-4 days

- [ ] **Light Linking** [P2]
  - Parse light link collections
  - Implement selective lighting
  - (Requires custom Three.js shader)
  - Estimated: 4-5 days

- [ ] **Portal Lights** [P2]
  - Parse UsdLuxPortalLight
  - Convert to appropriate Three.js equivalent
  - Estimated: 1-2 days

### 4.4 UsdSkel (Skeletal Animation) [P2]

- [ ] **Skeleton Parsing**
  - Parse UsdSkelSkeleton
  - Parse joint hierarchy
  - Parse bind transforms
  - Parse rest transforms
  - Estimated: 3-4 days

- [ ] **Skinning**
  - Parse joint weights
  - Parse joint indices
  - Convert to Three.js SkinnedMesh
  - Estimated: 3-4 days

- [ ] **Animation**
  - Parse skeletal animation clips
  - Convert to Three.js AnimationClip
  - Estimated: 2-3 days

### 4.5 UsdVol (Volumes) [P3]

- [ ] **Volume Support**
  - Parse OpenVDB volumes
  - Convert to Three.js volume rendering
  - (Requires custom shaders or library)
  - Estimated: 7-10+ days

### 4.6 UsdUI & UsdRender [P3]

- [ ] **Scene Metadata**
  - Parse render settings
  - Parse camera settings
  - Parse UI hints
  - Estimated: 2-3 days

---

## 5. Three.js Integration Enhancements

### 5.1 Geometry Conversion [P1]

- [ ] **Improved Triangulation**
  - Current: Simple fan triangulation
  - Add: Ear-clipping for concave polygons
  - Add: Triangulation validation
  - Estimated: 2-3 days

- [ ] **Indexed Geometry Optimization** [P2]
  - Current: Expanded vertices
  - Generate proper index buffers
  - Reduce memory usage
  - Estimated: 2-3 days

- [ ] **Vertex Attribute Packing** [P2]
  - Interleave vertex attributes
  - Optimize for GPU cache
  - Estimated: 1-2 days

- [ ] **Normal Generation**
  - Improve normal computation
  - Handle smooth groups
  - Support face vs vertex normals
  - Estimated: 1-2 days

- [ ] **Tangent Generation** [P1]
  - Generate tangents for normal mapping
  - Use MikkTSpace algorithm
  - Estimated: 2-3 days

### 5.2 Material Conversion [P1]

- [ ] **Texture Coordinate Handling**
  - Support multiple UV sets
  - Handle UV transforms
  - Estimated: 1-2 days

- [ ] **Advanced Material Properties**
  - Clearcoat
  - Transmission/transparency
  - Anisotropy
  - Sheen
  - IOR
  - Estimated: 2-3 days

- [ ] **Material Extensions** [P2]
  - Support for Three.js material extensions
  - Custom shader injection points
  - Estimated: 2-3 days

### 5.3 Scene Graph [P1]

- [ ] **Proper Hierarchy**
  - Current: Basic parent-child from paths
  - Need: Handle USD's namespace better
  - Need: Support for pseudo-root
  - Estimated: 1-2 days

- [ ] **Visibility Inheritance**
  - Parse visibility attribute
  - Handle inherited visibility
  - Show/hide subtrees
  - Estimated: 1 day

- [ ] **Purpose-based Filtering**
  - Filter by purpose (render, proxy, guide)
  - Runtime switching
  - Estimated: 1 day

- [ ] **Collections** [P2]
  - Parse UsdCollectionAPI
  - Query collection members
  - Use for visibility, light linking, etc.
  - Estimated: 3-4 days

### 5.4 Animation [P1]

- [ ] **AnimationClip Generation**
  - Convert USD animation to Three.js
  - Handle transform animations
  - Handle morph target animations
  - Handle material parameter animations
  - Estimated: 4-5 days

- [ ] **AnimationMixer Integration**
  - Set up animation mixer
  - Handle multiple clips
  - Provide playback controls
  - Estimated: 2 days

### 5.5 Cameras [P1]

- [ ] **Camera Conversion**
  - Convert UsdGeomCamera to Three.js
  - Handle FOV calculation
  - Handle aspect ratio
  - Estimated: 1-2 days

### 5.6 Lights [P1]

- [ ] **Shadow Support**
  - Enable shadows on lights
  - Configure shadow parameters
  - Estimated: 1 day

- [ ] **IES Profiles** [P2]
  - Load IES light profiles
  - Apply to lights (custom shader needed)
  - Estimated: 3-4 days

---

## 6. Texture & Asset Loading

### 6.1 Texture Loading [P0]

- [ ] **Basic Texture Loading**
  - Load PNG, JPG textures
  - Handle asset paths (relative, absolute)
  - Resolve paths in USDZ archives
  - Estimated: 2-3 days

- [ ] **Advanced Formats** [P2]
  - [ ] EXR (HDR)
  - [ ] HDR
  - [ ] TGA
  - [ ] TIFF
  - Use appropriate loaders
  - Estimated: 2-3 days

- [ ] **Texture Transforms**
  - Apply scale, offset, rotation
  - Handle wrap modes (repeat, clamp, mirror)
  - Estimated: 1 day

- [ ] **Color Space**
  - Detect sRGB vs linear
  - Apply correct color space to textures
  - Estimated: 1 day

- [ ] **Mipmaps & Filtering**
  - Generate mipmaps if needed
  - Set appropriate filtering modes
  - Estimated: 1 day

### 6.2 Asset Management [P1]

- [ ] **Asset Resolver**
  - Resolve asset paths
  - Handle search paths
  - Support for custom resolvers
  - Estimated: 2-3 days

- [ ] **Asset Caching**
  - Cache loaded textures
  - Cache loaded references
  - Avoid duplicate loads
  - Estimated: 1-2 days

- [ ] **Loading Manager Integration**
  - Proper Three.js LoadingManager usage
  - Track loading progress
  - Handle errors
  - Estimated: 1 day

---

## 7. Performance & Optimization

### 7.1 Parsing Performance [P2]

- [ ] **Streaming Parser**
  - Don't load entire file into memory
  - Stream sections as needed
  - Estimated: 5-7 days

- [ ] **Lazy Loading**
  - Load specs on-demand
  - Load values on-demand
  - Defer heavy operations
  - Estimated: 3-4 days

- [ ] **Web Workers**
  - Parse in worker thread
  - Don't block main thread
  - Transfer geometry data efficiently
  - Estimated: 3-4 days

- [ ] **Caching Strategy**
  - Cache parsed data
  - Cache computed values
  - Cache resolved paths
  - Estimated: 2-3 days

### 7.2 Memory Optimization [P2]

- [ ] **Zero-Copy Arrays**
  - Use TypedArrays directly from file buffer
  - Avoid copying large arrays
  - Similar to OpenUSD's implementation
  - Estimated: 3-4 days

- [ ] **Shared Geometry**
  - Detect identical geometries
  - Share BufferGeometry instances
  - Use instancing where possible
  - Estimated: 2-3 days

- [ ] **Shared Materials**
  - Detect identical materials
  - Share material instances
  - Estimated: 1 day

- [ ] **Memory Pooling**
  - Reuse temporary buffers
  - Reduce allocation churn
  - Estimated: 2-3 days

### 7.3 Rendering Performance [P2]

- [ ] **LOD Support**
  - Parse USD LOD variants
  - Create Three.js LOD objects
  - Estimated: 2-3 days

- [ ] **Frustum Culling Hints**
  - Use USD extents for bounding boxes
  - Set bounding spheres accurately
  - Estimated: 1 day

- [ ] **Geometry Instancing**
  - Automatic instancing detection
  - Convert to InstancedMesh
  - Estimated: 2-3 days

---

## 8. Error Handling & Validation

### 8.1 Robust Error Handling [P1]

- [ ] **File Validation**
  - Validate file header
  - Validate version compatibility
  - Validate section integrity
  - Estimated: 2-3 days

- [ ] **Graceful Degradation**
  - Handle missing data gracefully
  - Provide sensible defaults
  - Continue parsing on non-fatal errors
  - Estimated: 2-3 days

- [ ] **Error Reporting**
  - Detailed error messages
  - Warning system for non-critical issues
  - Error callbacks
  - Estimated: 1-2 days

- [ ] **Validation Mode** [P2]
  - Optional strict validation
  - Report all schema violations
  - Performance profiling
  - Estimated: 2-3 days

### 8.2 Edge Cases [P2]

- [ ] **Empty Files**
  - Handle files with no geometry
  - Handle empty prims
  - Estimated: 1 day

- [ ] **Large Files**
  - Handle files > 2GB
  - Handle thousands of prims
  - Performance testing
  - Estimated: 2-3 days

- [ ] **Malformed Files**
  - Handle truncated files
  - Handle corrupted data
  - Don't crash on bad input
  - Estimated: 2-3 days

---

## 9. Testing & Quality Assurance

### 9.1 Test Suite [P1]

- [ ] **Unit Tests**
  - Test binary reading utilities
  - Test value unpacking
  - Test type conversions
  - Test path resolution
  - Estimated: 5-7 days

- [ ] **Integration Tests**
  - Test full file parsing
  - Test Three.js conversion
  - Test various USD features
  - Estimated: 5-7 days

- [ ] **Test Assets**
  - Create test USD files covering all features
  - Include edge cases
  - Include malformed files
  - Estimated: 3-4 days

- [ ] **Regression Tests**
  - Set up automated testing
  - Test against reference outputs
  - Visual regression tests
  - Estimated: 3-4 days

### 9.2 Validation [P1]

- [ ] **Comparison with USD**
  - Compare outputs with official USD tools
  - Validate geometry correctness
  - Validate material correctness
  - Estimated: Ongoing

- [ ] **Visual Testing**
  - Side-by-side comparison with usdview
  - Screenshot comparison
  - Estimated: 2-3 days

### 9.3 Performance Testing [P2]

- [ ] **Benchmarks**
  - Parsing speed benchmarks
  - Memory usage benchmarks
  - Rendering performance benchmarks
  - Estimated: 2-3 days

- [ ] **Profiling**
  - Identify bottlenecks
  - Optimize hot paths
  - Estimated: Ongoing

---

## 10. Documentation & Examples

### 10.1 Documentation [P1]

- [ ] **API Documentation**
  - JSDoc for all public methods
  - Type definitions (TypeScript .d.ts)
  - Estimated: 3-4 days

- [ ] **Format Documentation**
  - Detailed USDC format spec
  - Reverse-engineered details
  - Estimated: 3-4 days

- [ ] **Tutorial**
  - Step-by-step guide
  - Common patterns
  - Troubleshooting guide
  - Estimated: 2-3 days

### 10.2 Examples [P1]

- [ ] **Basic Example** - ✅ Done
- [ ] **Animation Example**
  - Show animated model
  - Playback controls
  - Estimated: 1 day

- [ ] **Material Example**
  - Show different materials
  - PBR parameters
  - Texture mapping
  - Estimated: 1 day

- [ ] **Variant Example**
  - Show variant switching
  - UI controls
  - Estimated: 1 day

- [ ] **Complex Scene Example**
  - Large scene with hierarchy
  - Multiple assets
  - LOD, instancing
  - Estimated: 2 days

- [ ] **USDZ Example**
  - Load USDZ archive
  - Show contained assets
  - Estimated: 1 day

### 10.3 Tools [P2]

- [ ] **USD Inspector**
  - Web-based USD file inspector
  - Show hierarchy
  - Show properties
  - Estimated: 3-4 days

- [ ] **Conversion Tool**
  - Convert USD to GLTF
  - Batch conversion
  - Estimated: 3-4 days

- [ ] **Validation Tool**
  - Validate USD files
  - Report errors
  - Estimated: 2-3 days

---

## 11. TypeScript Support [P2]

- [ ] **Type Definitions**
  - Create .d.ts files
  - Full type coverage
  - Estimated: 3-4 days

- [ ] **TypeScript Rewrite** [P3]
  - Rewrite in TypeScript
  - Better type safety
  - Better IDE support
  - Estimated: 10-15 days

---

## 12. Build & Packaging [P2]

### 12.1 Build System

- [ ] **Bundling**
  - Rollup or Webpack config
  - Create UMD bundle
  - Create ES6 module bundle
  - Minified versions
  - Estimated: 2-3 days

- [ ] **Source Maps**
  - Generate source maps
  - Debug support
  - Estimated: 1 day

### 12.2 NPM Package [P2]

- [ ] **NPM Publishing**
  - Prepare package for npm
  - Set up CI/CD
  - Automated releases
  - Estimated: 2-3 days

- [ ] **CDN Distribution**
  - Host on CDN (jsdelivr, unpkg)
  - Versioned URLs
  - Estimated: 1 day

---

## 13. Advanced Features [P3]

### 13.1 Material X Support

- [ ] **MaterialX Integration**
  - Parse MaterialX networks
  - Convert to Three.js
  - Estimated: 10-15 days

### 13.2 Hydra Integration

- [ ] **Scene Index**
  - Implement basic scene index
  - For advanced USD features
  - Estimated: 20+ days (very complex)

### 13.3 Custom Schemas

- [ ] **Schema Extension**
  - Support custom schema types
  - Plugin system
  - Estimated: 5-7 days

---

## Estimated Total Time

### By Priority:
- **P0 (Critical):** ~40-60 days
- **P1 (Important):** ~120-160 days
- **P2 (Nice to have):** ~80-120 days
- **P3 (Advanced):** ~50-80 days

### **Total: 290-420 days** (roughly 14-20 months of full-time work)

### Minimal Viable Product (MVP):
Focus on P0 + essential P1 features: **~100-130 days** (4-6 months)

---

## Recommended Implementation Order

### Phase 1: Core Stability (P0)
1. Compressed paths
2. Integer compression
3. Complete value types
4. Material bindings
5. Texture loading

### Phase 2: Essential Features (P1)
1. Animation support
2. Complete geometry types
3. Shader graphs
4. USDZ archives
5. Proper error handling

### Phase 3: Production Ready (P1 + P2)
1. Composition arcs
2. Performance optimization
3. Comprehensive testing
4. Complete documentation

### Phase 4: Advanced (P2 + P3)
1. Skeletal animation
2. Volumes
3. MaterialX
4. Advanced optimization

---

## Notes

- Many P2/P3 features are "nice to have" but not critical
- Some features may have limited Three.js support (e.g., light filters)
- Some features are extremely complex (e.g., composition, subdivision surfaces)
- Consider community contributions for advanced features
- Prioritize based on actual use cases and user needs

This is a comprehensive roadmap. Focus on P0/P1 for a production-quality parser!
