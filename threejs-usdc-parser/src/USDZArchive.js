/**
 * USDZ Archive Handler
 *
 * Handles USDZ (ZIP) archive extraction and asset resolution.
 * USDZ files are ZIP archives containing:
 * - One or more .usdc/.usda files
 * - Texture files (PNG, JPG, etc.)
 * - Other referenced assets
 *
 * Note: Requires JSZip library for ZIP extraction
 * Install: npm install jszip
 * Or use CDN: https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js
 *
 * @author OpenUSD Contributors
 * @license Apache-2.0
 */

class USDZArchive {
    constructor() {
        this.files = new Map(); // filename -> data
        this.rootFile = null;
        this.baseURL = null;
    }

    /**
     * Extract USDZ archive
     * @param {ArrayBuffer} buffer - USDZ file data
     * @returns {Promise<void>}
     */
    async extract(buffer) {
        // Check if JSZip is available
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip library required for USDZ support. Include it via: <script src="https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js"></script>');
        }

        const zip = new JSZip();
        await zip.loadAsync(buffer);

        // Extract all files
        const filePromises = [];
        zip.forEach((relativePath, file) => {
            if (!file.dir) {
                filePromises.push(
                    file.async('arraybuffer').then(data => {
                        this.files.set(relativePath, {
                            name: relativePath,
                            data: data,
                            blob: null // Will create on demand
                        });
                    })
                );
            }
        });

        await Promise.all(filePromises);

        // Find root USD file
        this.rootFile = this.findRootFile();

        console.log(`Extracted USDZ archive: ${this.files.size} files, root: ${this.rootFile}`);
    }

    /**
     * Find the root USD file in the archive
     * According to USDZ spec, it's the first .usdc file encountered
     */
    findRootFile() {
        // Look for .usdc or .usda files
        const usdFiles = [];
        for (const [name, file] of this.files) {
            if (name.endsWith('.usdc') || name.endsWith('.usda')) {
                usdFiles.push(name);
            }
        }

        if (usdFiles.length === 0) {
            throw new Error('No USD files found in USDZ archive');
        }

        // Return the first one (USDZ spec: lexicographically first)
        usdFiles.sort();
        return usdFiles[0];
    }

    /**
     * Get file data by path
     * @param {string} path - File path relative to archive root
     * @returns {ArrayBuffer|null}
     */
    getFile(path) {
        // Normalize path (remove leading ./ or /)
        const normalizedPath = path.replace(/^\.\//, '').replace(/^\//, '');

        const file = this.files.get(normalizedPath);
        return file ? file.data : null;
    }

    /**
     * Get file as Blob (for texture loading)
     * @param {string} path - File path
     * @returns {Blob|null}
     */
    getFileAsBlob(path) {
        const normalizedPath = path.replace(/^\.\//, '').replace(/^\//, '');
        const file = this.files.get(normalizedPath);

        if (!file) return null;

        // Create blob on demand
        if (!file.blob) {
            const ext = path.split('.').pop().toLowerCase();
            const mimeTypes = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'webp': 'image/webp',
                'gif': 'image/gif',
                'bmp': 'image/bmp',
                'exr': 'image/x-exr',
                'hdr': 'image/vnd.radiance'
            };
            const mimeType = mimeTypes[ext] || 'application/octet-stream';
            file.blob = new Blob([file.data], { type: mimeType });
        }

        return file.blob;
    }

    /**
     * Get file as data URL (for texture loading)
     * @param {string} path - File path
     * @returns {Promise<string|null>}
     */
    async getFileAsDataURL(path) {
        const blob = this.getFileAsBlob(path);
        if (!blob) return null;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Get root USD file data
     * @returns {ArrayBuffer}
     */
    getRootFile() {
        if (!this.rootFile) {
            throw new Error('No root file found');
        }
        return this.getFile(this.rootFile);
    }

    /**
     * List all files in archive
     * @returns {string[]}
     */
    listFiles() {
        return Array.from(this.files.keys());
    }

    /**
     * Check if file exists
     * @param {string} path - File path
     * @returns {boolean}
     */
    hasFile(path) {
        const normalizedPath = path.replace(/^\.\//, '').replace(/^\//, '');
        return this.files.has(normalizedPath);
    }

    /**
     * Resolve asset path
     * Handles relative paths, absolute paths, and search paths
     * @param {string} assetPath - Asset path from USD
     * @param {string} contextPath - Path of file making the reference
     * @returns {string|null}
     */
    resolveAssetPath(assetPath, contextPath = '') {
        // Handle absolute paths
        if (assetPath.startsWith('/')) {
            const path = assetPath.substring(1);
            if (this.hasFile(path)) return path;
        }

        // Handle relative paths
        if (contextPath) {
            const contextDir = contextPath.substring(0, contextPath.lastIndexOf('/'));
            const resolvedPath = contextDir ? `${contextDir}/${assetPath}` : assetPath;
            const normalized = this.normalizePath(resolvedPath);
            if (this.hasFile(normalized)) return normalized;
        }

        // Try as-is
        if (this.hasFile(assetPath)) return assetPath;

        // Try without leading ./
        const withoutDot = assetPath.replace(/^\.\//, '');
        if (this.hasFile(withoutDot)) return withoutDot;

        return null;
    }

    /**
     * Normalize path (resolve .. and .)
     */
    normalizePath(path) {
        const parts = path.split('/');
        const result = [];

        for (const part of parts) {
            if (part === '..') {
                result.pop();
            } else if (part !== '.' && part !== '') {
                result.push(part);
            }
        }

        return result.join('/');
    }
}

/**
 * Texture Manager for USD assets
 * Handles texture loading from USDZ archives or file system
 */
class USDTextureManager {
    constructor(textureLoader, archive = null) {
        this.textureLoader = textureLoader;
        this.archive = archive;
        this.cache = new Map();
        this.baseURL = '';
    }

    /**
     * Set base URL for resolving external texture paths
     */
    setBaseURL(url) {
        this.baseURL = url;
    }

    /**
     * Load texture from asset path
     * @param {string} assetPath - USD asset path
     * @param {string} contextPath - Path of USD file making reference
     * @returns {Promise<THREE.Texture|null>}
     */
    async loadTexture(assetPath, contextPath = '') {
        // Check cache
        if (this.cache.has(assetPath)) {
            return this.cache.get(assetPath);
        }

        let texture = null;

        // Try USDZ archive first
        if (this.archive) {
            const resolvedPath = this.archive.resolveAssetPath(assetPath, contextPath);
            if (resolvedPath) {
                texture = await this.loadFromArchive(resolvedPath);
            }
        }

        // Fall back to external URL
        if (!texture) {
            texture = await this.loadFromURL(assetPath);
        }

        if (texture) {
            this.cache.set(assetPath, texture);
        }

        return texture;
    }

    /**
     * Load texture from USDZ archive
     */
    async loadFromArchive(path) {
        try {
            const dataURL = await this.archive.getFileAsDataURL(path);
            if (!dataURL) return null;

            return new Promise((resolve, reject) => {
                this.textureLoader.load(
                    dataURL,
                    (texture) => {
                        console.log(`Loaded texture from archive: ${path}`);
                        resolve(texture);
                    },
                    undefined,
                    (error) => {
                        console.warn(`Failed to load texture from archive: ${path}`, error);
                        resolve(null);
                    }
                );
            });
        } catch (e) {
            console.warn(`Error loading texture from archive: ${path}`, e);
            return null;
        }
    }

    /**
     * Load texture from external URL
     */
    async loadFromURL(assetPath) {
        try {
            // Construct URL
            let url = assetPath;
            if (this.baseURL && !assetPath.startsWith('http') && !assetPath.startsWith('data:')) {
                url = `${this.baseURL}/${assetPath}`;
            }

            return new Promise((resolve, reject) => {
                this.textureLoader.load(
                    url,
                    (texture) => {
                        console.log(`Loaded texture from URL: ${url}`);
                        resolve(texture);
                    },
                    undefined,
                    (error) => {
                        console.warn(`Failed to load texture from URL: ${url}`, error);
                        resolve(null);
                    }
                );
            });
        } catch (e) {
            console.warn(`Error loading texture from URL: ${assetPath}`, e);
            return null;
        }
    }

    /**
     * Configure texture for USD color space
     */
    configureTexture(texture, colorSpace = 'sRGB') {
        if (!texture) return;

        // Set color space
        if (colorSpace === 'sRGB' || colorSpace === 'auto') {
            texture.colorSpace = 'srgb';
        } else if (colorSpace === 'linear' || colorSpace === 'raw') {
            texture.colorSpace = 'linear';
        }

        // Default texture settings
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;

        return texture;
    }
}

// Export for use in browser and Node.js
export { USDZArchive, USDTextureManager };
export default USDZArchive;
