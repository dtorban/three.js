var CopyShaderFlipped = {

	uniforms: {

		"tDiffuse": { value: null },
		"tIntensity": { value: null },
		"opacity": { value: 1.0 }

	},

	vertexShader: [

		"varying vec2 vUv;",

		"void main() {",

		"	vUv = uv;",
		"	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

		"}"

	].join( "\n" ),

	fragmentShader: [

		"uniform float opacity;",

		"uniform sampler2D tDiffuse;",
		"uniform sampler2D tIntensity;",

		"varying vec2 vUv;",

		"void main() {",
		"	vec4 texel = texture2D( tDiffuse, vec2(vUv.x, 1.0-vUv.y) );",
		"	vec4 intensity = texture2D( tIntensity, vUv );",
		"	gl_FragColor = opacity * texel * intensity.x;",

		"}"

	].join( "\n" )

};



export { CopyShaderFlipped };