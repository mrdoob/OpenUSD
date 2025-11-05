#!/bin/bash
# Build Three.js-compatible USDC Parser

echo "Building Three.js-compatible USDCParser..."
echo "This will create a ~2600 line file combining:"
echo "  - Core USDC parsing logic"
echo "  - Three.js scene building"
echo "  - Helper classes (HalfFloat, IntegerCompression, SimpleLZ4)"

# We'll manually create the integrated file due to its complexity
echo ""
echo "Files needed:"
echo "  - ../src/USDCParser.js (parsing logic)"
echo "  - ../src/USDZLoader.js (scene building)"
echo "  - ../src/IntegerCompression.js (helpers)"
echo ""
echo "Output:"
echo "  - USDCParser.js (Three.js compatible)"
echo ""
echo "Run: node build-parser.js to generate the integrated file"
