/**
 * USDLoader for Three.js
 *
 * A JavaScript-only loader for Universal Scene Description (USD) files.
 * Supports USDA (ASCII) format with geometries, materials, textures, scene graph, and lights.
 *
 * Feature parity targets:
 * - Geometries: Mesh, Sphere, Cube, Cylinder, Cone, Plane
 * - Materials: UsdPreviewSurface with PBR workflow
 * - Textures: UV mapping and texture loading
 * - Scene Graph: Hierarchical transforms (Xform)
 * - Lights: Distant, Sphere, Rect, Disk, Dome lights
 *
 * @author Claude AI
 * @license Apache-2.0
 */

import {
	BufferGeometry,
	FileLoader,
	Float32BufferAttribute,
	Group,
	Loader,
	LoaderUtils,
	Material,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	Points,
	PointsMaterial,
	BoxGeometry,
	SphereGeometry,
	CylinderGeometry,
	ConeGeometry,
	PlaneGeometry,
	DirectionalLight,
	PointLight,
	RectAreaLight,
	HemisphereLight,
	Color,
	TextureLoader,
	RepeatWrapping,
	ClampToEdgeWrapping,
	MirroredRepeatWrapping,
	LinearFilter,
	LinearMipmapLinearFilter,
	sRGBEncoding,
	Matrix4,
	Vector3,
	Quaternion,
	Euler,
	MathUtils
} from 'three';

class USDLoader extends Loader {

	constructor( manager ) {

		super( manager );
		this.textureLoader = new TextureLoader( this.manager );

	}

	load( url, onLoad, onProgress, onError ) {

		const scope = this;
		const loader = new FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setResponseType( 'text' );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );

		loader.load( url, function ( text ) {

			try {

				onLoad( scope.parse( text, url ) );

			} catch ( e ) {

				if ( onError ) {

					onError( e );

				} else {

					console.error( e );

				}

				scope.manager.itemError( url );

			}

		}, onProgress, onError );

	}

	parse( text, url ) {

		const parser = new USDAParser();
		const usdData = parser.parse( text );

		const builder = new USDSceneBuilder( this, url );
		const scene = builder.build( usdData );

		return scene;

	}

}

/**
 * USDA (ASCII) Parser
 * Parses USD ASCII format into a structured data object
 */
class USDAParser {

	constructor() {

		this.stage = {
			metadata: {},
			prims: [],
			primDict: {}
		};

	}

	parse( text ) {

		// Remove comments
		const lines = text.split( '\n' );
		const cleanedLines = lines.filter( line => {
			const trimmed = line.trim();
			return trimmed.length > 0 && ! trimmed.startsWith( '#' );
		} );

		const cleanText = cleanedLines.join( '\n' );

		// Parse stage metadata
		this.parseStageMetadata( cleanText );

		// Parse prims recursively
		this.parsePrims( cleanText );

		return this.stage;

	}

	parseStageMetadata( text ) {

		// Match stage metadata in parentheses at the beginning
		const metadataMatch = text.match( /^\s*\(([^)]*)\)/m );
		if ( metadataMatch ) {

			const metadata = metadataMatch[ 1 ];
			const pairs = metadata.split( /\n|,/ );

			pairs.forEach( pair => {

				const match = pair.match( /(\w+)\s*=\s*(.+)/ );
				if ( match ) {

					this.stage.metadata[ match[ 1 ].trim() ] = this.parseValue( match[ 2 ].trim() );

				}

			} );

		}

	}

	parsePrims( text ) {

		// Match prim definitions: def/over/class Type "Name"
		const primPattern = /(def|over|class)\s+(\w+)\s+"([^"]+)"\s*(\([^)]*\))?\s*\{/g;

		let match;
		const primStack = [];
		const primInfos = [];

		while ( ( match = primPattern.exec( text ) ) !== null ) {

			const specifier = match[ 1 ];
			const type = match[ 2 ];
			const name = match[ 3 ];
			const metadata = match[ 4 ];
			const startIdx = match.index;

			primInfos.push( {
				specifier,
				type,
				name,
				metadata,
				startIdx,
				match: match[ 0 ]
			} );

		}

		// Find prim content and nesting
		primInfos.forEach( ( info, idx ) => {

			const startIdx = info.startIdx + info.match.length;
			const nextIdx = idx < primInfos.length - 1 ? primInfos[ idx + 1 ].startIdx : text.length;

			// Find matching closing brace
			let braceCount = 1;
			let endIdx = startIdx;

			for ( let i = startIdx; i < text.length && braceCount > 0; i ++ ) {

				if ( text[ i ] === '{' ) braceCount ++;
				if ( text[ i ] === '}' ) braceCount --;
				if ( braceCount === 0 ) {

					endIdx = i;
					break;

				}

			}

			info.content = text.substring( startIdx, endIdx );
			info.endIdx = endIdx;

		} );

		// Build hierarchy
		primInfos.forEach( info => {

			const prim = {
				specifier: info.specifier,
				type: info.type,
				name: info.name,
				path: '/' + info.name,
				attributes: {},
				children: [],
				relationships: {},
				metadata: this.parseMetadata( info.metadata )
			};

			this.parseAttributes( info.content, prim );
			this.parseRelationships( info.content, prim );
			this.parseChildren( info.content, prim );

			this.stage.prims.push( prim );
			this.stage.primDict[ prim.path ] = prim;

		} );

		// Build proper paths and hierarchy
		this.buildHierarchy();

		return this.stage;

	}

	parseMetadata( metadataStr ) {

		const metadata = {};
		if ( ! metadataStr ) return metadata;

		const content = metadataStr.slice( 1, - 1 ); // Remove parentheses
		const pairs = content.split( /,(?![^()]*\))/ ); // Split by comma not in parentheses

		pairs.forEach( pair => {

			const match = pair.match( /(\w+)\s*=\s*(.+)/ );
			if ( match ) {

				metadata[ match[ 1 ].trim() ] = this.parseValue( match[ 2 ].trim() );

			}

		} );

		return metadata;

	}

	parseAttributes( content, prim ) {

		// Match various attribute patterns
		// Type name = value
		// Type[] name = [values]
		// Type name.timeSamples = { ... }
		// Type name.connect = <path>

		const attrPattern = /(\w+(?:\[\])?)\s+(\w+(?::[\w:]+)?(?:\.[\w:]+)?)\s*=\s*([^;\n]+)/g;
		let match;

		while ( ( match = attrPattern.exec( content ) ) !== null ) {

			const type = match[ 1 ];
			const name = match[ 2 ];
			const value = match[ 3 ].trim();

			// Handle connections
			if ( name.includes( '.connect' ) ) {

				const baseName = name.split( '.' )[ 0 ];
				if ( ! prim.attributes[ baseName ] ) {

					prim.attributes[ baseName ] = {};

				}
				prim.attributes[ baseName ].connection = this.parseValue( value );

			} else {

				prim.attributes[ name ] = {
					type: type,
					value: this.parseValue( value )
				};

			}

		}

	}

	parseRelationships( content, prim ) {

		// Match relationships: rel name = <path>
		const relPattern = /rel\s+(\w+(?::[\w:]+)?)\s*=\s*([^;\n]+)/g;
		let match;

		while ( ( match = relPattern.exec( content ) ) !== null ) {

			const name = match[ 1 ];
			const value = match[ 2 ].trim();
			prim.relationships[ name ] = this.parseValue( value );

		}

	}

	parseChildren( content, parentPrim ) {

		// Parse nested prims
		const primPattern = /(def|over|class)\s+(\w+)\s+"([^"]+)"/g;
		let match;

		while ( ( match = primPattern.exec( content ) ) !== null ) {

			const specifier = match[ 1 ];
			const type = match[ 2 ];
			const name = match[ 3 ];

			// Find the content for this child prim
			let startIdx = match.index + match[ 0 ].length;

			// Skip to opening brace
			while ( startIdx < content.length && content[ startIdx ] !== '{' ) {

				startIdx ++;

			}

			if ( startIdx >= content.length ) continue;
			startIdx ++; // Skip opening brace

			// Find matching closing brace
			let braceCount = 1;
			let endIdx = startIdx;

			for ( let i = startIdx; i < content.length && braceCount > 0; i ++ ) {

				if ( content[ i ] === '{' ) braceCount ++;
				if ( content[ i ] === '}' ) braceCount --;
				if ( braceCount === 0 ) {

					endIdx = i;
					break;

				}

			}

			const childContent = content.substring( startIdx, endIdx );

			const childPrim = {
				specifier: specifier,
				type: type,
				name: name,
				path: parentPrim.path + '/' + name,
				attributes: {},
				children: [],
				relationships: {},
				parent: parentPrim
			};

			this.parseAttributes( childContent, childPrim );
			this.parseRelationships( childContent, childPrim );
			this.parseChildren( childContent, childPrim );

			parentPrim.children.push( childPrim );
			this.stage.primDict[ childPrim.path ] = childPrim;

		}

	}

	buildHierarchy() {

		// Update paths based on hierarchy
		const updatePaths = ( prim, parentPath = '' ) => {

			prim.path = parentPath + '/' + prim.name;
			this.stage.primDict[ prim.path ] = prim;

			prim.children.forEach( child => {

				child.parent = prim;
				updatePaths( child, prim.path );

			} );

		};

		this.stage.prims.forEach( prim => {

			if ( ! prim.parent ) {

				updatePaths( prim );

			}

		} );

	}

	parseValue( valueStr ) {

		valueStr = valueStr.trim();

		// Path reference: </path/to/prim>
		if ( valueStr.startsWith( '<' ) && valueStr.endsWith( '>' ) ) {

			return { type: 'path', value: valueStr.slice( 1, - 1 ) };

		}

		// Asset reference: @path/to/file@
		if ( valueStr.startsWith( '@' ) && valueStr.endsWith( '@' ) ) {

			return { type: 'asset', value: valueStr.slice( 1, - 1 ) };

		}

		// String: "value"
		if ( valueStr.startsWith( '"' ) && valueStr.endsWith( '"' ) ) {

			return valueStr.slice( 1, - 1 );

		}

		// Array: [...]
		if ( valueStr.startsWith( '[' ) && valueStr.endsWith( ']' ) ) {

			const content = valueStr.slice( 1, - 1 );
			if ( content.trim() === '' ) return [];

			const items = this.splitArrayItems( content );
			return items.map( item => this.parseValue( item ) );

		}

		// Tuple: (x, y, z)
		if ( valueStr.startsWith( '(' ) && valueStr.endsWith( ')' ) ) {

			const content = valueStr.slice( 1, - 1 );
			const items = content.split( ',' ).map( s => s.trim() );
			return items.map( item => parseFloat( item ) );

		}

		// Boolean
		if ( valueStr === 'true' ) return true;
		if ( valueStr === 'false' ) return false;

		// Number
		if ( /^-?\d+\.?\d*$/.test( valueStr ) ) {

			return parseFloat( valueStr );

		}

		// Token/String
		return valueStr;

	}

	splitArrayItems( content ) {

		const items = [];
		let current = '';
		let depth = 0;

		for ( let i = 0; i < content.length; i ++ ) {

			const char = content[ i ];

			if ( char === '(' || char === '[' ) {

				depth ++;
				current += char;

			} else if ( char === ')' || char === ']' ) {

				depth --;
				current += char;

			} else if ( char === ',' && depth === 0 ) {

				if ( current.trim() ) {

					items.push( current.trim() );

				}
				current = '';

			} else {

				current += char;

			}

		}

		if ( current.trim() ) {

			items.push( current.trim() );

		}

		return items;

	}

}

/**
 * USD Scene Builder
 * Converts parsed USD data into Three.js scene objects
 */
class USDSceneBuilder {

	constructor( loader, url ) {

		this.loader = loader;
		this.baseUrl = LoaderUtils.extractUrlBase( url );
		this.textureLoader = loader.textureLoader;
		this.materials = {};
		this.textures = {};

	}

	build( usdData ) {

		const scene = {
			scene: new Group(),
			metadata: usdData.metadata,
			materials: {},
			textures: {},
			animations: []
		};

		// Build scene hierarchy
		usdData.prims.forEach( prim => {

			if ( ! prim.parent ) {

				const obj = this.buildPrim( prim, usdData );
				if ( obj ) {

					scene.scene.add( obj );

				}

			}

		} );

		scene.materials = this.materials;
		scene.textures = this.textures;

		return scene;

	}

	buildPrim( prim, usdData ) {

		switch ( prim.type ) {

			case 'Xform':
			case 'Scope':
				return this.buildXform( prim, usdData );

			case 'Mesh':
				return this.buildMesh( prim, usdData );

			case 'Sphere':
				return this.buildSphere( prim, usdData );

			case 'Cube':
				return this.buildCube( prim, usdData );

			case 'Cylinder':
				return this.buildCylinder( prim, usdData );

			case 'Cone':
				return this.buildCone( prim, usdData );

			case 'Plane':
				return this.buildPlane( prim, usdData );

			case 'Points':
				return this.buildPoints( prim, usdData );

			case 'Material':
				this.buildMaterial( prim, usdData );
				return null;

			case 'Shader':
				return null; // Handled by material

			case 'DistantLight':
				return this.buildDistantLight( prim, usdData );

			case 'SphereLight':
				return this.buildSphereLight( prim, usdData );

			case 'RectLight':
				return this.buildRectLight( prim, usdData );

			case 'DiskLight':
				return this.buildDiskLight( prim, usdData );

			case 'DomeLight':
				return this.buildDomeLight( prim, usdData );

			default:
				console.warn( `USDLoader: Unknown prim type "${prim.type}"` );
				return this.buildXform( prim, usdData );

		}

	}

	buildXform( prim, usdData ) {

		const group = new Group();
		group.name = prim.name;

		// Apply transforms
		this.applyTransform( group, prim );

		// Build children
		prim.children.forEach( childPrim => {

			const childObj = this.buildPrim( childPrim, usdData );
			if ( childObj ) {

				group.add( childObj );

			}

		} );

		return group;

	}

	applyTransform( object, prim ) {

		// USD transform attributes
		const attrs = prim.attributes;

		if ( attrs[ 'xformOp:translate' ] ) {

			const t = attrs[ 'xformOp:translate' ].value;
			object.position.set( t[ 0 ], t[ 1 ], t[ 2 ] );

		}

		if ( attrs[ 'xformOp:rotateXYZ' ] ) {

			const r = attrs[ 'xformOp:rotateXYZ' ].value;
			object.rotation.set(
				MathUtils.degToRad( r[ 0 ] ),
				MathUtils.degToRad( r[ 1 ] ),
				MathUtils.degToRad( r[ 2 ] )
			);

		}

		if ( attrs[ 'xformOp:scale' ] ) {

			const s = attrs[ 'xformOp:scale' ].value;
			object.scale.set( s[ 0 ], s[ 1 ], s[ 2 ] );

		}

		// Handle xformOpOrder
		if ( attrs[ 'xformOpOrder' ] ) {

			// TODO: Apply transforms in specified order
			// For now we assume translate, rotate, scale order

		}

	}

	buildMesh( prim, usdData ) {

		const attrs = prim.attributes;

		const geometry = new BufferGeometry();

		// Points (vertices)
		if ( attrs[ 'points' ] ) {

			const points = attrs[ 'points' ].value;
			const positions = [];

			points.forEach( point => {

				positions.push( point[ 0 ], point[ 1 ], point[ 2 ] );

			} );

			geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );

		}

		// Indices
		if ( attrs[ 'faceVertexIndices' ] && attrs[ 'faceVertexCounts' ] ) {

			const indices = attrs[ 'faceVertexIndices' ].value;
			const counts = attrs[ 'faceVertexCounts' ].value;

			// Triangulate faces
			const triangulatedIndices = this.triangulateFaces( indices, counts );
			geometry.setIndex( triangulatedIndices );

		}

		// Normals
		if ( attrs[ 'normals' ] ) {

			const normals = attrs[ 'normals' ].value;
			const normalArray = [];

			normals.forEach( normal => {

				normalArray.push( normal[ 0 ], normal[ 1 ], normal[ 2 ] );

			} );

			geometry.setAttribute( 'normal', new Float32BufferAttribute( normalArray, 3 ) );

		} else {

			geometry.computeVertexNormals();

		}

		// UV coordinates (primvars:st)
		if ( attrs[ 'primvars:st' ] ) {

			const uvs = attrs[ 'primvars:st' ].value;
			const uvArray = [];

			uvs.forEach( uv => {

				uvArray.push( uv[ 0 ], uv[ 1 ] );

			} );

			geometry.setAttribute( 'uv', new Float32BufferAttribute( uvArray, 2 ) );

		}

		// Vertex colors (primvars:displayColor)
		if ( attrs[ 'primvars:displayColor' ] ) {

			const colors = attrs[ 'primvars:displayColor' ].value;
			const colorArray = [];

			colors.forEach( color => {

				colorArray.push( color[ 0 ], color[ 1 ], color[ 2 ] );

			} );

			geometry.setAttribute( 'color', new Float32BufferAttribute( colorArray, 3 ) );

		}

		// Get material
		const material = this.getMaterialForPrim( prim, usdData );

		const mesh = new Mesh( geometry, material );
		mesh.name = prim.name;

		this.applyTransform( mesh, prim );

		// Build children
		prim.children.forEach( childPrim => {

			const childObj = this.buildPrim( childPrim, usdData );
			if ( childObj ) {

				mesh.add( childObj );

			}

		} );

		return mesh;

	}

	triangulateFaces( indices, counts ) {

		const triangulated = [];
		let offset = 0;

		counts.forEach( count => {

			if ( count === 3 ) {

				// Already a triangle
				triangulated.push( indices[ offset ], indices[ offset + 1 ], indices[ offset + 2 ] );

			} else if ( count === 4 ) {

				// Quad -> 2 triangles
				const i0 = indices[ offset ];
				const i1 = indices[ offset + 1 ];
				const i2 = indices[ offset + 2 ];
				const i3 = indices[ offset + 3 ];

				triangulated.push( i0, i1, i2 );
				triangulated.push( i0, i2, i3 );

			} else if ( count > 4 ) {

				// N-gon -> triangle fan
				const i0 = indices[ offset ];
				for ( let i = 1; i < count - 1; i ++ ) {

					triangulated.push( i0, indices[ offset + i ], indices[ offset + i + 1 ] );

				}

			}

			offset += count;

		} );

		return triangulated;

	}

	buildSphere( prim, usdData ) {

		const attrs = prim.attributes;
		const radius = attrs[ 'radius' ] ? attrs[ 'radius' ].value : 1.0;

		const geometry = new SphereGeometry( radius, 32, 16 );
		const material = this.getMaterialForPrim( prim, usdData );

		const mesh = new Mesh( geometry, material );
		mesh.name = prim.name;

		this.applyTransform( mesh, prim );

		// Build children
		prim.children.forEach( childPrim => {

			const childObj = this.buildPrim( childPrim, usdData );
			if ( childObj ) {

				mesh.add( childObj );

			}

		} );

		return mesh;

	}

	buildCube( prim, usdData ) {

		const attrs = prim.attributes;
		const size = attrs[ 'size' ] ? attrs[ 'size' ].value : 2.0;

		const geometry = new BoxGeometry( size, size, size );
		const material = this.getMaterialForPrim( prim, usdData );

		const mesh = new Mesh( geometry, material );
		mesh.name = prim.name;

		this.applyTransform( mesh, prim );

		// Build children
		prim.children.forEach( childPrim => {

			const childObj = this.buildPrim( childPrim, usdData );
			if ( childObj ) {

				mesh.add( childObj );

			}

		} );

		return mesh;

	}

	buildCylinder( prim, usdData ) {

		const attrs = prim.attributes;
		const radius = attrs[ 'radius' ] ? attrs[ 'radius' ].value : 1.0;
		const height = attrs[ 'height' ] ? attrs[ 'height' ].value : 2.0;

		const geometry = new CylinderGeometry( radius, radius, height, 32 );
		const material = this.getMaterialForPrim( prim, usdData );

		const mesh = new Mesh( geometry, material );
		mesh.name = prim.name;

		this.applyTransform( mesh, prim );

		// Build children
		prim.children.forEach( childPrim => {

			const childObj = this.buildPrim( childPrim, usdData );
			if ( childObj ) {

				mesh.add( childObj );

			}

		} );

		return mesh;

	}

	buildCone( prim, usdData ) {

		const attrs = prim.attributes;
		const radius = attrs[ 'radius' ] ? attrs[ 'radius' ].value : 1.0;
		const height = attrs[ 'height' ] ? attrs[ 'height' ].value : 2.0;

		const geometry = new ConeGeometry( radius, height, 32 );
		const material = this.getMaterialForPrim( prim, usdData );

		const mesh = new Mesh( geometry, material );
		mesh.name = prim.name;

		this.applyTransform( mesh, prim );

		// Build children
		prim.children.forEach( childPrim => {

			const childObj = this.buildPrim( childPrim, usdData );
			if ( childObj ) {

				mesh.add( childObj );

			}

		} );

		return mesh;

	}

	buildPlane( prim, usdData ) {

		const attrs = prim.attributes;
		const width = attrs[ 'width' ] ? attrs[ 'width' ].value : 2.0;
		const length = attrs[ 'length' ] ? attrs[ 'length' ].value : 2.0;

		const geometry = new PlaneGeometry( width, length );
		const material = this.getMaterialForPrim( prim, usdData );

		const mesh = new Mesh( geometry, material );
		mesh.name = prim.name;

		this.applyTransform( mesh, prim );

		// Build children
		prim.children.forEach( childPrim => {

			const childObj = this.buildPrim( childPrim, usdData );
			if ( childObj ) {

				mesh.add( childObj );

			}

		} );

		return mesh;

	}

	buildPoints( prim, usdData ) {

		const attrs = prim.attributes;

		const geometry = new BufferGeometry();

		// Points (vertices)
		if ( attrs[ 'points' ] ) {

			const points = attrs[ 'points' ].value;
			const positions = [];

			points.forEach( point => {

				positions.push( point[ 0 ], point[ 1 ], point[ 2 ] );

			} );

			geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );

		}

		// Vertex colors
		if ( attrs[ 'primvars:displayColor' ] ) {

			const colors = attrs[ 'primvars:displayColor' ].value;
			const colorArray = [];

			colors.forEach( color => {

				colorArray.push( color[ 0 ], color[ 1 ], color[ 2 ] );

			} );

			geometry.setAttribute( 'color', new Float32BufferAttribute( colorArray, 3 ) );

		}

		const material = new PointsMaterial( { size: 0.05, vertexColors: true } );
		const points = new Points( geometry, material );
		points.name = prim.name;

		this.applyTransform( points, prim );

		return points;

	}

	getMaterialForPrim( prim, usdData ) {

		// Check for material binding
		const materialBinding = prim.relationships[ 'material:binding' ];

		if ( materialBinding ) {

			const materialPath = materialBinding.value;
			const materialPrim = usdData.primDict[ materialPath ];

			if ( materialPrim ) {

				return this.buildMaterial( materialPrim, usdData );

			}

		}

		// Check for displayColor
		if ( prim.attributes[ 'primvars:displayColor' ] ) {

			const color = prim.attributes[ 'primvars:displayColor' ].value[ 0 ];
			return new MeshStandardMaterial( {
				color: new Color( color[ 0 ], color[ 1 ], color[ 2 ] )
			} );

		}

		// Default material
		return new MeshStandardMaterial( { color: 0xcccccc } );

	}

	buildMaterial( prim, usdData ) {

		// Check if already built
		if ( this.materials[ prim.path ] ) {

			return this.materials[ prim.path ];

		}

		// Find shader prim (usually a child)
		let shaderPrim = null;

		// Check surface output connection
		const surfaceOutput = prim.attributes[ 'outputs:surface' ];
		if ( surfaceOutput && surfaceOutput.connection ) {

			const shaderPath = surfaceOutput.connection.value.split( '.' )[ 0 ];
			shaderPrim = usdData.primDict[ shaderPath ];

		}

		// Look for shader child
		if ( ! shaderPrim ) {

			shaderPrim = prim.children.find( child => child.type === 'Shader' );

		}

		if ( ! shaderPrim ) {

			console.warn( `USDLoader: No shader found for material "${prim.name}"` );
			const material = new MeshStandardMaterial();
			this.materials[ prim.path ] = material;
			return material;

		}

		// Build material from shader
		const material = this.buildShader( shaderPrim, prim, usdData );
		this.materials[ prim.path ] = material;

		return material;

	}

	buildShader( shaderPrim, materialPrim, usdData ) {

		const attrs = shaderPrim.attributes;
		const infoId = attrs[ 'info:id' ] ? attrs[ 'info:id' ].value : '';

		if ( infoId === 'UsdPreviewSurface' ) {

			return this.buildPreviewSurface( shaderPrim, materialPrim, usdData );

		} else if ( infoId === 'UsdUVTexture' ) {

			// Texture shader - handled separately
			return null;

		} else {

			console.warn( `USDLoader: Unknown shader type "${infoId}"` );
			return new MeshStandardMaterial();

		}

	}

	buildPreviewSurface( shaderPrim, materialPrim, usdData ) {

		const attrs = shaderPrim.attributes;

		const params = {
			metalness: 0.0,
			roughness: 0.5
		};

		// Diffuse Color
		if ( attrs[ 'inputs:diffuseColor' ] ) {

			const value = attrs[ 'inputs:diffuseColor' ].value;

			if ( attrs[ 'inputs:diffuseColor' ].connection ) {

				// Texture connection
				const texturePath = attrs[ 'inputs:diffuseColor' ].connection.value.split( '.' )[ 0 ];
				const texturePrim = usdData.primDict[ texturePath ];

				if ( texturePrim ) {

					params.map = this.buildTexture( texturePrim, usdData );

				}

			} else if ( Array.isArray( value ) ) {

				params.color = new Color( value[ 0 ], value[ 1 ], value[ 2 ] );

			}

		}

		// Emissive Color
		if ( attrs[ 'inputs:emissiveColor' ] ) {

			const value = attrs[ 'inputs:emissiveColor' ].value;

			if ( Array.isArray( value ) ) {

				params.emissive = new Color( value[ 0 ], value[ 1 ], value[ 2 ] );

			}

		}

		// Metallic
		if ( attrs[ 'inputs:metallic' ] ) {

			const value = attrs[ 'inputs:metallic' ].value;

			if ( attrs[ 'inputs:metallic' ].connection ) {

				const texturePath = attrs[ 'inputs:metallic' ].connection.value.split( '.' )[ 0 ];
				const texturePrim = usdData.primDict[ texturePath ];

				if ( texturePrim ) {

					params.metalnessMap = this.buildTexture( texturePrim, usdData );

				}

			} else {

				params.metalness = value;

			}

		}

		// Roughness
		if ( attrs[ 'inputs:roughness' ] ) {

			const value = attrs[ 'inputs:roughness' ].value;

			if ( attrs[ 'inputs:roughness' ].connection ) {

				const texturePath = attrs[ 'inputs:roughness' ].connection.value.split( '.' )[ 0 ];
				const texturePrim = usdData.primDict[ texturePath ];

				if ( texturePrim ) {

					params.roughnessMap = this.buildTexture( texturePrim, usdData );

				}

			} else {

				params.roughness = value;

			}

		}

		// Normal
		if ( attrs[ 'inputs:normal' ] ) {

			if ( attrs[ 'inputs:normal' ].connection ) {

				const texturePath = attrs[ 'inputs:normal' ].connection.value.split( '.' )[ 0 ];
				const texturePrim = usdData.primDict[ texturePath ];

				if ( texturePrim ) {

					params.normalMap = this.buildTexture( texturePrim, usdData );

				}

			}

		}

		// Opacity
		if ( attrs[ 'inputs:opacity' ] ) {

			const value = attrs[ 'inputs:opacity' ].value;

			if ( value < 1.0 ) {

				params.transparent = true;
				params.opacity = value;

			}

		}

		// Occlusion
		if ( attrs[ 'inputs:occlusion' ] ) {

			if ( attrs[ 'inputs:occlusion' ].connection ) {

				const texturePath = attrs[ 'inputs:occlusion' ].connection.value.split( '.' )[ 0 ];
				const texturePrim = usdData.primDict[ texturePath ];

				if ( texturePrim ) {

					params.aoMap = this.buildTexture( texturePrim, usdData );

				}

			}

		}

		return new MeshStandardMaterial( params );

	}

	buildTexture( texturePrim, usdData ) {

		const attrs = texturePrim.attributes;

		if ( ! attrs[ 'inputs:file' ] ) {

			console.warn( `USDLoader: No file input for texture "${texturePrim.name}"` );
			return null;

		}

		const file = attrs[ 'inputs:file' ].value.value; // Asset type has nested value
		const url = this.resolveURL( file );

		// Check cache
		if ( this.textures[ url ] ) {

			return this.textures[ url ];

		}

		const texture = this.textureLoader.load( url );

		// Wrap modes
		if ( attrs[ 'inputs:wrapS' ] ) {

			texture.wrapS = this.parseWrapMode( attrs[ 'inputs:wrapS' ].value );

		}

		if ( attrs[ 'inputs:wrapT' ] ) {

			texture.wrapT = this.parseWrapMode( attrs[ 'inputs:wrapT' ].value );

		}

		// Scale and bias (UV transform)
		if ( attrs[ 'inputs:scale' ] ) {

			const scale = attrs[ 'inputs:scale' ].value;
			texture.repeat.set( scale[ 0 ], scale[ 1 ] );

		}

		if ( attrs[ 'inputs:bias' ] ) {

			const bias = attrs[ 'inputs:bias' ].value;
			texture.offset.set( bias[ 0 ], bias[ 1 ] );

		}

		this.textures[ url ] = texture;

		return texture;

	}

	parseWrapMode( mode ) {

		switch ( mode ) {

			case 'repeat':
				return RepeatWrapping;
			case 'clamp':
				return ClampToEdgeWrapping;
			case 'mirror':
				return MirroredRepeatWrapping;
			default:
				return RepeatWrapping;

		}

	}

	resolveURL( path ) {

		// Remove leading ./ if present
		if ( path.startsWith( './' ) ) {

			path = path.slice( 2 );

		}

		// Absolute URL
		if ( path.match( /^https?:\/\// ) ) {

			return path;

		}

		// Relative to USD file
		return this.baseUrl + path;

	}

	// Lights

	buildDistantLight( prim, usdData ) {

		const attrs = prim.attributes;

		const color = attrs[ 'inputs:color' ] ?
			new Color( attrs[ 'inputs:color' ].value[ 0 ], attrs[ 'inputs:color' ].value[ 1 ], attrs[ 'inputs:color' ].value[ 2 ] ) :
			new Color( 1, 1, 1 );

		const intensity = attrs[ 'inputs:intensity' ] ? attrs[ 'inputs:intensity' ].value : 1.0;
		const exposure = attrs[ 'inputs:exposure' ] ? attrs[ 'inputs:exposure' ].value : 0.0;

		const finalIntensity = intensity * Math.pow( 2, exposure );

		const light = new DirectionalLight( color, finalIntensity );
		light.name = prim.name;

		// Distant light points along -Z axis by default
		light.position.set( 0, 0, 0 );
		light.target.position.set( 0, 0, - 1 );

		this.applyTransform( light, prim );

		return light;

	}

	buildSphereLight( prim, usdData ) {

		const attrs = prim.attributes;

		const color = attrs[ 'inputs:color' ] ?
			new Color( attrs[ 'inputs:color' ].value[ 0 ], attrs[ 'inputs:color' ].value[ 1 ], attrs[ 'inputs:color' ].value[ 2 ] ) :
			new Color( 1, 1, 1 );

		const intensity = attrs[ 'inputs:intensity' ] ? attrs[ 'inputs:intensity' ].value : 1.0;
		const exposure = attrs[ 'inputs:exposure' ] ? attrs[ 'inputs:exposure' ].value : 0.0;
		const radius = attrs[ 'radius' ] ? attrs[ 'radius' ].value : 0.5;

		const finalIntensity = intensity * Math.pow( 2, exposure );

		const light = new PointLight( color, finalIntensity );
		light.name = prim.name;
		light.distance = 0;
		light.decay = 2;

		this.applyTransform( light, prim );

		return light;

	}

	buildRectLight( prim, usdData ) {

		const attrs = prim.attributes;

		const color = attrs[ 'inputs:color' ] ?
			new Color( attrs[ 'inputs:color' ].value[ 0 ], attrs[ 'inputs:color' ].value[ 1 ], attrs[ 'inputs:color' ].value[ 2 ] ) :
			new Color( 1, 1, 1 );

		const intensity = attrs[ 'inputs:intensity' ] ? attrs[ 'inputs:intensity' ].value : 1.0;
		const exposure = attrs[ 'inputs:exposure' ] ? attrs[ 'inputs:exposure' ].value : 0.0;
		const width = attrs[ 'width' ] ? attrs[ 'width' ].value : 1.0;
		const height = attrs[ 'height' ] ? attrs[ 'height' ].value : 1.0;

		const finalIntensity = intensity * Math.pow( 2, exposure );

		const light = new RectAreaLight( color, finalIntensity, width, height );
		light.name = prim.name;

		this.applyTransform( light, prim );

		return light;

	}

	buildDiskLight( prim, usdData ) {

		const attrs = prim.attributes;

		const color = attrs[ 'inputs:color' ] ?
			new Color( attrs[ 'inputs:color' ].value[ 0 ], attrs[ 'inputs:color' ].value[ 1 ], attrs[ 'inputs:color' ].value[ 2 ] ) :
			new Color( 1, 1, 1 );

		const intensity = attrs[ 'inputs:intensity' ] ? attrs[ 'inputs:intensity' ].value : 1.0;
		const exposure = attrs[ 'inputs:exposure' ] ? attrs[ 'inputs:exposure' ].value : 0.0;
		const radius = attrs[ 'radius' ] ? attrs[ 'radius' ].value : 0.5;

		const finalIntensity = intensity * Math.pow( 2, exposure );

		// Approximate disk light as rect light with equal width/height
		const light = new RectAreaLight( color, finalIntensity, radius * 2, radius * 2 );
		light.name = prim.name;

		this.applyTransform( light, prim );

		return light;

	}

	buildDomeLight( prim, usdData ) {

		const attrs = prim.attributes;

		const color = attrs[ 'inputs:color' ] ?
			new Color( attrs[ 'inputs:color' ].value[ 0 ], attrs[ 'inputs:color' ].value[ 1 ], attrs[ 'inputs:color' ].value[ 2 ] ) :
			new Color( 1, 1, 1 );

		const intensity = attrs[ 'inputs:intensity' ] ? attrs[ 'inputs:intensity' ].value : 1.0;
		const exposure = attrs[ 'inputs:exposure' ] ? attrs[ 'inputs:exposure' ].value : 0.0;

		const finalIntensity = intensity * Math.pow( 2, exposure );

		// Approximate dome light as hemisphere light
		const light = new HemisphereLight( color, color, finalIntensity );
		light.name = prim.name;

		// TODO: Support texture-based dome lighting (requires environment map)
		if ( attrs[ 'inputs:texture:file' ] ) {

			console.warn( 'USDLoader: Dome light textures not yet supported' );

		}

		this.applyTransform( light, prim );

		return light;

	}

}

export { USDLoader };
