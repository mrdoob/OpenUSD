/**
 * USDCParser - JavaScript-only parser for USDC (Crate) binary files
 *
 * This parser reads the binary USDC format used by Pixar's Universal Scene Description.
 * It supports geometries, materials, textures, scene graph hierarchy, and lights.
 *
 * File Format Overview:
 * - Bootstrap Header (8 bytes ident + 8 bytes version + int64 tocOffset + reserved)
 * - Sections (tokens, strings, fields, specs, paths, etc.)
 * - Table of Contents pointing to each section
 *
 * @author OpenUSD Contributors
 * @license Apache-2.0
 */

import { IntegerCompression, SimpleLZ4 } from './IntegerCompression.js';

/**
 * Half-float (16-bit float) utilities
 */
class HalfFloat {
    static toFloat(half) {
        const sign = (half & 0x8000) >> 15;
        const exponent = (half & 0x7C00) >> 10;
        const fraction = half & 0x03FF;

        if (exponent === 0) {
            // Denormalized number
            return (sign ? -1 : 1) * Math.pow(2, -14) * (fraction / 1024);
        } else if (exponent === 31) {
            // Infinity or NaN
            return fraction ? NaN : (sign ? -Infinity : Infinity);
        }

        // Normalized number
        return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
    }

    static readHalf(view, offset, littleEndian = true) {
        const bits = view.getUint16(offset, littleEndian);
        return this.toFloat(bits);
    }
}

class USDCParser {
    constructor() {
        this.USDC_IDENT = 'PXR-USDC';
        this.VERSION_0_8_0 = { major: 0, minor: 8, patch: 0 };

        // Type enum matching crateDataTypes.h
        this.TYPE_ENUM = {
            Invalid: 0,
            Bool: 1,
            UChar: 2,
            Int: 3,
            UInt: 4,
            Int64: 5,
            UInt64: 6,
            Half: 7,
            Float: 8,
            Double: 9,
            String: 10,
            Token: 11,
            AssetPath: 12,
            Matrix2d: 13,
            Matrix3d: 14,
            Matrix4d: 15,
            Quatd: 16,
            Quatf: 17,
            Quath: 18,
            Vec2d: 19,
            Vec2f: 20,
            Vec2h: 21,
            Vec2i: 22,
            Vec3d: 23,
            Vec3f: 24,
            Vec3h: 25,
            Vec3i: 26,
            Vec4d: 27,
            Vec4f: 28,
            Vec4h: 29,
            Vec4i: 30,
            Dictionary: 31,
            TokenListOp: 32,
            StringListOp: 33,
            PathListOp: 34,
            ReferenceListOp: 35,
            IntListOp: 36,
            Int64ListOp: 37,
            UIntListOp: 38,
            UInt64ListOp: 39,
            PathVector: 40,
            TokenVector: 41,
            Specifier: 42,
            Permission: 43,
            Variability: 44,
            VariantSelectionMap: 45,
            TimeSamples: 46,
            Payload: 47,
            DoubleVector: 48,
            LayerOffsetVector: 49,
            StringVector: 50,
            ValueBlock: 51,
            Value: 52,
            UnregisteredValue: 53,
            UnregisteredValueListOp: 54,
            PayloadListOp: 55,
            TimeCode: 56,
            PathExpression: 57,
            Relocates: 58,
            Spline: 59,
            AnimationBlock: 60
        };

        // ValueRep bit flags
        this.VALUE_REP_IS_ARRAY_BIT = 1n << 63n;
        this.VALUE_REP_IS_INLINED_BIT = 1n << 62n;
        this.VALUE_REP_IS_COMPRESSED_BIT = 1n << 61n;
        this.VALUE_REP_IS_ARRAY_EDIT_BIT = 1n << 60n;
        this.VALUE_REP_PAYLOAD_MASK = (1n << 48n) - 1n;

        // SdfSpecType enum
        this.SPEC_TYPE = {
            Unknown: 0,
            Attribute: 1,
            Connection: 2,
            Expression: 3,
            Mapper: 4,
            MapperArg: 5,
            Prim: 6,
            PseudoRoot: 7,
            Relationship: 8,
            RelationshipTarget: 9,
            Variant: 10,
            VariantSet: 11
        };

        // Reset parser state
        this.reset();
    }

    reset() {
        this.buffer = null;
        this.view = null;
        this.offset = 0;
        this.bootstrap = null;
        this.toc = null;
        this.tokens = [];
        this.strings = [];
        this.paths = [];
        this.specs = [];
        this.fields = [];
        this.fieldSets = [];
    }

    /**
     * Parse a USDC file from ArrayBuffer
     * @param {ArrayBuffer} buffer - The USDC file data
     * @returns {Object} Parsed USD stage data
     */
    parse(buffer) {
        this.reset();
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.offset = 0;

        // Read bootstrap header
        this.bootstrap = this.readBootstrap();
        console.log('Bootstrap:', this.bootstrap);

        // Read table of contents
        this.toc = this.readTableOfContents();
        console.log('Table of Contents:', this.toc);

        // Read structural sections in order
        this.readTokens();
        this.readStrings();
        this.readFields();
        this.readFieldSets();
        this.readSpecs();
        this.readPaths();

        // Build the scene
        return this.buildScene();
    }

    //=========================================================================
    // Binary Reading Utilities
    //=========================================================================

    readUInt8() {
        const value = this.view.getUint8(this.offset);
        this.offset += 1;
        return value;
    }

    readInt32() {
        const value = this.view.getInt32(this.offset, true); // little-endian
        this.offset += 4;
        return value;
    }

    readUInt32() {
        const value = this.view.getUint32(this.offset, true);
        this.offset += 4;
        return value;
    }

    readInt64() {
        const value = this.view.getBigInt64(this.offset, true);
        this.offset += 8;
        return Number(value); // Convert to regular number for convenience
    }

    readUInt64() {
        const value = this.view.getBigUint64(this.offset, true);
        this.offset += 8;
        return value;
    }

    readFloat() {
        const value = this.view.getFloat32(this.offset, true);
        this.offset += 4;
        return value;
    }

    readDouble() {
        const value = this.view.getFloat64(this.offset, true);
        this.offset += 8;
        return value;
    }

    readString(length) {
        const bytes = new Uint8Array(this.buffer, this.offset, length);
        this.offset += length;
        return new TextDecoder().decode(bytes);
    }

    readBytes(length) {
        const bytes = new Uint8Array(this.buffer, this.offset, length);
        this.offset += length;
        return bytes;
    }

    seek(position) {
        this.offset = position;
    }

    //=========================================================================
    // Bootstrap and TOC
    //=========================================================================

    readBootstrap() {
        // Read identifier (8 bytes)
        const ident = this.readString(8);
        if (ident !== this.USDC_IDENT) {
            throw new Error(`Invalid USDC file identifier: ${ident}`);
        }

        // Read version (8 bytes: major, minor, patch, reserved)
        const major = this.readUInt8();
        const minor = this.readUInt8();
        const patch = this.readUInt8();
        this.readBytes(5); // reserved bytes

        // Read TOC offset
        const tocOffset = this.readInt64();

        // Skip reserved section (8 * int64)
        this.readBytes(64);

        return {
            ident,
            version: { major, minor, patch },
            tocOffset
        };
    }

    readTableOfContents() {
        this.seek(this.bootstrap.tocOffset);

        const numSections = this.readInt64();
        const sections = {};

        for (let i = 0; i < numSections; i++) {
            // Section name (max 16 bytes, null-terminated)
            const nameBytes = this.readBytes(16);
            const nullIndex = nameBytes.indexOf(0);
            const name = new TextDecoder().decode(
                nameBytes.subarray(0, nullIndex >= 0 ? nullIndex : 16)
            );

            const start = this.readInt64();
            const size = this.readInt64();

            sections[name] = { start, size };
        }

        return sections;
    }

    //=========================================================================
    // Section Reading
    //=========================================================================

    readTokens() {
        const section = this.toc.tokens;
        if (!section) return;

        this.seek(section.start);
        const numTokens = this.readInt64();

        this.tokens = [];
        for (let i = 0; i < numTokens; i++) {
            const tokenIndex = this.readUInt32();
            this.tokens.push(this.strings[tokenIndex] || '');
        }

        console.log(`Read ${this.tokens.length} tokens`);
    }

    readStrings() {
        const section = this.toc.strings;
        if (!section) return;

        this.seek(section.start);
        const numStrings = this.readInt64();

        this.strings = [];

        // Read string offsets
        const offsets = [];
        for (let i = 0; i < numStrings; i++) {
            offsets.push(this.readUInt32());
        }

        // Read string data
        const dataStart = this.offset;
        for (let i = 0; i < numStrings; i++) {
            const offset = offsets[i];
            const nextOffset = i + 1 < numStrings ? offsets[i + 1] : section.size - (dataStart - section.start);
            const length = nextOffset - offset;

            this.seek(dataStart + offset);
            const str = this.readString(length);
            // Remove null terminator if present
            this.strings.push(str.replace(/\0$/, ''));
        }

        console.log(`Read ${this.strings.length} strings`);
    }

    readFields() {
        const section = this.toc.fields;
        if (!section) return;

        this.seek(section.start);
        const numFields = this.readInt64();

        this.fields = [];
        for (let i = 0; i < numFields; i++) {
            // Field structure: uint32 padding + uint32 tokenIndex + uint64 valueRep
            const padding = this.readUInt32();
            const tokenIndex = this.readUInt32();
            const valueRep = this.readUInt64();

            this.fields.push({
                tokenIndex,
                valueRep,
                name: this.tokens[tokenIndex] || `field_${i}`
            });
        }

        console.log(`Read ${this.fields.length} fields`);
    }

    readFieldSets() {
        const section = this.toc.fieldSets;
        if (!section) return;

        this.seek(section.start);
        const numIndices = this.readInt64();

        const indices = [];
        for (let i = 0; i < numIndices; i++) {
            indices.push(this.readUInt32());
        }

        // Build field sets (separated by index 0xFFFFFFFF)
        this.fieldSets = [];
        let currentSet = [];
        for (const index of indices) {
            if (index === 0xFFFFFFFF) {
                if (currentSet.length > 0) {
                    this.fieldSets.push(currentSet);
                    currentSet = [];
                }
            } else {
                currentSet.push(index);
            }
        }
        if (currentSet.length > 0) {
            this.fieldSets.push(currentSet);
        }

        console.log(`Read ${this.fieldSets.length} field sets`);
    }

    readSpecs() {
        const section = this.toc.specs;
        if (!section) return;

        this.seek(section.start);
        const numSpecs = this.readInt64();

        this.specs = [];
        for (let i = 0; i < numSpecs; i++) {
            const pathIndex = this.readUInt32();
            const fieldSetIndex = this.readUInt32();
            const specType = this.readUInt32();

            this.specs.push({
                pathIndex,
                fieldSetIndex,
                specType
            });
        }

        console.log(`Read ${this.specs.length} specs`);
    }

    readPaths() {
        const section = this.toc.paths;
        if (!section) return;

        this.seek(section.start);

        // Read number of paths
        const numPaths = this.readInt64();

        // Initialize paths array with correct size
        this.paths = new Array(numPaths);

        // Read compressed data sizes
        const pathIndexesSize = this.readInt64();
        const elementTokenIndexesSize = this.readInt64();
        const jumpsSize = this.readInt64();

        try {
            // Read compressed path indices
            const pathIndexesData = this.readBytes(pathIndexesSize);
            const pathIndexes = IntegerCompression.decompressUInt32(
                pathIndexesData.buffer.slice(pathIndexesData.byteOffset, pathIndexesData.byteOffset + pathIndexesData.byteLength),
                numPaths
            );

            // Read compressed element token indices
            const elementTokenIndexesData = this.readBytes(elementTokenIndexesSize);
            const elementTokenIndexes = IntegerCompression.decompressIntegers(
                elementTokenIndexesData.buffer.slice(elementTokenIndexesData.byteOffset, elementTokenIndexesData.byteOffset + elementTokenIndexesData.byteLength),
                numPaths,
                false
            );

            // Read compressed jumps
            const jumpsData = this.readBytes(jumpsSize);
            const jumps = IntegerCompression.decompressIntegers(
                jumpsData.buffer.slice(jumpsData.byteOffset, jumpsData.byteOffset + jumpsData.byteLength),
                numPaths,
                false
            );

            // Build decompressed paths from the compressed representation
            this.buildDecompressedPaths(pathIndexes, elementTokenIndexes, jumps, 0, '/');

            console.log(`Read ${this.paths.length} compressed paths`);
        } catch (e) {
            console.warn('Failed to read compressed paths, trying simple format:', e);
            // Fallback to simple reading if compression fails
            this.readPathsSimple();
        }
    }

    /**
     * Build paths from compressed representation
     * Algorithm from OpenUSD crateFile.cpp:_BuildDecompressedPathsImpl
     */
    buildDecompressedPaths(pathIndexes, elementTokenIndexes, jumps, curIndex, parentPath) {
        let hasChild = false;
        let hasSibling = false;

        do {
            const thisIndex = curIndex++;

            if (thisIndex >= pathIndexes.length) {
                break;
            }

            // Build this path
            if (parentPath === '/') {
                // Root path
                this.paths[pathIndexes[thisIndex]] = '/';
            } else {
                const tokenIndex = elementTokenIndexes[thisIndex];
                const isPrimPropertyPath = tokenIndex < 0;
                const absTokenIndex = Math.abs(tokenIndex);

                if (absTokenIndex < this.tokens.length) {
                    const elemToken = this.tokens[absTokenIndex];

                    // Append to parent path
                    if (isPrimPropertyPath) {
                        // Property path (negative token index)
                        this.paths[pathIndexes[thisIndex]] = `${parentPath}.${elemToken}`;
                    } else {
                        // Prim path (positive token index)
                        this.paths[pathIndexes[thisIndex]] = `${parentPath}/${elemToken}`;
                    }
                }
            }

            // Determine if we have children or siblings
            const jump = jumps[thisIndex];
            hasChild = (jump > 0) || (jump === -1);
            hasSibling = (jump >= 0);

            if (hasChild) {
                if (hasSibling) {
                    // Recursively process sibling subtree
                    const siblingIndex = thisIndex + jump;
                    if (siblingIndex < pathIndexes.length) {
                        this.buildDecompressedPaths(
                            pathIndexes,
                            elementTokenIndexes,
                            jumps,
                            siblingIndex,
                            parentPath
                        );
                    }
                }
                // Move to child, update parent path
                parentPath = this.paths[pathIndexes[thisIndex]];
            }

        } while (hasChild || hasSibling);
    }

    /**
     * Simple uncompressed path reading fallback
     */
    readPathsSimple() {
        const numPaths = this.paths.length;
        for (let i = 0; i < numPaths; i++) {
            // Very simple: just read a token index
            try {
                const tokenIndex = this.readUInt32();
                this.paths[i] = this.tokens[tokenIndex] || `/path_${i}`;
            } catch (e) {
                this.paths[i] = `/path_${i}`;
            }
        }
    }

    //=========================================================================
    // Value Unpacking
    //=========================================================================

    unpackValueRep(valueRep) {
        const data = BigInt(valueRep);

        const isArray = (data & this.VALUE_REP_IS_ARRAY_BIT) !== 0n;
        const isInlined = (data & this.VALUE_REP_IS_INLINED_BIT) !== 0n;
        const isCompressed = (data & this.VALUE_REP_IS_COMPRESSED_BIT) !== 0n;
        const typeEnum = Number((data >> 48n) & 0xFFn);
        const payload = data & this.VALUE_REP_PAYLOAD_MASK;

        return {
            isArray,
            isInlined,
            isCompressed,
            type: typeEnum,
            payload: Number(payload)
        };
    }

    readValue(valueRep) {
        try {
            const unpacked = this.unpackValueRep(valueRep);

            if (unpacked.isInlined) {
                return this.readInlinedValue(unpacked);
            }

            // Value is stored at file offset
            const savedOffset = this.offset;

            // Validate offset is within file bounds
            if (unpacked.payload >= this.buffer.byteLength) {
                console.warn(`Value offset ${unpacked.payload} exceeds file size`);
                return null;
            }

            this.seek(unpacked.payload);

            const value = unpacked.isArray
                ? this.readArrayValue(unpacked)
                : this.readSingleValue(unpacked);

            this.seek(savedOffset);
            return value;
        } catch (e) {
            console.error('Error reading value:', e);
            return null;
        }
    }

    readInlinedValue(unpacked) {
        const { type, payload } = unpacked;

        switch (type) {
            case this.TYPE_ENUM.Bool:
                return Boolean(payload);
            case this.TYPE_ENUM.UChar:
            case this.TYPE_ENUM.Int:
            case this.TYPE_ENUM.UInt:
                return payload;
            case this.TYPE_ENUM.Float:
                // Payload contains float bits
                const buffer = new ArrayBuffer(4);
                const view = new DataView(buffer);
                view.setUint32(0, payload, true);
                return view.getFloat32(0, true);
            case this.TYPE_ENUM.Token:
            case this.TYPE_ENUM.String:
                return this.tokens[payload] || '';
            default:
                return payload;
        }
    }

    readSingleValue(unpacked) {
        const { type } = unpacked;

        switch (type) {
            case this.TYPE_ENUM.Bool:
                return Boolean(this.readUInt8());
            case this.TYPE_ENUM.UChar:
                return this.readUInt8();
            case this.TYPE_ENUM.Int:
                return this.readInt32();
            case this.TYPE_ENUM.UInt:
                return this.readUInt32();
            case this.TYPE_ENUM.Int64:
                return this.readInt64();
            case this.TYPE_ENUM.UInt64:
                return Number(this.readUInt64());
            case this.TYPE_ENUM.Half:
                const half = HalfFloat.readHalf(this.view, this.offset, true);
                this.offset += 2;
                return half;
            case this.TYPE_ENUM.Float:
                return this.readFloat();
            case this.TYPE_ENUM.Double:
                return this.readDouble();
            case this.TYPE_ENUM.Token:
            case this.TYPE_ENUM.String:
            case this.TYPE_ENUM.AssetPath:
                const tokenIndex = this.readUInt32();
                return this.tokens[tokenIndex] || '';

            // Float vectors
            case this.TYPE_ENUM.Vec2f:
                return [this.readFloat(), this.readFloat()];
            case this.TYPE_ENUM.Vec3f:
                return [this.readFloat(), this.readFloat(), this.readFloat()];
            case this.TYPE_ENUM.Vec4f:
                return [this.readFloat(), this.readFloat(), this.readFloat(), this.readFloat()];

            // Double vectors
            case this.TYPE_ENUM.Vec2d:
                return [this.readDouble(), this.readDouble()];
            case this.TYPE_ENUM.Vec3d:
                return [this.readDouble(), this.readDouble(), this.readDouble()];
            case this.TYPE_ENUM.Vec4d:
                return [this.readDouble(), this.readDouble(), this.readDouble(), this.readDouble()];

            // Half vectors
            case this.TYPE_ENUM.Vec2h:
                const vec2h = [
                    HalfFloat.readHalf(this.view, this.offset, true),
                    HalfFloat.readHalf(this.view, this.offset + 2, true)
                ];
                this.offset += 4;
                return vec2h;
            case this.TYPE_ENUM.Vec3h:
                const vec3h = [
                    HalfFloat.readHalf(this.view, this.offset, true),
                    HalfFloat.readHalf(this.view, this.offset + 2, true),
                    HalfFloat.readHalf(this.view, this.offset + 4, true)
                ];
                this.offset += 6;
                return vec3h;
            case this.TYPE_ENUM.Vec4h:
                const vec4h = [
                    HalfFloat.readHalf(this.view, this.offset, true),
                    HalfFloat.readHalf(this.view, this.offset + 2, true),
                    HalfFloat.readHalf(this.view, this.offset + 4, true),
                    HalfFloat.readHalf(this.view, this.offset + 6, true)
                ];
                this.offset += 8;
                return vec4h;

            // Integer vectors
            case this.TYPE_ENUM.Vec2i:
                return [this.readInt32(), this.readInt32()];
            case this.TYPE_ENUM.Vec3i:
                return [this.readInt32(), this.readInt32(), this.readInt32()];
            case this.TYPE_ENUM.Vec4i:
                return [this.readInt32(), this.readInt32(), this.readInt32(), this.readInt32()];

            // Matrices
            case this.TYPE_ENUM.Matrix2d:
                const m2 = [];
                for (let i = 0; i < 4; i++) {
                    m2.push(this.readDouble());
                }
                return m2;
            case this.TYPE_ENUM.Matrix3d:
                const m3 = [];
                for (let i = 0; i < 9; i++) {
                    m3.push(this.readDouble());
                }
                return m3;
            case this.TYPE_ENUM.Matrix4d:
                const m4 = [];
                for (let i = 0; i < 16; i++) {
                    m4.push(this.readDouble());
                }
                return m4;

            // Quaternions
            case this.TYPE_ENUM.Quatf:
                return [this.readFloat(), this.readFloat(), this.readFloat(), this.readFloat()];
            case this.TYPE_ENUM.Quatd:
                return [this.readDouble(), this.readDouble(), this.readDouble(), this.readDouble()];
            case this.TYPE_ENUM.Quath:
                const quath = [
                    HalfFloat.readHalf(this.view, this.offset, true),
                    HalfFloat.readHalf(this.view, this.offset + 2, true),
                    HalfFloat.readHalf(this.view, this.offset + 4, true),
                    HalfFloat.readHalf(this.view, this.offset + 6, true)
                ];
                this.offset += 8;
                return quath;

            // Complex types
            case this.TYPE_ENUM.Dictionary:
                return this.readDictionary();

            case this.TYPE_ENUM.TimeSamples:
                return this.readTimeSamples();

            case this.TYPE_ENUM.TokenListOp:
            case this.TYPE_ENUM.StringListOp:
            case this.TYPE_ENUM.PathListOp:
            case this.TYPE_ENUM.IntListOp:
            case this.TYPE_ENUM.Int64ListOp:
            case this.TYPE_ENUM.UIntListOp:
            case this.TYPE_ENUM.UInt64ListOp:
            case this.TYPE_ENUM.ReferenceListOp:
            case this.TYPE_ENUM.PayloadListOp:
                return this.readListOp(type);

            default:
                console.warn(`Unsupported value type: ${type} (${this.getTypeName(type)})`);
                return null;
        }
    }

    /**
     * Read Dictionary type
     */
    readDictionary() {
        const numEntries = this.readInt64();
        const dict = {};

        for (let i = 0; i < numEntries; i++) {
            // Read key (token index)
            const keyIndex = this.readUInt32();
            const key = this.tokens[keyIndex] || `key_${i}`;

            // Read value (ValueRep)
            const valueRep = this.readUInt64();
            const value = this.readValue(valueRep);

            dict[key] = value;
        }

        return dict;
    }

    /**
     * Read TimeSamples (animation data)
     */
    readTimeSamples() {
        // Read the ValueRep for the samples (may be 0 if in-memory)
        const valueRep = this.readUInt64();

        // Read time codes
        const numTimes = this.readInt64();
        const times = [];
        for (let i = 0; i < numTimes; i++) {
            times.push(this.readDouble());
        }

        // Read values
        const values = [];
        if (valueRep === 0n || valueRep === 0) {
            // Values are in-memory, read them
            for (let i = 0; i < numTimes; i++) {
                const valRep = this.readUInt64();
                values.push(this.readValue(valRep));
            }
        } else {
            // Values are at file offset (stored as valueRep points to them)
            // For simplicity, try to read them
            const savedOffset = this.offset;
            try {
                for (let i = 0; i < numTimes; i++) {
                    const valRep = this.readUInt64();
                    values.push(this.readValue(valRep));
                }
            } catch (e) {
                // If we can't read, just return what we have
            }
            this.seek(savedOffset);
        }

        return {
            type: 'TimeSamples',
            times,
            values
        };
    }

    /**
     * Read ListOp (list edit operations)
     */
    readListOp(type) {
        // ListOps have: explicit, added, prepended, appended, deleted
        const hasExplicit = Boolean(this.readUInt8());
        const hasAdded = Boolean(this.readUInt8());
        const hasPrepended = Boolean(this.readUInt8());
        const hasAppended = Boolean(this.readUInt8());
        const hasDeleted = Boolean(this.readUInt8());

        const listOp = {};

        if (hasExplicit) {
            listOp.explicit = this.readListOpItems(type);
        }
        if (hasAdded) {
            listOp.added = this.readListOpItems(type);
        }
        if (hasPrepended) {
            listOp.prepended = this.readListOpItems(type);
        }
        if (hasAppended) {
            listOp.appended = this.readListOpItems(type);
        }
        if (hasDeleted) {
            listOp.deleted = this.readListOpItems(type);
        }

        return listOp;
    }

    /**
     * Read items for a ListOp
     */
    readListOpItems(type) {
        const numItems = this.readInt64();
        const items = [];

        for (let i = 0; i < numItems; i++) {
            switch (type) {
                case this.TYPE_ENUM.TokenListOp:
                case this.TYPE_ENUM.StringListOp:
                    const tokenIndex = this.readUInt32();
                    items.push(this.tokens[tokenIndex] || '');
                    break;
                case this.TYPE_ENUM.PathListOp:
                    const pathIndex = this.readUInt32();
                    items.push(this.paths[pathIndex] || '');
                    break;
                case this.TYPE_ENUM.IntListOp:
                    items.push(this.readInt32());
                    break;
                case this.TYPE_ENUM.Int64ListOp:
                    items.push(this.readInt64());
                    break;
                case this.TYPE_ENUM.UIntListOp:
                    items.push(this.readUInt32());
                    break;
                case this.TYPE_ENUM.UInt64ListOp:
                    items.push(Number(this.readUInt64()));
                    break;
                default:
                    // For complex types like Reference/Payload, skip for now
                    items.push(null);
            }
        }

        return items;
    }

    /**
     * Get human-readable type name
     */
    getTypeName(typeEnum) {
        for (const [name, value] of Object.entries(this.TYPE_ENUM)) {
            if (value === typeEnum) {
                return name;
            }
        }
        return `Unknown(${typeEnum})`;
    }

    readArrayValue(unpacked) {
        const { type, isCompressed } = unpacked;
        const arraySize = this.readInt64();

        // Check if this is a compressed integer array
        if (isCompressed && (type === this.TYPE_ENUM.Int || type === this.TYPE_ENUM.UInt)) {
            // Read compressed size
            const compressedSize = this.readInt64();

            // Read compressed data
            const compressedData = this.readBytes(compressedSize);

            try {
                // First try LZ4 decompression (if wrapped in LZ4)
                // For now, assume it's already the integer-coded format
                const buffer = compressedData.buffer.slice(
                    compressedData.byteOffset,
                    compressedData.byteOffset + compressedData.byteLength
                );

                // Decompress integers
                const result = type === this.TYPE_ENUM.UInt
                    ? IntegerCompression.decompressUInt32(buffer, arraySize)
                    : IntegerCompression.decompressIntegers(buffer, arraySize, false);

                return Array.from(result);
            } catch (e) {
                console.warn('Failed to decompress integer array:', e);
                // Fall back to reading uncompressed
            }
        }

        // Regular array reading
        const array = [];

        for (let i = 0; i < arraySize; i++) {
            switch (type) {
                case this.TYPE_ENUM.Bool:
                    array.push(Boolean(this.readUInt8()));
                    break;
                case this.TYPE_ENUM.UChar:
                    array.push(this.readUInt8());
                    break;
                case this.TYPE_ENUM.Int:
                    array.push(this.readInt32());
                    break;
                case this.TYPE_ENUM.UInt:
                    array.push(this.readUInt32());
                    break;
                case this.TYPE_ENUM.Int64:
                    array.push(this.readInt64());
                    break;
                case this.TYPE_ENUM.UInt64:
                    array.push(Number(this.readUInt64()));
                    break;
                case this.TYPE_ENUM.Half:
                    const half = HalfFloat.readHalf(this.view, this.offset, true);
                    this.offset += 2;
                    array.push(half);
                    break;
                case this.TYPE_ENUM.Float:
                    array.push(this.readFloat());
                    break;
                case this.TYPE_ENUM.Double:
                    array.push(this.readDouble());
                    break;

                // Vectors
                case this.TYPE_ENUM.Vec2f:
                    array.push([this.readFloat(), this.readFloat()]);
                    break;
                case this.TYPE_ENUM.Vec3f:
                    array.push([this.readFloat(), this.readFloat(), this.readFloat()]);
                    break;
                case this.TYPE_ENUM.Vec4f:
                    array.push([this.readFloat(), this.readFloat(), this.readFloat(), this.readFloat()]);
                    break;
                case this.TYPE_ENUM.Vec2d:
                    array.push([this.readDouble(), this.readDouble()]);
                    break;
                case this.TYPE_ENUM.Vec3d:
                    array.push([this.readDouble(), this.readDouble(), this.readDouble()]);
                    break;
                case this.TYPE_ENUM.Vec4d:
                    array.push([this.readDouble(), this.readDouble(), this.readDouble(), this.readDouble()]);
                    break;
                case this.TYPE_ENUM.Vec2i:
                    array.push([this.readInt32(), this.readInt32()]);
                    break;
                case this.TYPE_ENUM.Vec3i:
                    array.push([this.readInt32(), this.readInt32(), this.readInt32()]);
                    break;
                case this.TYPE_ENUM.Vec4i:
                    array.push([this.readInt32(), this.readInt32(), this.readInt32(), this.readInt32()]);
                    break;

                // Strings
                case this.TYPE_ENUM.Token:
                case this.TYPE_ENUM.String:
                case this.TYPE_ENUM.AssetPath:
                    const tokenIndex = this.readUInt32();
                    array.push(this.tokens[tokenIndex] || '');
                    break;

                // Quaternions
                case this.TYPE_ENUM.Quatf:
                    array.push([this.readFloat(), this.readFloat(), this.readFloat(), this.readFloat()]);
                    break;
                case this.TYPE_ENUM.Quatd:
                    array.push([this.readDouble(), this.readDouble(), this.readDouble(), this.readDouble()]);
                    break;

                default:
                    console.warn(`Unsupported array type: ${type}`);
                    array.push(null);
            }
        }

        return array;
    }

    //=========================================================================
    // Scene Building
    //=========================================================================

    buildScene() {
        const scene = {
            version: this.bootstrap.version,
            prims: [],
            materials: [],
            textures: [],
            lights: [],
            metadata: {}
        };

        // Build prims from specs
        for (const spec of this.specs) {
            if (spec.specType === this.SPEC_TYPE.Prim ||
                spec.specType === this.SPEC_TYPE.PseudoRoot) {

                const prim = this.buildPrim(spec);
                if (prim) {
                    scene.prims.push(prim);

                    // Categorize by type
                    if (prim.typeName && prim.typeName.startsWith('Mesh')) {
                        // It's a mesh
                    } else if (prim.typeName && prim.typeName.includes('Material')) {
                        scene.materials.push(prim);
                    } else if (prim.typeName && prim.typeName.includes('Light')) {
                        scene.lights.push(prim);
                    }
                }
            }
        }

        // Build relationships and attach to prims
        for (const spec of this.specs) {
            if (spec.specType === this.SPEC_TYPE.Relationship) {
                const relationship = this.buildRelationship(spec);
                if (relationship) {
                    // Find parent prim and attach relationship
                    const parentPath = this.getParentPath(relationship.path);
                    const parentPrim = scene.prims.find(p => p.path === parentPath);
                    if (parentPrim) {
                        const relName = this.getPropertyName(relationship.path);
                        parentPrim.relationships[relName] = relationship.targetPaths;
                    }
                }
            }
        }

        return scene;
    }

    buildPrim(spec) {
        const path = this.paths[spec.pathIndex] || '';
        const fieldSet = this.fieldSets[spec.fieldSetIndex] || [];

        const prim = {
            path,
            type: spec.specType,
            typeName: null,
            properties: {},
            relationships: {},
            children: []
        };

        // Read field values
        for (const fieldIndex of fieldSet) {
            const field = this.fields[fieldIndex];
            if (!field) continue;

            const fieldName = field.name;
            const value = this.readValue(field.valueRep);

            if (fieldName === 'typeName') {
                prim.typeName = value;
            } else {
                prim.properties[fieldName] = value;
            }
        }

        return prim;
    }

    buildRelationship(spec) {
        const path = this.paths[spec.pathIndex] || '';
        const fieldSet = this.fieldSets[spec.fieldSetIndex] || [];

        const relationship = {
            path,
            targetPaths: []
        };

        // Read field values
        for (const fieldIndex of fieldSet) {
            const field = this.fields[fieldIndex];
            if (!field) continue;

            const fieldName = field.name;
            const value = this.readValue(field.valueRep);

            // In USD, relationships have a 'targetPaths' field
            if (fieldName === 'targetPaths') {
                // targetPaths can be an array of paths or a single path
                if (Array.isArray(value)) {
                    relationship.targetPaths = value;
                } else if (value) {
                    relationship.targetPaths = [value];
                }
            }
        }

        return relationship;
    }

    getParentPath(path) {
        if (!path || path === '/') return null;
        const lastSlash = path.lastIndexOf('/');
        if (lastSlash === 0) return '/';
        if (lastSlash === -1) return null;
        return path.substring(0, lastSlash);
    }

    getPropertyName(path) {
        if (!path) return '';
        const lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        const propName = path.substring(lastSlash + 1);
        // Property paths use . separator, e.g., /World/Mesh.material:binding
        if (propName.includes('.')) {
            return propName.split('.').pop();
        }
        return propName;
    }

    //=========================================================================
    // Schema-Specific Parsing
    //=========================================================================

    /**
     * Extract geometry data from a mesh prim
     */
    extractMeshGeometry(prim) {
        const geometry = {
            points: null,
            normals: null,
            uvs: null,
            faceVertexIndices: null,
            faceVertexCounts: null,
            subdivisionScheme: 'none'
        };

        // Get standard attributes
        if (prim.properties.points) {
            geometry.points = prim.properties.points;
        }
        if (prim.properties.normals) {
            geometry.normals = prim.properties.normals;
        }
        if (prim.properties.faceVertexIndices) {
            geometry.faceVertexIndices = prim.properties.faceVertexIndices;
        }
        if (prim.properties.faceVertexCounts) {
            geometry.faceVertexCounts = prim.properties.faceVertexCounts;
        }
        if (prim.properties.subdivisionScheme) {
            geometry.subdivisionScheme = prim.properties.subdivisionScheme;
        }

        // Look for UVs in primvars
        // UVs are typically stored as primvars:st or primvars:uv
        for (const [key, value] of Object.entries(prim.properties)) {
            if (key.includes('primvars:st') || key.includes('primvars:uv')) {
                geometry.uvs = value;
            }
        }

        return geometry;
    }

    /**
     * Extract transform data from an Xform prim
     */
    extractTransform(prim) {
        const transform = {
            matrix: null,
            translation: null,
            rotation: null,
            scale: null
        };

        // Look for xformOp attributes
        for (const [key, value] of Object.entries(prim.properties)) {
            if (key.startsWith('xformOp:')) {
                const opType = key.split(':')[1];

                if (opType === 'translate') {
                    transform.translation = value;
                } else if (opType === 'rotateXYZ' || opType === 'rotate') {
                    transform.rotation = value;
                } else if (opType === 'scale') {
                    transform.scale = value;
                } else if (opType === 'transform') {
                    transform.matrix = value;
                }
            }
        }

        return transform;
    }

    /**
     * Extract light parameters
     */
    extractLight(prim) {
        const light = {
            type: prim.typeName,
            color: [1, 1, 1],
            intensity: 1.0,
            exposure: 0.0,
            width: 1.0,
            height: 1.0,
            radius: 0.5,
            angle: 0.0
        };

        // Common light parameters
        if (prim.properties['inputs:color']) {
            light.color = prim.properties['inputs:color'];
        }
        if (prim.properties['inputs:intensity']) {
            light.intensity = prim.properties['inputs:intensity'];
        }
        if (prim.properties['inputs:exposure']) {
            light.exposure = prim.properties['inputs:exposure'];
        }

        // Shape-specific parameters
        if (prim.properties['inputs:width']) {
            light.width = prim.properties['inputs:width'];
        }
        if (prim.properties['inputs:height']) {
            light.height = prim.properties['inputs:height'];
        }
        if (prim.properties['inputs:radius']) {
            light.radius = prim.properties['inputs:radius'];
        }
        if (prim.properties['inputs:angle']) {
            light.angle = prim.properties['inputs:angle'];
        }

        return light;
    }

    /**
     * Extract material/shader data
     */
    extractMaterial(prim) {
        const material = {
            name: prim.path,
            surface: null,
            displacement: null,
            volume: null,
            inputs: {},
            outputs: {}
        };

        // Look for shader outputs
        for (const [key, value] of Object.entries(prim.properties)) {
            if (key.startsWith('outputs:')) {
                material.outputs[key.replace('outputs:', '')] = value;
            } else if (key.startsWith('inputs:')) {
                material.inputs[key.replace('inputs:', '')] = value;
            }
        }

        return material;
    }
}

// Export for use in browser and Node.js
export { USDCParser };
export default USDCParser;
