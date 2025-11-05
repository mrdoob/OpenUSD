/**
 * Integer Compression/Decompression for USDC format
 *
 * Implements the integer coding scheme used in USD Crate files.
 * This is a delta+classification encoding followed by LZ4 compression.
 *
 * Algorithm:
 * 1. Transform to delta encoding (each value = current - previous)
 * 2. Find most common delta value
 * 3. Encode each delta with 2-bit code:
 *    00: most common value
 *    01: 8-bit integer
 *    10: 16-bit integer
 *    11: 32-bit integer
 * 4. Write: commonValue + codes + variable-length data
 *
 * @author OpenUSD Contributors
 * @license Apache-2.0
 */

class IntegerCompression {
    /**
     * Decompress integer array (without LZ4 - assumes pre-decompressed)
     * For full decompression, LZ4 decompress first, then call this.
     */
    static decompressIntegers(buffer, numInts, is64Bit = false) {
        const view = new DataView(buffer);
        let offset = 0;

        // Read common value (most frequent delta)
        const commonValue = is64Bit
            ? Number(view.getBigInt64(offset, true))
            : view.getInt32(offset, true);
        offset += is64Bit ? 8 : 4;

        // Calculate codes section size (2 bits per integer, rounded up to bytes)
        const numCodesBytes = Math.ceil((numInts * 2) / 8);

        // Codes and variable integer data
        const codesStart = offset;
        const vintsStart = offset + numCodesBytes;

        // Decode
        const result = is64Bit ? new BigInt64Array(numInts) : new Int32Array(numInts);
        let prevVal = is64Bit ? 0n : 0;
        let codeOffset = codesStart;
        let vintOffset = vintsStart;

        for (let i = 0; i < numInts; i++) {
            // Read 2-bit code
            const byteIndex = Math.floor((i * 2) / 8);
            const bitIndex = (i * 2) % 8;
            const codeByte = view.getUint8(codesStart + byteIndex);
            const code = (codeByte >> bitIndex) & 0x03;

            let delta;
            switch (code) {
                case 0: // Common value
                    delta = is64Bit ? BigInt(commonValue) : commonValue;
                    break;
                case 1: // 8-bit
                    delta = is64Bit
                        ? BigInt(view.getInt8(vintOffset))
                        : view.getInt8(vintOffset);
                    vintOffset += 1;
                    break;
                case 2: // 16-bit (32-bit) or 32-bit (64-bit)
                    if (is64Bit) {
                        delta = BigInt(view.getInt32(vintOffset, true));
                        vintOffset += 4;
                    } else {
                        delta = view.getInt16(vintOffset, true);
                        vintOffset += 2;
                    }
                    break;
                case 3: // 32-bit (32-bit) or 64-bit (64-bit)
                    if (is64Bit) {
                        delta = view.getBigInt64(vintOffset, true);
                        vintOffset += 8;
                    } else {
                        delta = view.getInt32(vintOffset, true);
                        vintOffset += 4;
                    }
                    break;
            }

            prevVal = is64Bit ? prevVal + delta : prevVal + delta;
            result[i] = prevVal;
        }

        return result;
    }

    /**
     * Decompress uint32 array
     */
    static decompressUInt32(buffer, numInts) {
        const signed = this.decompressIntegers(buffer, numInts, false);
        // Convert to unsigned
        const result = new Uint32Array(numInts);
        for (let i = 0; i < numInts; i++) {
            result[i] = signed[i] >>> 0; // Convert to unsigned
        }
        return result;
    }

    /**
     * Decompress uint64 array
     */
    static decompressUInt64(buffer, numInts) {
        const signed = this.decompressIntegers(buffer, numInts, true);
        // Convert to unsigned (BigInt)
        const result = new BigUint64Array(numInts);
        for (let i = 0; i < numInts; i++) {
            result[i] = BigInt.asUintN(64, signed[i]);
        }
        return result;
    }
}

/**
 * Simple LZ4 decompression
 * Note: This is a simplified implementation. For production, use a proper LZ4 library.
 * This may not handle all LZ4 block formats correctly.
 */
class SimpleLZ4 {
    static decompress(compressedBuffer, decompressedSize) {
        const input = new Uint8Array(compressedBuffer);
        const output = new Uint8Array(decompressedSize);

        let inPos = 0;
        let outPos = 0;

        try {
            while (inPos < input.length && outPos < decompressedSize) {
                // Read token
                const token = input[inPos++];

                // Literal length
                let literalLength = token >> 4;
                if (literalLength === 15) {
                    let byte;
                    do {
                        byte = input[inPos++];
                        literalLength += byte;
                    } while (byte === 255);
                }

                // Copy literals
                for (let i = 0; i < literalLength && outPos < decompressedSize; i++) {
                    output[outPos++] = input[inPos++];
                }

                if (inPos >= input.length) break;

                // Read offset
                const offset = input[inPos++] | (input[inPos++] << 8);
                if (offset === 0) break;

                // Match length
                let matchLength = (token & 0x0F) + 4;
                if ((token & 0x0F) === 15) {
                    let byte;
                    do {
                        byte = input[inPos++];
                        matchLength += byte;
                    } while (byte === 255);
                }

                // Copy match
                let matchPos = outPos - offset;
                for (let i = 0; i < matchLength && outPos < decompressedSize; i++) {
                    output[outPos++] = output[matchPos++];
                }
            }
        } catch (e) {
            console.warn('LZ4 decompression error:', e);
            // Return what we have
        }

        return output.buffer;
    }
}

export { IntegerCompression, SimpleLZ4 };
export default IntegerCompression;
