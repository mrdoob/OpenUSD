# Three.js Integration Guide

This guide explains how to integrate the USDC parser into your Three.js application.

## Quick Start

### 1. Browser Integration (ES6 Modules)

```html
<!DOCTYPE html>
<html>
<head>
    <title>USD Viewer</title>
</head>
<body>
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
        }
    }
    </script>

    <script type="module">
        import * as THREE from 'three';
        import { USDZLoader } from './src/USDZLoader.js';

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        const loader = new USDZLoader();
        loader.load('model.usdc', (group) => {
            scene.add(group);
        });

        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
        animate();
    </script>
</body>
</html>
```

### 2. Node.js Integration

```javascript
import fs from 'fs';
import { USDCParser } from './src/USDCParser.js';

const buffer = fs.readFileSync('model.usdc');
const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
);

const parser = new USDCParser();
const usdData = parser.parse(arrayBuffer);

console.log('Loaded USD data:', usdData);
```

### 3. React Integration

```jsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { USDZLoader } from './src/USDZLoader.js';

function USDViewer({ modelUrl }) {
    const mountRef = useRef(null);
    const sceneRef = useRef(null);

    useEffect(() => {
        // Setup scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        mountRef.current.appendChild(renderer.domElement);

        // Load USD model
        const loader = new USDZLoader();
        loader.load(modelUrl, (group) => {
            scene.add(group);
        });

        // Animation loop
        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
        animate();

        // Cleanup
        return () => {
            mountRef.current?.removeChild(renderer.domElement);
        };
    }, [modelUrl]);

    return <div ref={mountRef} />;
}

export default USDViewer;
```

## Advanced Usage

### Custom Material Processing

```javascript
import { USDZLoader } from './src/USDZLoader.js';

class CustomUSDZLoader extends USDZLoader {
    createMaterial(materialPrim) {
        const materialData = this.parser.extractMaterial(materialPrim);

        // Custom material creation logic
        const material = new THREE.MeshPhysicalMaterial({
            color: this.colorArrayToColor(materialData.inputs.diffuseColor),
            metalness: materialData.inputs.metallic || 0,
            roughness: materialData.inputs.roughness || 0.5,
            // Add custom properties
            clearcoat: 1.0,
            clearcoatRoughness: 0.1
        });

        return material;
    }
}

const loader = new CustomUSDZLoader();
```

### Texture Loading

```javascript
import { USDZLoader } from './src/USDZLoader.js';
import { TextureLoader } from 'three';

class USDZLoaderWithTextures extends USDZLoader {
    constructor(manager) {
        super(manager);
        this.textureLoader = new TextureLoader(manager);
    }

    createMaterial(materialPrim) {
        const materialData = this.parser.extractMaterial(materialPrim);
        const material = new THREE.MeshStandardMaterial();

        // Load diffuse texture
        if (materialData.inputs['diffuseColor:texture']) {
            const texturePath = materialData.inputs['diffuseColor:texture'];
            this.textureLoader.load(texturePath, (texture) => {
                material.map = texture;
                material.needsUpdate = true;
            });
        }

        // Load normal map
        if (materialData.inputs['normal:texture']) {
            const texturePath = materialData.inputs['normal:texture'];
            this.textureLoader.load(texturePath, (texture) => {
                material.normalMap = texture;
                material.needsUpdate = true;
            });
        }

        return material;
    }
}
```

### Progress Tracking

```javascript
const loader = new USDZLoader();

loader.load(
    'large-model.usdc',
    (group) => {
        console.log('Loaded!');
        scene.add(group);
    },
    (xhr) => {
        const percentComplete = (xhr.loaded / xhr.total) * 100;
        console.log(`${percentComplete.toFixed(2)}% loaded`);

        // Update progress bar
        document.getElementById('progressBar').value = percentComplete;
    },
    (error) => {
        console.error('Loading error:', error);
    }
);
```

### Accessing Raw USD Data

```javascript
import { USDCParser } from './src/USDCParser.js';

const parser = new USDCParser();
const usdData = parser.parse(arrayBuffer);

// Access raw prims
for (const prim of usdData.prims) {
    console.log('Prim path:', prim.path);
    console.log('Type:', prim.typeName);
    console.log('Properties:', prim.properties);

    // Extract specific data
    if (prim.typeName === 'Mesh') {
        const geometry = parser.extractMeshGeometry(prim);
        console.log('Vertex count:', geometry.points.length / 3);
        console.log('Face count:', geometry.faceVertexCounts.length);
    }
}
```

### Handling Different Coordinate Systems

USD uses a right-handed coordinate system with Y-up by default, while some engines use different conventions:

```javascript
class CoordinateSystemUSDZLoader extends USDZLoader {
    applyTransform(object, transform) {
        super.applyTransform(object, transform);

        // Convert from Y-up to Z-up if needed
        if (this.convertToZUp) {
            object.rotation.x = -Math.PI / 2;
        }
    }
}

const loader = new CoordinateSystemUSDZLoader();
loader.convertToZUp = true;
```

### Batch Loading

```javascript
async function loadMultipleModels(urls) {
    const loader = new USDZLoader();
    const promises = urls.map(url => {
        return new Promise((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
        });
    });

    try {
        const models = await Promise.all(promises);
        models.forEach(model => scene.add(model));
        console.log(`Loaded ${models.length} models`);
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

loadMultipleModels([
    'model1.usdc',
    'model2.usdc',
    'model3.usdc'
]);
```

### Memory Management

```javascript
function disposeUSDModel(group) {
    group.traverse((child) => {
        if (child.geometry) {
            child.geometry.dispose();
        }

        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(material => {
                    disposeMaterial(material);
                });
            } else {
                disposeMaterial(child.material);
            }
        }
    });

    // Remove from scene
    if (group.parent) {
        group.parent.remove(group);
    }
}

function disposeMaterial(material) {
    // Dispose textures
    for (const key in material) {
        const value = material[key];
        if (value && value.isTexture) {
            value.dispose();
        }
    }
    material.dispose();
}

// Usage
const model = await loader.loadAsync('model.usdc');
scene.add(model);

// Later, when done with the model
disposeUSDModel(model);
```

## Integration with Existing Three.js Workflows

### With GLTFLoader

```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { USDZLoader } from './src/USDZLoader.js';

function loadModel(url) {
    const extension = url.split('.').pop().toLowerCase();

    if (extension === 'gltf' || extension === 'glb') {
        const gltfLoader = new GLTFLoader();
        return new Promise((resolve) => {
            gltfLoader.load(url, (gltf) => resolve(gltf.scene));
        });
    } else if (extension === 'usdc' || extension === 'usdz') {
        const usdLoader = new USDZLoader();
        return new Promise((resolve) => {
            usdLoader.load(url, resolve);
        });
    }
}

// Use with any format
loadModel('model.usdc').then(model => scene.add(model));
loadModel('model.gltf').then(model => scene.add(model));
```

### With DRACOLoader for Compression

While USD doesn't use Draco compression, you can integrate both loaders:

```javascript
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { USDZLoader } from './src/USDZLoader.js';

// For GLTF with Draco
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');

// For USD
const usdLoader = new USDZLoader();

// Use based on format needs
```

### With Postprocessing

```javascript
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { USDZLoader } from './src/USDZLoader.js';

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const loader = new USDZLoader();
loader.load('model.usdc', (group) => {
    scene.add(group);
    composer.render();
});
```

## Performance Optimization

### Instancing

```javascript
import { InstancedMesh } from 'three';

class OptimizedUSDZLoader extends USDZLoader {
    buildThreeScene(usdData, url) {
        const group = super.buildThreeScene(usdData, url);

        // Find repeated meshes and convert to instances
        const meshMap = new Map();
        group.traverse((child) => {
            if (child.isMesh) {
                const key = this.getMeshSignature(child);
                if (!meshMap.has(key)) {
                    meshMap.set(key, []);
                }
                meshMap.get(key).push(child);
            }
        });

        // Convert to instanced meshes where beneficial
        for (const [key, meshes] of meshMap) {
            if (meshes.length > 5) {
                this.convertToInstanced(meshes);
            }
        }

        return group;
    }

    getMeshSignature(mesh) {
        // Create unique key based on geometry and material
        return `${mesh.geometry.uuid}_${mesh.material.uuid}`;
    }

    convertToInstanced(meshes) {
        // Implementation of instancing conversion
        // ...
    }
}
```

### Level of Detail (LOD)

```javascript
import { LOD } from 'three';

function createLODFromUSD(baseModel) {
    const lod = new LOD();

    // Add different detail levels
    lod.addLevel(baseModel, 0);    // High detail
    lod.addLevel(mediumDetail, 50); // Medium detail
    lod.addLevel(lowDetail, 100);   // Low detail

    return lod;
}
```

## Troubleshooting

### File Not Loading

```javascript
const loader = new USDZLoader();
loader.load(
    'model.usdc',
    (group) => console.log('Success!', group),
    (xhr) => console.log('Progress:', xhr),
    (error) => {
        console.error('Error details:', error);
        console.log('Check:');
        console.log('1. File path is correct');
        console.log('2. File is a valid USDC file');
        console.log('3. CORS headers are set if loading from different origin');
    }
);
```

### Geometry Issues

```javascript
// Check parsed data
const parser = new USDCParser();
const usdData = parser.parse(arrayBuffer);

for (const prim of usdData.prims) {
    if (prim.typeName === 'Mesh') {
        const geo = parser.extractMeshGeometry(prim);
        console.log('Points:', geo.points?.length / 3);
        console.log('Faces:', geo.faceVertexCounts?.length);
        console.log('Indices:', geo.faceVertexIndices?.length);

        if (!geo.points || !geo.faceVertexIndices) {
            console.error('Invalid mesh data for:', prim.path);
        }
    }
}
```

### Material Not Showing

```javascript
// Debug material creation
class DebugUSDZLoader extends USDZLoader {
    createMaterial(materialPrim) {
        const materialData = this.parser.extractMaterial(materialPrim);
        console.log('Material data:', materialData);

        const material = super.createMaterial(materialPrim);
        console.log('Created material:', material);

        return material;
    }
}
```

## Best Practices

1. **Always handle errors** - Use error callbacks for production code
2. **Dispose resources** - Clean up geometries and materials when done
3. **Use loading managers** - Track progress for multiple assets
4. **Test with sample files** - Verify parser works with your USD files
5. **Profile performance** - Use browser dev tools to identify bottlenecks
6. **Cache parsed data** - Avoid re-parsing the same files
7. **Validate USD files** - Use USD tools to ensure files are well-formed

## Additional Resources

- [Three.js Documentation](https://threejs.org/docs/)
- [OpenUSD Documentation](https://openusd.org/docs/)
- [Three.js Examples](https://threejs.org/examples/)
- [USD Schema Documentation](https://openusd.org/release/api/index.html)
