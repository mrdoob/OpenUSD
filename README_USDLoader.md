# USDLoader for Three.js

A JavaScript-only loader for Universal Scene Description (USD) files in Three.js. This loader enables loading USD scenes with geometries, materials, textures, lights, and hierarchical transforms directly in the browser or Node.js environments.

## Features

### Core Support

- **File Format**: USDA (ASCII) format
- **Scene Graph**: Hierarchical transforms with Xform and Scope prims
- **Geometries**:
  - Mesh (with triangulation for quads and n-gons)
  - Parametric shapes: Sphere, Cube, Cylinder, Cone, Plane
  - Points (point clouds)
- **Materials**: UsdPreviewSurface with PBR workflow
  - Diffuse color (albedo/base color)
  - Metallic/Roughness workflow
  - Emissive color
  - Opacity and transparency
  - Normal maps
  - Ambient occlusion maps
- **Textures**:
  - UsdUVTexture support
  - Wrap modes (repeat, clamp, mirror)
  - UV transforms (scale, bias)
- **Lights**:
  - DistantLight (Directional)
  - SphereLight (Point)
  - RectLight (Area)
  - DiskLight (Area)
  - DomeLight (Hemisphere/Environment)
  - Color, intensity, and exposure control
- **Transforms**:
  - Translation (xformOp:translate)
  - Rotation (xformOp:rotateXYZ)
  - Scale (xformOp:scale)

### Feature Parity with GLTFLoader

This loader targets similar feature scope to Three.js's GLTFLoader:

| Feature | USDLoader | GLTFLoader | Notes |
|---------|-----------|------------|-------|
| Geometries | ✅ | ✅ | Mesh, primitives |
| Materials (PBR) | ✅ | ✅ | UsdPreviewSurface ↔ glTF PBR |
| Textures | ✅ | ✅ | Base color, normal, metallic-roughness, AO |
| Scene hierarchy | ✅ | ✅ | Transform nodes |
| Lights | ✅ | ✅ | Multiple light types |
| Animations | ⏳ | ✅ | Planned |
| Skinning | ❌ | ✅ | Not in scope |
| Morph targets | ❌ | ✅ | Not in scope |

## Installation

### Browser (ES Module)

```html
<script type="importmap">
{
    "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js"
    }
}
</script>

<script type="module">
import { USDLoader } from './USDLoader.js';

const loader = new USDLoader();
loader.load('scene.usda', (usdScene) => {
    scene.add(usdScene.scene);
});
</script>
```

### Node.js

```javascript
import { USDLoader } from './USDLoader.js';
import * as THREE from 'three';

const loader = new USDLoader();
// Use with file system or HTTP requests
```

## Usage

### Basic Example

```javascript
import * as THREE from 'three';
import { USDLoader } from './USDLoader.js';

// Create scene, camera, renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();

// Load USD file
const loader = new USDLoader();

loader.load(
    'path/to/scene.usda',
    function (usdScene) {
        // Success callback
        scene.add(usdScene.scene);

        console.log('Materials:', usdScene.materials);
        console.log('Textures:', usdScene.textures);
        console.log('Metadata:', usdScene.metadata);
    },
    function (xhr) {
        // Progress callback
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    function (error) {
        // Error callback
        console.error('Error loading USD:', error);
    }
);
```

### Returned Object Structure

The loader returns an object with the following structure:

```javascript
{
    scene: THREE.Group,      // The root scene object
    materials: {},           // Dictionary of materials by path
    textures: {},           // Dictionary of textures by URL
    metadata: {},           // Stage metadata (upAxis, metersPerUnit, etc.)
    animations: []          // Animation clips (future)
}
```

### Advanced Usage

```javascript
const manager = new THREE.LoadingManager();

manager.onProgress = function (url, itemsLoaded, itemsTotal) {
    console.log(`Loading: ${itemsLoaded}/${itemsTotal}`);
};

const loader = new USDLoader(manager);

// Set base path for relative URLs
loader.setPath('https://example.com/assets/');

// Set request headers
loader.setRequestHeader({ 'Authorization': 'Bearer token' });

// Load and process
loader.load('scene.usda', (usdScene) => {
    // Enable shadows
    usdScene.scene.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Access specific materials
    const material = usdScene.materials['/Scene/Materials/MyMaterial'];
    if (material) {
        material.roughness = 0.5;
    }

    scene.add(usdScene.scene);
});
```

## USD File Format

### Supported Prim Types

#### Geometry Prims

**Mesh**
```usda
def Mesh "MyMesh"
{
    point3f[] points = [(0,0,0), (1,0,0), (0,1,0)]
    int[] faceVertexIndices = [0, 1, 2]
    int[] faceVertexCounts = [3]
    normal3f[] normals = [(0,0,1), (0,0,1), (0,0,1)]
    texCoord2f[] primvars:st = [(0,0), (1,0), (0.5,1)]
    color3f[] primvars:displayColor = [(1,0,0)]
}
```

**Parametric Shapes**
```usda
def Sphere "MySphere"
{
    double radius = 1.0
}

def Cube "MyCube"
{
    double size = 2.0
}

def Cylinder "MyCylinder"
{
    double radius = 0.5
    double height = 2.0
}

def Cone "MyCone"
{
    double radius = 1.0
    double height = 2.0
}

def Plane "MyPlane"
{
    double width = 2.0
    double length = 2.0
}
```

**Points**
```usda
def Points "PointCloud"
{
    point3f[] points = [(0,0,0), (1,1,1), (2,2,2)]
    color3f[] primvars:displayColor = [(1,0,0), (0,1,0), (0,0,1)]
}
```

#### Transform Prims

```usda
def Xform "MyTransform"
{
    double3 xformOp:translate = (1, 2, 3)
    double3 xformOp:rotateXYZ = (0, 45, 0)
    double3 xformOp:scale = (1, 1, 1)
    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]
}
```

#### Material and Shader Prims

```usda
def Material "MyMaterial"
{
    token outputs:surface.connect = </MyMaterial/PreviewSurface.outputs:surface>

    def Shader "PreviewSurface"
    {
        uniform token info:id = "UsdPreviewSurface"
        color3f inputs:diffuseColor = (0.8, 0.1, 0.1)
        float inputs:metallic = 0.5
        float inputs:roughness = 0.4
        color3f inputs:emissiveColor = (0, 0, 0)
        float inputs:opacity = 1.0
        token outputs:surface
    }

    def Shader "DiffuseTexture"
    {
        uniform token info:id = "UsdUVTexture"
        asset inputs:file = @textures/diffuse.png@
        token inputs:wrapS = "repeat"
        token inputs:wrapT = "repeat"
        float2 inputs:scale = (1, 1)
        float2 inputs:bias = (0, 0)
        float3 outputs:rgb
    }
}
```

**Material Binding**
```usda
def Mesh "MyMesh"
{
    rel material:binding = </Path/To/Material>
}
```

#### Light Prims

```usda
def DistantLight "Sun"
{
    color3f inputs:color = (1.0, 0.95, 0.8)
    float inputs:intensity = 1.0
    float inputs:exposure = 0.0
    float angle = 0.53
}

def SphereLight "PointLight"
{
    color3f inputs:color = (1, 1, 1)
    float inputs:intensity = 10.0
    float radius = 0.1
}

def RectLight "AreaLight"
{
    color3f inputs:color = (1, 1, 1)
    float inputs:intensity = 5.0
    float width = 2.0
    float height = 1.0
}

def DiskLight "DiskLight"
{
    color3f inputs:color = (1, 1, 1)
    float inputs:intensity = 5.0
    float radius = 1.0
}

def DomeLight "Environment"
{
    color3f inputs:color = (1, 1, 1)
    float inputs:intensity = 1.0
    asset inputs:texture:file = @environment.hdr@
}
```

### Stage Metadata

```usda
#usda 1.0
(
    defaultPrim = "Scene"
    upAxis = "Y"
    metersPerUnit = 1.0
    timeCodesPerSecond = 24
)
```

## API Reference

### USDLoader

Constructor for the USD loader.

```javascript
new USDLoader(manager?: LoadingManager)
```

**Parameters:**
- `manager` (optional): Three.js LoadingManager instance

**Methods:**

#### load(url, onLoad, onProgress, onError)

Loads a USD file from the specified URL.

```javascript
loader.load(
    url: string,
    onLoad: (usdScene: Object) => void,
    onProgress?: (xhr: ProgressEvent) => void,
    onError?: (error: Error) => void
)
```

#### parse(text, url)

Parses USD text content directly.

```javascript
loader.parse(
    text: string,
    url: string
): Object
```

**Returns:** USD scene object with `scene`, `materials`, `textures`, `metadata`, and `animations`.

#### Inherited Methods

From Three.js `Loader` class:

- `setPath(path: string): this`
- `setResourcePath(path: string): this`
- `setRequestHeader(header: Object): this`
- `setWithCredentials(value: boolean): this`

## Examples

### Simple Scene

```usda
#usda 1.0

def Xform "Scene"
{
    def Sphere "Ball"
    {
        double radius = 1.0
        double3 xformOp:translate = (0, 1, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }

    def DistantLight "Sun"
    {
        color3f inputs:color = (1, 1, 1)
        float inputs:intensity = 1.0
    }
}
```

### PBR Material Example

```usda
#usda 1.0

def Mesh "PBRSphere"
{
    # ... geometry data ...
    rel material:binding = </Materials/MetalMaterial>
}

def Scope "Materials"
{
    def Material "MetalMaterial"
    {
        token outputs:surface.connect = </Materials/MetalMaterial/Surface.outputs:surface>

        def Shader "Surface"
        {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (0.8, 0.8, 0.9)
            float inputs:metallic = 1.0
            float inputs:roughness = 0.2
            token outputs:surface
        }
    }
}
```

### Textured Material Example

```usda
def Material "TexturedMaterial"
{
    token outputs:surface.connect = </TexturedMaterial/Surface.outputs:surface>

    def Shader "Surface"
    {
        uniform token info:id = "UsdPreviewSurface"
        color3f inputs:diffuseColor.connect = </TexturedMaterial/Texture.outputs:rgb>
        float inputs:metallic = 0.0
        float inputs:roughness = 0.8
        token outputs:surface
    }

    def Shader "Texture"
    {
        uniform token info:id = "UsdUVTexture"
        asset inputs:file = @./textures/diffuse.png@
        token inputs:wrapS = "repeat"
        token inputs:wrapT = "repeat"
        float3 outputs:rgb
    }
}
```

## Known Limitations

### Not Yet Implemented

1. **USDC Format**: Binary crate format not supported (only USDA text)
2. **USDZ Format**: Archive format not supported
3. **Animations**: Time samples and skeletal animation
4. **Advanced Geometry**:
   - Subdivision surfaces (with creases and corners)
   - NURBS curves and surfaces
   - Basis curves
5. **Advanced Materials**:
   - Specular workflow (only metallic-roughness)
   - Clearcoat layers
   - Displacement maps
6. **Scene Composition**:
   - Layer composition (sublayers, references, payloads)
   - Variants and variant sets
   - Inherits and specializes
7. **Collections and Relationships**: Complex prim relationships
8. **Custom Schemas**: User-defined schemas

### Current Limitations

1. **Transform Order**: Currently assumes translate-rotate-scale order; `xformOpOrder` not fully implemented
2. **Face Varying Data**: Limited support for face-varying primvars
3. **Texture Sampling**: Advanced texture sampling modes not fully supported
4. **Light Intensity**: Normalization and area-based intensity not perfectly matched to USD spec
5. **Performance**: Large scenes may be slow due to text parsing

## Performance Tips

1. **Use USDA for compatibility**: This loader is optimized for text format
2. **Minimize prim count**: Large hierarchies can slow parsing
3. **Optimize meshes**: Pre-triangulate faces in your USD authoring tool
4. **Compress textures**: Use efficient texture formats (JPG, compressed PNG)
5. **Batch materials**: Reuse materials across multiple prims

## Browser Compatibility

- Modern browsers with ES6 module support
- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 79+

## Future Improvements

### Short Term
- [ ] Better xformOpOrder handling
- [ ] Subdivision surface support (via tessellation)
- [ ] Basis curves as Three.js Line objects
- [ ] Animation/time sample support

### Medium Term
- [ ] USDC binary format support (requires Emscripten USD build)
- [ ] USDZ archive support (ZIP parsing)
- [ ] Layer composition (references, payloads)
- [ ] Variant sets

### Long Term
- [ ] UsdSkel skinning and skeletal animation
- [ ] Point instancers
- [ ] Volume rendering (VDB)
- [ ] Procedural generation support

## Contributing

Contributions are welcome! Areas for improvement:

1. **Parser robustness**: Better handling of edge cases
2. **Performance optimization**: Faster parsing for large files
3. **Feature additions**: Implement missing USD features
4. **Testing**: Add comprehensive test suite
5. **Documentation**: Improve examples and API docs

## License

Apache License 2.0 (matching OpenUSD and Three.js licenses)

## References

- [OpenUSD Documentation](https://openusd.org/release/index.html)
- [USD Glossary](https://openusd.org/release/glossary.html)
- [UsdPreviewSurface Specification](https://openusd.org/release/spec_usdpreviewsurface.html)
- [Three.js Documentation](https://threejs.org/docs/)
- [Three.js GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)

## Related Projects

- [OpenUSD](https://github.com/PixarAnimationStudios/OpenUSD) - Official USD library
- [Three.js](https://github.com/mrdoob/three.js/) - JavaScript 3D library
- [USD for WebAssembly](https://github.com/AndrewRayCode/usd-wasm) - WebAssembly USD bindings

## Acknowledgments

This loader was inspired by:
- Pixar's OpenUSD project
- Three.js loader architecture (especially GLTFLoader)
- The USD and Three.js communities

---

Built with ❤️ for the 3D web community
