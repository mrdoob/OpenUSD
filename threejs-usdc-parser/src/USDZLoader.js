/**
 * USDZLoader - Three.js loader for USDC/USDZ files
 *
 * This loader integrates the USDCParser with Three.js to load USD assets.
 * Supports:
 * - Geometries (Meshes with subdivision surface metadata)
 * - Materials (PBR materials via UsdPreviewSurface)
 * - Textures (embedded and external)
 * - Scene graph hierarchy (Xform transforms)
 * - Lights (Rect, Disk, Sphere, Distant, Dome lights)
 *
 * Usage:
 *   const loader = new USDZLoader();
 *   loader.load('model.usdz', (group) => {
 *     scene.add(group);
 *   });
 *
 * @author OpenUSD Contributors
 * @license Apache-2.0
 */

import * as THREE from 'three';
import { USDCParser } from './USDCParser.js';
import { USDZArchive, USDTextureManager } from './USDZArchive.js';

class USDZLoader extends THREE.Loader {
    constructor(manager) {
        super(manager);
        this.parser = new USDCParser();
        this.textureLoader = new THREE.TextureLoader(manager);
        this.textureManager = null;
        this.archive = null;
    }

    load(url, onLoad, onProgress, onError) {
        const scope = this;
        const loader = new THREE.FileLoader(this.manager);
        loader.setPath(this.path);
        loader.setResponseType('arraybuffer');
        loader.setRequestHeader(this.requestHeader);
        loader.setWithCredentials(this.withCredentials);

        loader.load(
            url,
            async function (arrayBuffer) {
                try {
                    const result = await scope.parseAsync(arrayBuffer, url);
                    onLoad(result);
                } catch (e) {
                    if (onError) {
                        onError(e);
                    } else {
                        console.error(e);
                    }
                    scope.manager.itemError(url);
                }
            },
            onProgress,
            onError
        );
    }

    /**
     * Async parse (for USDZ with texture loading)
     */
    async parseAsync(arrayBuffer, url) {
        // Check if this is a USDZ (ZIP) file or a plain USDC file
        const signature = new Uint8Array(arrayBuffer, 0, 4);
        const isZip =
            signature[0] === 0x50 &&
            signature[1] === 0x4b &&
            signature[2] === 0x03 &&
            signature[3] === 0x04;

        if (isZip) {
            return await this.parseUSDZ(arrayBuffer, url);
        } else {
            return await this.parseUSDC(arrayBuffer, url);
        }
    }

    /**
     * Synchronous parse (kept for backwards compatibility)
     * Use parseAsync for USDZ with textures
     */
    parse(arrayBuffer, url) {
        // Parse USDC only (sync)
        const usdData = this.parser.parse(arrayBuffer);
        return this.buildThreeScene(usdData, url);
    }

    /**
     * Parse USDC file (async for texture loading)
     */
    async parseUSDC(arrayBuffer, url) {
        // Setup texture manager for external files
        this.textureManager = new USDTextureManager(this.textureLoader);

        // Extract base URL for texture paths
        if (url) {
            const baseURL = url.substring(0, url.lastIndexOf('/'));
            this.textureManager.setBaseURL(baseURL);
        }

        // Parse USDC file
        const usdData = this.parser.parse(arrayBuffer);

        // Build scene (will load textures async)
        return await this.buildThreeSceneAsync(usdData, url);
    }

    /**
     * Parse USDZ archive (async for extraction and texture loading)
     */
    async parseUSDZ(arrayBuffer, url) {
        console.log('Extracting USDZ archive...');

        // Create archive
        this.archive = new USDZArchive();
        await this.archive.extract(arrayBuffer);

        // Setup texture manager with archive
        this.textureManager = new USDTextureManager(this.textureLoader, this.archive);

        // Get root USD file
        const rootFileData = this.archive.getRootFile();

        // Parse root file
        const usdData = this.parser.parse(rootFileData);

        // Build scene with texture loading
        return await this.buildThreeSceneAsync(usdData, this.archive.rootFile);
    }

    buildThreeScene(usdData, url) {
        const group = new THREE.Group();
        group.name = 'USDScene';

        // Build hierarchy
        const primMap = new Map();

        // First pass: create all objects
        for (const prim of usdData.prims) {
            const object = this.createObject(prim, usdData);
            if (object) {
                primMap.set(prim.path, object);
            }
        }

        // Second pass: build hierarchy based on paths
        for (const [path, object] of primMap) {
            const parentPath = this.getParentPath(path);
            if (parentPath && primMap.has(parentPath)) {
                primMap.get(parentPath).add(object);
            } else {
                group.add(object);
            }
        }

        return group;
    }

    /**
     * Build Three.js scene with async texture loading
     */
    async buildThreeSceneAsync(usdData, url) {
        const group = new THREE.Group();
        group.name = 'USDScene';

        // Build hierarchy
        const primMap = new Map();
        const meshesNeedingTextures = [];

        // First pass: create all objects
        for (const prim of usdData.prims) {
            const object = this.createObject(prim, usdData);
            if (object) {
                primMap.set(prim.path, object);

                // Track meshes that may need textures
                if (object instanceof THREE.Mesh) {
                    meshesNeedingTextures.push({ mesh: object, prim });
                }
            }
        }

        // Second pass: build hierarchy based on paths
        for (const [path, object] of primMap) {
            const parentPath = this.getParentPath(path);
            if (parentPath && primMap.has(parentPath)) {
                primMap.get(parentPath).add(object);
            } else {
                group.add(object);
            }
        }

        // Third pass: load textures async
        if (this.textureManager) {
            await this.loadTexturesForMeshes(meshesNeedingTextures, usdData, url);
        }

        return group;
    }

    /**
     * Load textures for all meshes
     */
    async loadTexturesForMeshes(meshesNeedingTextures, usdData, contextPath) {
        const texturePromises = [];

        for (const { mesh, prim } of meshesNeedingTextures) {
            // Find material binding (try relationship first, then property for backwards compatibility)
            let materialPath = null;

            // Check relationships first (correct USD way)
            if (prim.relationships && prim.relationships['material:binding']) {
                const targets = prim.relationships['material:binding'];
                materialPath = Array.isArray(targets) ? targets[0] : targets;
            }

            // Fall back to property (legacy)
            if (!materialPath && prim.properties['material:binding']) {
                materialPath = prim.properties['material:binding'];
            }

            if (!materialPath) continue;

            // Find material prim
            const materialPrim = usdData.prims.find(p => p.path === materialPath);
            if (!materialPrim) continue;

            // Load textures for this material
            const promise = this.loadTexturesForMaterial(mesh.material, materialPrim, contextPath);
            texturePromises.push(promise);
        }

        await Promise.all(texturePromises);
    }

    createObject(prim, usdData) {
        const typeName = prim.typeName || '';

        if (typeName === 'Mesh' || typeName === 'UsdGeomMesh') {
            return this.createMesh(prim, usdData);
        } else if (typeName === 'Xform' || typeName.includes('Xform')) {
            return this.createXform(prim);
        } else if (typeName.includes('Light')) {
            return this.createLight(prim);
        } else if (typeName === 'Scope') {
            // Scope is just a grouping node
            const group = new THREE.Group();
            group.name = this.getNameFromPath(prim.path);
            return group;
        }

        // Default: create empty group
        const group = new THREE.Group();
        group.name = this.getNameFromPath(prim.path);
        return group;
    }

    createMesh(prim, usdData) {
        const geometry = this.parser.extractMeshGeometry(prim);
        const threeGeometry = this.convertGeometry(geometry);

        if (!threeGeometry) {
            console.warn('Failed to create geometry for', prim.path);
            return null;
        }

        // Create material
        const material = this.findAndCreateMaterial(prim, usdData);

        const mesh = new THREE.Mesh(threeGeometry, material);
        mesh.name = this.getNameFromPath(prim.path);

        // Apply transform if present
        const transform = this.parser.extractTransform(prim);
        this.applyTransform(mesh, transform);

        return mesh;
    }

    createXform(prim) {
        const group = new THREE.Group();
        group.name = this.getNameFromPath(prim.path);

        // Apply transform
        const transform = this.parser.extractTransform(prim);
        this.applyTransform(group, transform);

        return group;
    }

    createLight(prim) {
        const lightData = this.parser.extractLight(prim);
        const typeName = prim.typeName || '';

        let light;

        if (typeName.includes('RectLight')) {
            light = new THREE.RectAreaLight(
                this.colorArrayToHex(lightData.color),
                lightData.intensity * Math.pow(2, lightData.exposure),
                lightData.width,
                lightData.height
            );
        } else if (typeName.includes('DiskLight')) {
            // Approximate disk light as point light
            light = new THREE.PointLight(
                this.colorArrayToHex(lightData.color),
                lightData.intensity * Math.pow(2, lightData.exposure),
                0, // distance
                2 // decay
            );
        } else if (typeName.includes('SphereLight')) {
            light = new THREE.PointLight(
                this.colorArrayToHex(lightData.color),
                lightData.intensity * Math.pow(2, lightData.exposure),
                0,
                2
            );
        } else if (typeName.includes('DistantLight')) {
            light = new THREE.DirectionalLight(
                this.colorArrayToHex(lightData.color),
                lightData.intensity * Math.pow(2, lightData.exposure)
            );
            // Distant lights are infinitely far away
            light.position.set(0, 0, 1);
        } else if (typeName.includes('DomeLight')) {
            // Dome light is like an environment map / hemisphere light
            light = new THREE.HemisphereLight(
                this.colorArrayToHex(lightData.color),
                0x444444,
                lightData.intensity * Math.pow(2, lightData.exposure)
            );
        } else {
            // Default to point light
            light = new THREE.PointLight(
                this.colorArrayToHex(lightData.color),
                lightData.intensity * Math.pow(2, lightData.exposure)
            );
        }

        light.name = this.getNameFromPath(prim.path);

        // Apply transform
        const transform = this.parser.extractTransform(prim);
        this.applyTransform(light, transform);

        return light;
    }

    convertGeometry(geometry) {
        if (!geometry.points || !geometry.faceVertexIndices || !geometry.faceVertexCounts) {
            return null;
        }

        const threeGeometry = new THREE.BufferGeometry();

        // Convert USD mesh to Three.js BufferGeometry
        // USD uses face-vertex indices, we need to expand to triangles

        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        let faceVertexOffset = 0;

        for (let faceIdx = 0; faceIdx < geometry.faceVertexCounts.length; faceIdx++) {
            const faceVertexCount = geometry.faceVertexCounts[faceIdx];

            // Get face vertices
            const faceIndices = [];
            for (let i = 0; i < faceVertexCount; i++) {
                faceIndices.push(geometry.faceVertexIndices[faceVertexOffset + i]);
            }

            // Triangulate face (simple fan triangulation)
            for (let i = 1; i < faceVertexCount - 1; i++) {
                const idx0 = faceIndices[0];
                const idx1 = faceIndices[i];
                const idx2 = faceIndices[i + 1];

                // Add triangle vertices
                this.addVertex(positions, geometry.points, idx0);
                this.addVertex(positions, geometry.points, idx1);
                this.addVertex(positions, geometry.points, idx2);

                // Add normals if available
                if (geometry.normals) {
                    this.addVertex(normals, geometry.normals, idx0);
                    this.addVertex(normals, geometry.normals, idx1);
                    this.addVertex(normals, geometry.normals, idx2);
                }

                // Add UVs if available
                if (geometry.uvs) {
                    const uvIdx0 = faceVertexOffset;
                    const uvIdx1 = faceVertexOffset + i;
                    const uvIdx2 = faceVertexOffset + i + 1;
                    this.addUV(uvs, geometry.uvs, uvIdx0);
                    this.addUV(uvs, geometry.uvs, uvIdx1);
                    this.addUV(uvs, geometry.uvs, uvIdx2);
                }
            }

            faceVertexOffset += faceVertexCount;
        }

        threeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        if (normals.length > 0) {
            threeGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        } else {
            threeGeometry.computeVertexNormals();
        }

        if (uvs.length > 0) {
            threeGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        }

        threeGeometry.computeBoundingSphere();

        return threeGeometry;
    }

    addVertex(array, source, index) {
        const offset = index * 3;
        array.push(source[offset], source[offset + 1], source[offset + 2]);
    }

    addUV(array, source, index) {
        const offset = index * 2;
        array.push(source[offset], source[offset + 1]);
    }

    findAndCreateMaterial(prim, usdData) {
        // Look for material binding (try relationship first, then property)
        let materialPath = null;

        // Check relationships first (correct USD way)
        if (prim.relationships && prim.relationships['material:binding']) {
            const targets = prim.relationships['material:binding'];
            materialPath = Array.isArray(targets) ? targets[0] : targets;
        }

        // Fall back to property (legacy)
        if (!materialPath && prim.properties['material:binding']) {
            materialPath = prim.properties['material:binding'];
        }

        if (materialPath) {
            // Find material prim
            const materialPrim = usdData.prims.find(p => p.path === materialPath);
            if (materialPrim) {
                return this.createMaterial(materialPrim);
            }
        }

        // Default material
        return new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.0,
            roughness: 0.5
        });
    }

    createMaterial(materialPrim) {
        const materialData = this.parser.extractMaterial(materialPrim);

        // Create PBR material from USD preview surface
        const material = new THREE.MeshStandardMaterial();
        material.name = this.getNameFromPath(materialPrim.path);

        // Map USD inputs to Three.js material
        if (materialData.inputs.diffuseColor) {
            material.color = this.colorArrayToColor(materialData.inputs.diffuseColor);
        }

        if (materialData.inputs.metallic !== undefined) {
            material.metalness = materialData.inputs.metallic;
        }

        if (materialData.inputs.roughness !== undefined) {
            material.roughness = materialData.inputs.roughness;
        }

        if (materialData.inputs.opacity !== undefined) {
            material.opacity = materialData.inputs.opacity;
            if (material.opacity < 1.0) {
                material.transparent = true;
            }
        }

        if (materialData.inputs.emissiveColor) {
            material.emissive = this.colorArrayToColor(materialData.inputs.emissiveColor);
        }

        // Textures will be loaded async via loadTexturesForMaterial()

        return material;
    }

    /**
     * Load textures for a material (async)
     */
    async loadTexturesForMaterial(material, materialPrim, contextPath) {
        if (!this.textureManager) return;

        const materialData = this.parser.extractMaterial(materialPrim);

        // Common USD texture input names
        const textureInputs = {
            'diffuseColor': 'map',          // Base color map
            'normal': 'normalMap',           // Normal map
            'metallic': 'metalnessMap',     // Metallic map
            'roughness': 'roughnessMap',    // Roughness map
            'occlusion': 'aoMap',           // Ambient occlusion map
            'emissiveColor': 'emissiveMap', // Emissive map
        };

        const texturePromises = [];

        for (const [usdInput, threeProperty] of Object.entries(textureInputs)) {
            // Look for texture inputs (might be named differently)
            const texturePath = materialData.inputs[`${usdInput}:texture`] ||
                              materialData.inputs[`${usdInput}.texture`] ||
                              materialData.inputs[usdInput];

            if (texturePath && typeof texturePath === 'string') {
                const promise = this.textureManager.loadTexture(texturePath, contextPath)
                    .then(texture => {
                        if (texture) {
                            // Configure texture for USD
                            const colorSpace = (usdInput === 'diffuseColor' || usdInput === 'emissiveColor')
                                ? 'sRGB' : 'linear';
                            this.textureManager.configureTexture(texture, colorSpace);

                            // Apply to material
                            material[threeProperty] = texture;
                            material.needsUpdate = true;

                            console.log(`Loaded texture ${usdInput} for material ${material.name}`);
                        }
                    })
                    .catch(err => {
                        console.warn(`Failed to load texture ${texturePath}:`, err);
                    });

                texturePromises.push(promise);
            }
        }

        await Promise.all(texturePromises);
    }

    applyTransform(object, transform) {
        if (transform.matrix) {
            // Apply 4x4 matrix
            const m = transform.matrix;
            object.matrix.set(
                m[0], m[4], m[8], m[12],
                m[1], m[5], m[9], m[13],
                m[2], m[6], m[10], m[14],
                m[3], m[7], m[11], m[15]
            );
            object.matrixAutoUpdate = false;
        } else {
            // Apply TRS
            if (transform.translation) {
                object.position.set(
                    transform.translation[0],
                    transform.translation[1],
                    transform.translation[2]
                );
            }

            if (transform.rotation) {
                // Rotation might be in degrees or as quaternion
                if (transform.rotation.length === 3) {
                    // Euler angles (assuming degrees)
                    object.rotation.set(
                        THREE.MathUtils.degToRad(transform.rotation[0]),
                        THREE.MathUtils.degToRad(transform.rotation[1]),
                        THREE.MathUtils.degToRad(transform.rotation[2])
                    );
                } else if (transform.rotation.length === 4) {
                    // Quaternion
                    object.quaternion.set(
                        transform.rotation[0],
                        transform.rotation[1],
                        transform.rotation[2],
                        transform.rotation[3]
                    );
                }
            }

            if (transform.scale) {
                object.scale.set(
                    transform.scale[0],
                    transform.scale[1],
                    transform.scale[2]
                );
            }
        }
    }

    colorArrayToHex(colorArray) {
        if (!colorArray || colorArray.length < 3) return 0xffffff;
        const r = Math.floor(colorArray[0] * 255);
        const g = Math.floor(colorArray[1] * 255);
        const b = Math.floor(colorArray[2] * 255);
        return (r << 16) | (g << 8) | b;
    }

    colorArrayToColor(colorArray) {
        if (!colorArray || colorArray.length < 3) {
            return new THREE.Color(1, 1, 1);
        }
        return new THREE.Color(colorArray[0], colorArray[1], colorArray[2]);
    }

    getNameFromPath(path) {
        if (!path) return 'unnamed';
        const parts = path.split('/');
        return parts[parts.length - 1] || 'root';
    }

    getParentPath(path) {
        if (!path || path === '/') return null;
        const parts = path.split('/');
        parts.pop();
        return parts.join('/') || '/';
    }
}

export { USDZLoader };
