# USDC Parser Completion Priority Guide

Given the massive scope of the full TODO list (290-420 days), here's a **realistic prioritization** for making the parser production-ready.

## ✅ What's Already Done

- Basic binary format reading (Bootstrap, TOC, sections)
- Simple value unpacking for common types
- Basic mesh geometry extraction
- Material and light parsing (basic)
- Three.js integration layer
- Scene graph hierarchy
- Documentation and examples

## 🔥 PHASE 1: Make It Work (P0 - 2-3 weeks)

These are **BLOCKING** issues - without these, most real USD files won't parse:

### 1. Compressed Paths ⚠️ CRITICAL
**Status:** Partially implemented (IntegerCompression.js created)
**Remaining:**
- Integrate into USDCParser.readPaths()
- Implement _BuildDecompressedPathsImpl algorithm
- Handle property paths (negative token indices)
- Test with real compressed USD files

**Implementation:**
```javascript
readCompressedPaths() {
    // 1. Read numPaths
    // 2. Decompress pathIndexes (uint32[])
    // 3. Decompress elementTokenIndexes (int32[])
    // 4. Decompress jumps (int32[])
    // 5. Build path tree recursively
}
```

### 2. Integer Compression ⚠️ CRITICAL
**Status:** Basic implementation done (IntegerCompression.js)
**Remaining:**
- Add LZ4 library or improve SimpleLZ4
- Integrate into value reading
- Handle compressed arrays in readArrayValue()
- Test with compressed geometry data

**Note:** Consider using existing LZ4 library:
```javascript
import LZ4 from 'lz4js'; // or similar
```

### 3. Complete Value Types ⚠️ HIGH
**Missing types:**
- Half (16-bit float) - need conversion to Float32
- Matrix2d, Matrix3d
- Vec2i, Vec3i, Vec4i (integer vectors)
- All half-precision vectors (Vec2h, Vec3h, Vec4h)

**Implementation:**
```javascript
// Half float conversion
function halfToFloat(half) {
    const sign = (half & 0x8000) >> 15;
    const exponent = (half & 0x7C00) >> 10;
    const fraction = half & 0x03FF;

    if (exponent === 0) {
        return (sign ? -1 : 1) * Math.pow(2, -14) * (fraction / 1024);
    } else if (exponent === 31) {
        return fraction ? NaN : (sign ? -Infinity : Infinity);
    }

    return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}
```

### 4. Proper Array Reading with Decompression
**Current:** Basic arrays only
**Need:**
- Check IsCompressed bit in ValueRep
- Decompress if needed before reading
- Handle zero-copy for uncompressed arrays

## 🎯 PHASE 2: Real-World Usage (P1 - 3-4 weeks)

### 5. USDZ Archive Support
**Libraries needed:**
- JSZip or similar for ZIP extraction

**Implementation:**
```javascript
async parseUSDZ(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    // Find root .usdc file
    // Extract all files
    // Parse root
    // Resolve asset references
}
```

### 6. Texture Loading
**Integration with Three.js TextureLoader:**
```javascript
loadTexture(assetPath) {
    const loader = new THREE.TextureLoader();
    // Resolve path (in USDZ or relative)
    // Load texture
    // Apply color space
    // Return texture
}
```

### 7. Material Bindings (Relationships)
**Current:** Looking for property
**Need:** Traverse relationship targets properly

### 8. Basic Animation Support
- Read TimeSamples correctly
- Create Three.js AnimationClips
- Handle transform animations

## 📊 PHASE 3: Production Quality (P1/P2 - 4-6 weeks)

### 9. Additional Geometry Types
- BasisCurves (for hair/cables)
- Points (point clouds)
- Parametric shapes (Capsule, Cone, etc.)
- Camera support

### 10. Shader Graphs
- Parse UsdShadeNodeGraph
- Follow input/output connections
- Map to Three.js materials

### 11. Error Handling & Validation
- Graceful degradation
- Helpful error messages
- File validation

### 12. Performance Optimization
- Web Workers for parsing
- Lazy loading
- Geometry/material sharing

### 13. Testing Suite
- Unit tests for binary reading
- Integration tests with real USD files
- Visual regression tests

## 🚀 PHASE 4: Advanced Features (P2/P3 - Optional)

### 14. Composition Arcs
- References
- Variants
- Payloads
- Inherits

### 15. Subdivision Surfaces
- OpenSubdiv integration or approximation

### 16. Skeletal Animation
- UsdSkel support

### 17. Complete Primvar Interpolation
- Proper handling of all interpolation modes

---

## 📝 Quick Win Implementations

Here are some features that provide high value for low effort:

### A. Improve Path Reading (1 day)
Even without full compression, handle basic hierarchical paths better:
```javascript
buildPathFromTokens(parentPath, tokenIndex, isProperty) {
    const token = this.tokens[Math.abs(tokenIndex)];
    if (isProperty) {
        return `${parentPath}.${token}`;
    } else {
        return `${parentPath}/${token}`;
    }
}
```

### B. Add More Type Support (1-2 days)
Add the most common missing types incrementally.

### C. Better Mesh Conversion (1 day)
Improve triangulation for better results:
```javascript
triangulatePolygon(vertices) {
    // Use ear-clipping instead of fan
    // More robust for concave faces
}
```

### D. Add Metadata Extraction (1 day)
Extract useful metadata for debugging/inspection.

### E. Progress Callbacks (0.5 days)
Add progress reporting for large files.

---

## 🎓 Learning Resources

For implementing complex features:

1. **Compressed Paths:** See `crateFile.cpp:3795-3943`
2. **Integer Compression:** See `integerCoding.cpp`
3. **Value Resolution:** See USD documentation on LIVRPS
4. **Subdivision:** OpenSubdiv documentation
5. **Composition:** USD Glossary on composition arcs

---

## 🔧 Development Strategy

### Incremental Approach (Recommended)

1. **Week 1-2:** Compressed paths + integer compression
2. **Week 3:** Complete value types + better arrays
3. **Week 4:** Test with real files, fix bugs
4. **Week 5-6:** USDZ support + texture loading
5. **Week 7-8:** Animation basics
6. **Week 9-10:** Additional geometry types
7. **Week 11-12:** Polish + testing

### Test-Driven Approach

For each feature:
1. Get a real USD file using that feature
2. Try to parse it
3. Identify what fails
4. Implement missing piece
5. Verify it works
6. Move to next feature

---

## 📦 Suggested Libraries

Consider using these instead of implementing from scratch:

- **LZ4 Compression:** `lz4js` or `lz4-asm`
- **ZIP/USDZ:** `jszip`
- **Half Floats:** `@petamoriken/float16` or implement
- **Testing:** `jest` or `mocha`
- **Benchmarking:** `benchmark.js`

---

## 🎯 Minimum Viable Product (MVP)

To have a **working parser that handles most real USD files:**

**Must Have (4-6 weeks):**
- ✅ Compressed paths
- ✅ Integer compression
- ✅ Complete basic value types
- ✅ Array decompression
- ✅ USDZ extraction
- ✅ Texture loading
- ✅ Better error handling

**Should Have (2-3 weeks more):**
- Animation support
- Additional geometry types
- Shader graphs
- Testing suite

**Nice to Have (Optional):**
- Everything else in P2/P3

---

## 💡 Key Insights

1. **Don't Implement Everything:** Focus on what you actually need
2. **Use Libraries:** LZ4, ZIP, etc. - don't reinvent wheels
3. **Test with Real Files:** Theory vs practice are very different
4. **Incremental Progress:** Get something working, then improve
5. **Community Help:** Others may have implemented some features

---

## 🚨 Red Flags

**Don't Start These Unless Necessary:**
- Full composition arc system (extremely complex)
- Hydra scene index (overkill for Three.js)
- MaterialX (unless you specifically need it)
- Volumes (Three.js has limited support anyway)

---

## ✨ Success Criteria

You'll know the parser is "complete enough" when:

1. ✅ Loads common USD assets from major sources
2. ✅ Handles both USDC and USDZ files
3. ✅ Geometry displays correctly in Three.js
4. ✅ Materials and textures work
5. ✅ Basic animations play
6. ✅ Doesn't crash on real-world files
7. ✅ Performance is acceptable (<1s for small files, <10s for large)
8. ✅ Error messages are helpful

---

## 📈 Estimated Timeline

**Realistic Full Production Parser:**
- Phase 1 (Make it work): **2-3 weeks**
- Phase 2 (Real-world usage): **3-4 weeks**
- Phase 3 (Production quality): **4-6 weeks**

**Total: 9-13 weeks (2-3 months) of focused work**

This gets you from current 15% complete to 80-90% complete for practical usage.

The remaining 10-20% (advanced features) could take another 6-12 months but may not be necessary for most use cases.
