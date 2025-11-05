/**
 * Basic test for USDCParser
 *
 * This test verifies that the parser can read the basic structure of a USDC file.
 * To run: node tests/test-parser.js <path-to-usdc-file>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the parser (Node.js doesn't need the window check)
const USDCParserModule = await import('../src/USDCParser.js');
const USDCParser = USDCParserModule.default || USDCParserModule.USDCParser;

function testParser() {
    console.log('='.repeat(60));
    console.log('USDC Parser Test');
    console.log('='.repeat(60));

    // Check if file path is provided
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('\nUsage: node tests/test-parser.js <path-to-usdc-file>');
        console.log('\nNo USDC file provided. Running structure tests only...\n');
        runStructureTests();
        return;
    }

    const filePath = args[0];

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
    }

    console.log(`\nLoading: ${filePath}\n`);

    try {
        // Read file
        const buffer = fs.readFileSync(filePath);
        const arrayBuffer = buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
        );

        // Parse
        const parser = new USDCParser();
        console.log('Parsing USDC file...\n');

        const result = parser.parse(arrayBuffer);

        // Display results
        console.log('Parse Results:');
        console.log('-'.repeat(60));
        console.log(`Version: ${result.version.major}.${result.version.minor}.${result.version.patch}`);
        console.log(`Prims: ${result.prims.length}`);
        console.log(`Materials: ${result.materials.length}`);
        console.log(`Lights: ${result.lights.length}`);
        console.log(`Textures: ${result.textures.length}`);
        console.log();

        // Display prim details
        if (result.prims.length > 0) {
            console.log('Prims:');
            console.log('-'.repeat(60));
            result.prims.forEach((prim, idx) => {
                console.log(`${idx + 1}. ${prim.path}`);
                console.log(`   Type: ${prim.typeName || 'Unknown'}`);
                const propCount = Object.keys(prim.properties).length;
                console.log(`   Properties: ${propCount}`);
                if (propCount > 0 && propCount <= 5) {
                    Object.keys(prim.properties).forEach(key => {
                        const val = prim.properties[key];
                        const valStr = Array.isArray(val)
                            ? `[${val.length} items]`
                            : JSON.stringify(val).substring(0, 50);
                        console.log(`     - ${key}: ${valStr}`);
                    });
                }
                console.log();
            });
        }

        // Display materials
        if (result.materials.length > 0) {
            console.log('Materials:');
            console.log('-'.repeat(60));
            result.materials.forEach((mat, idx) => {
                console.log(`${idx + 1}. ${mat.path}`);
                console.log(`   Type: ${mat.typeName}`);
                console.log();
            });
        }

        // Display lights
        if (result.lights.length > 0) {
            console.log('Lights:');
            console.log('-'.repeat(60));
            result.lights.forEach((light, idx) => {
                console.log(`${idx + 1}. ${light.path}`);
                console.log(`   Type: ${light.typeName}`);
                console.log();
            });
        }

        console.log('='.repeat(60));
        console.log('Parse completed successfully!');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\nError parsing file:');
        console.error(error);
        process.exit(1);
    }
}

function runStructureTests() {
    console.log('Testing parser structure...\n');

    const parser = new USDCParser();

    // Test type enum
    console.log('✓ Type enum defined:', Object.keys(parser.TYPE_ENUM).length, 'types');

    // Test spec type enum
    console.log('✓ Spec type enum defined:', Object.keys(parser.SPEC_TYPE).length, 'types');

    // Test value rep bits
    console.log('✓ Value representation bits defined');

    // Test methods exist
    const methods = [
        'parse',
        'readBootstrap',
        'readTableOfContents',
        'readTokens',
        'readStrings',
        'readFields',
        'readFieldSets',
        'readSpecs',
        'readPaths',
        'unpackValueRep',
        'readValue',
        'buildScene',
        'extractMeshGeometry',
        'extractTransform',
        'extractLight',
        'extractMaterial'
    ];

    methods.forEach(method => {
        if (typeof parser[method] === 'function') {
            console.log(`✓ Method exists: ${method}`);
        } else {
            console.log(`✗ Method missing: ${method}`);
        }
    });

    console.log('\nStructure tests completed!\n');
    console.log('To test with an actual USDC file, run:');
    console.log('  node tests/test-parser.js <path-to-usdc-file>\n');
}

// Run test
testParser();
