/**
 * @author Mugen87 / https://github.com/Mugen87
 */

import {
	AddEquation,
	Color,
	CustomBlending,
	DataTexture,
	DepthTexture,
	DstAlphaFactor,
	DstColorFactor,
	FloatType,
	LinearFilter,
	MathUtils,
	MeshNormalMaterial,
	NearestFilter,
	NoBlending,
	RGBAFormat,
	RepeatWrapping,
	ShaderMaterial,
	TextureLoader,
	UniformsUtils,
	UnsignedShortType,
	Vector3,
	WebGLRenderTarget,
	ZeroFactor,
	Texture,
} from "../../../build/three.module.js";
import { Pass } from "../postprocessing/Pass.js";
import { SimplexNoise } from "../math/SimplexNoise.js";
import { SSAOShader } from "../shaders/SSAOShader.js";
import { SSAOBlurShader } from "../shaders/SSAOShader.js";
import { SSAODepthShader } from "../shaders/SSAOShader.js";
import { CopyShader} from "../shaders/CopyShader.js";
import { CopyShaderFlipped } from "../shaders/CopyShaderFlipped.js";
// Source:
// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
function loadTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Because images have to be download over the internet
  // they might take a moment until they are ready.
  // Until then put a single pixel in the texture so we can
  // use it immediately. When the image has finished downloading
  // we'll update the texture with the contents of the image.
  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 1;
  const height = 1;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                width, height, border, srcFormat, srcType,
                pixel);

  const image = new Image();
  image.onload = function() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  srcFormat, srcType, image);

    // WebGL1 has different requirements for power of 2 images
    // vs non power of 2 images so check if the image is a
    // power of 2 in both dimensions.
    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
       // Yes, it's a power of 2. Generate mips.
       gl.generateMipmap(gl.TEXTURE_2D);
    } else {
       // No, it's not a power of 2. Turn off mips and set
       // wrapping to clamp to edge
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  };
//   image.src = url;

  return texture;
}

function isPowerOf2(value) {
  return (value & (value - 1)) == 0;
}

var SSAOPass = function ( scene, camera, width, height, renderer ) {

	Pass.call( this );

	this.width = ( width !== undefined ) ? width : 512;
	this.height = ( height !== undefined ) ? height : 512;

	this.clear = true;

	this.camera = camera;
	this.scene = scene;

	this.kernelRadius = 8;
	this.kernelSize = 32;
	this.kernel = [];
	this.noiseTexture = null;
	this.output = 0;

	this.minDistance = 0.005;
	this.maxDistance = 0.1;

	this.showReal = false;

	//

	this.generateSampleKernel();
	this.generateRandomKernelRotations();

	// beauty render target with depth buffer

	var depthTexture = new DepthTexture();
	depthTexture.type = UnsignedShortType;
	depthTexture.minFilter = NearestFilter;
	depthTexture.maxFilter = NearestFilter;
	
	this.beautyRenderTarget = new WebGLRenderTarget( this.width, this.height, {
		minFilter: LinearFilter,
		magFilter: LinearFilter,
		format: RGBAFormat,
		depthTexture: depthTexture,
		depthBuffer: true
	} );

	// normal render target

	this.normalRenderTarget = new WebGLRenderTarget( this.width, this.height, {
		minFilter: NearestFilter,
		magFilter: NearestFilter,
		format: RGBAFormat
	} );

	// ssao render target

	this.ssaoRenderTarget = new WebGLRenderTarget( this.width, this.height, {
		minFilter: LinearFilter,
		magFilter: LinearFilter,
		format: RGBAFormat
	} );

	this.blurRenderTarget = this.ssaoRenderTarget.clone();

	// ssao material

	if ( SSAOShader === undefined ) {

		console.error( 'THREE.SSAOPass: The pass relies on SSAOShader.' );

	}

	this.ssaoMaterial = new ShaderMaterial( {
		defines: Object.assign( {}, SSAOShader.defines ),
		uniforms: UniformsUtils.clone( SSAOShader.uniforms ),
		vertexShader: SSAOShader.vertexShader,
		fragmentShader: SSAOShader.fragmentShader,
		blending: NoBlending
	} );

	var gl = renderer.getContext();
	var diffuse = new Texture();
	var properties = renderer.properties.get( diffuse );
	var webglTex = loadTexture(renderer.getContext());
  	gl.bindTexture(gl.TEXTURE_2D, webglTex);
  	gl.texImage2D(gl.TEXTURE_2D, 9, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
  	gl.bindTexture(gl.TEXTURE_2D, webglTex);
  	properties.__webglTexture = webglTex;
	properties.__webglInit = true;

	var normal = new Texture();
	properties = renderer.properties.get( normal );
	webglTex = loadTexture(renderer.getContext());
  	gl.bindTexture(gl.TEXTURE_2D, webglTex);
  	gl.texImage2D(gl.TEXTURE_2D, 6, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
  	gl.bindTexture(gl.TEXTURE_2D, webglTex);
  	properties.__webglTexture = webglTex;
	properties.__webglInit = true;

	var depth = new Texture();
	properties = renderer.properties.get( depth );
	webglTex = loadTexture(renderer.getContext());
  	gl.bindTexture(gl.TEXTURE_2D, webglTex);
  	gl.texImage2D(gl.TEXTURE_2D, 7, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
  	gl.bindTexture(gl.TEXTURE_2D, webglTex);
  	properties.__webglTexture = webglTex;
	properties.__webglInit = true;

	var intensity = new Texture();
	properties = renderer.properties.get( intensity );
	webglTex = loadTexture(renderer.getContext());
  	gl.bindTexture(gl.TEXTURE_2D, webglTex);
  	gl.texImage2D(gl.TEXTURE_2D, 5, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
  	gl.bindTexture(gl.TEXTURE_2D, webglTex);
  	properties.__webglTexture = webglTex;
	properties.__webglInit = true;


	// this.normalTex = texture;
	this.normalTex = normal;//new TextureLoader().load('textures/webgl_postprocessing_ssao_normal.png');
	this.normalTex.minFilter = NearestFilter;
	this.normalTex.magFilter = NearestFilter;
	// this.diffuseTex = new TextureLoader().load('textures/webgl_postprocessing_ssao_diffuse.png');
	this.diffuseTex = diffuse;
	this.indensityTex = intensity;
	this.depthTex = depth;//new TextureLoader().load('textures/webgl_postprocessing_ssao_depth2.png', (tex) => {
	//	console.log(tex);
	//});

	this.ssaoMaterial.uniforms[ 'tDiffuse' ].value = this.beautyRenderTarget.texture;
	this.ssaoMaterial.uniforms[ 'tNormal' ].value = this.normalRenderTarget.texture;
	this.ssaoMaterial.uniforms[ 'tDepth' ].value = this.beautyRenderTarget.depthTexture;
	this.ssaoMaterial.uniforms[ 'tNoise' ].value = this.noiseTexture;
	this.ssaoMaterial.uniforms[ 'kernel' ].value = this.kernel;
	this.ssaoMaterial.uniforms[ 'cameraNear' ].value = this.camera.near;
	this.ssaoMaterial.uniforms[ 'cameraFar' ].value = this.camera.far;
	this.ssaoMaterial.uniforms[ 'resolution' ].value.set( this.width, this.height );
	this.ssaoMaterial.uniforms[ 'cameraProjectionMatrix' ].value.copy( this.camera.projectionMatrix );
	this.ssaoMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.getInverse( this.camera.projectionMatrix );

	// normal material

	this.normalMaterial = new MeshNormalMaterial();
	this.normalMaterial.blending = NoBlending;

	// blur material

	this.blurMaterial = new ShaderMaterial( {
		defines: Object.assign( {}, SSAOBlurShader.defines ),
		uniforms: UniformsUtils.clone( SSAOBlurShader.uniforms ),
		vertexShader: SSAOBlurShader.vertexShader,
		fragmentShader: SSAOBlurShader.fragmentShader
	} );
	this.blurMaterial.uniforms[ 'tDiffuse' ].value = this.ssaoRenderTarget.texture;
	this.blurMaterial.uniforms[ 'resolution' ].value.set( this.width, this.height );

	// material for rendering the depth

	this.depthRenderMaterial = new ShaderMaterial( {
		defines: Object.assign( {}, SSAODepthShader.defines ),
		uniforms: UniformsUtils.clone( SSAODepthShader.uniforms ),
		vertexShader: SSAODepthShader.vertexShader,
		fragmentShader: SSAODepthShader.fragmentShader,
		blending: NoBlending
	} );
	this.depthRenderMaterial.uniforms[ 'tDepth' ].value = this.beautyRenderTarget.depthTexture;
	this.depthRenderMaterial.uniforms[ 'cameraNear' ].value = this.camera.near;
	this.depthRenderMaterial.uniforms[ 'cameraFar' ].value = this.camera.far;

	// material for rendering the content of a render target

	this.copyMaterial = new ShaderMaterial( {
		uniforms: UniformsUtils.clone( CopyShader.uniforms ),
		vertexShader: CopyShader.vertexShader,
		fragmentShader: CopyShader.fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		blendSrc: DstColorFactor,
		blendDst: ZeroFactor,
		blendEquation: AddEquation,
		blendSrcAlpha: DstAlphaFactor,
		blendDstAlpha: ZeroFactor,
		blendEquationAlpha: AddEquation
	} );

	this.copyMaterialFlipped = new ShaderMaterial( {
		uniforms: UniformsUtils.clone( CopyShaderFlipped.uniforms ),
		vertexShader: CopyShaderFlipped.vertexShader,
		fragmentShader: CopyShaderFlipped.fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		blendSrc: DstColorFactor,
		blendDst: ZeroFactor,
		blendEquation: AddEquation,
		blendSrcAlpha: DstAlphaFactor,
		blendDstAlpha: ZeroFactor,
		blendEquationAlpha: AddEquation
	} );

	

	this.fsQuad = new Pass.FullScreenQuad( null );

	this.originalClearColor = new Color();

};

SSAOPass.prototype = Object.assign( Object.create( Pass.prototype ), {

	constructor: SSAOPass,

	dispose: function () {

		// dispose render targets

		this.beautyRenderTarget.dispose();
		this.normalRenderTarget.dispose();
		this.ssaoRenderTarget.dispose();
		this.blurRenderTarget.dispose();

		// dispose materials

		this.normalMaterial.dispose();
		this.blurMaterial.dispose();
		this.copyMaterial.dispose();
		this.copyMaterialFlipped.dispose();
		this.depthRenderMaterial.dispose();

		// dipsose full screen quad

		this.fsQuad.dispose();

	},

	render: function ( renderer, writeBuffer /*, readBuffer, deltaTime, maskActive */ ) {

		// render beauty and depth
	console.log("render2");

		renderer.setRenderTarget( this.beautyRenderTarget );
		renderer.clear();
		renderer.render( this.scene, this.camera );

		// render normals

		this.renderOverride( renderer, this.normalMaterial, this.normalRenderTarget, 0x7777ff, 1.0 );
		// render SSAO

		this.ssaoMaterial.uniforms[ 'kernelRadius' ].value = this.kernelRadius;
		this.ssaoMaterial.uniforms[ 'minDistance' ].value = this.minDistance;
		this.ssaoMaterial.uniforms[ 'maxDistance' ].value = this.maxDistance;

		if (!this.showReal) {
			this.ssaoMaterial.uniforms[ 'tDepth' ].value = this.depthTex;
			this.ssaoMaterial.uniforms[ 'tNormal' ].value = this.normalTex;
			this.ssaoMaterial.uniforms[ 'tDiffuse' ].value = this.diffuseTex;
		} else {
			this.ssaoMaterial.uniforms[ 'tDepth' ].value = this.beautyRenderTarget.depthTexture;
			this.ssaoMaterial.uniforms[ 'tDiffuse' ].value = this.beautyRenderTarget.texture;
			this.ssaoMaterial.uniforms[ 'tNormal' ].value = this.normalRenderTarget.texture;
		}
		this.renderPass( renderer, this.ssaoMaterial, this.ssaoRenderTarget );


		// render blur

		this.renderPass( renderer, this.blurMaterial, this.blurRenderTarget );

		// output result to screen

		// this.output = SSAOPass.OUTPUT.Depth;
		switch ( this.output ) {

			case SSAOPass.OUTPUT.SSAO:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.ssaoRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			case SSAOPass.OUTPUT.Blur:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			case SSAOPass.OUTPUT.Beauty:

				if (this.showReal) {
					 this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.beautyRenderTarget.texture;
				} else {
					this.copyMaterialFlipped.uniforms[ 'tDiffuse' ].value = this.diffuseTex;
				}
				this.copyMaterialFlipped.blending = NoBlending;
				this.renderPass( renderer, this.copyMaterialFlipped, this.renderToScreen ? null : writeBuffer );

				break;

			case SSAOPass.OUTPUT.Depth:

				if (!this.showReal) {
					this.depthRenderMaterial.uniforms[ 'tDepth' ].value = this.depthTex;
				}
				else {
					this.depthRenderMaterial.uniforms[ 'tDepth' ].value = this.beautyRenderTarget.depthTexture;
				}
				this.depthRenderMaterial.uniforms[ 'showReal' ].value = this.showReal;
				this.renderPass( renderer, this.depthRenderMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			case SSAOPass.OUTPUT.Normal:

				if (this.showReal) {
					this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.normalRenderTarget.texture;
				} else {
					this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.normalTex;
				}
				this.copyMaterial.blending = NoBlending;
				this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			case SSAOPass.OUTPUT.Default:

				if (this.showReal) {
					this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.beautyRenderTarget.texture;
				} else {
					this.copyMaterialFlipped.uniforms[ 'tDiffuse' ].value = this.diffuseTex;
					this.copyMaterialFlipped.uniforms[ 'tIntensity' ].value = this.indensityTex;
				}
				this.copyMaterialFlipped.blending = NoBlending;
				this.renderPass( renderer, this.copyMaterialFlipped, this.renderToScreen ? null : writeBuffer );

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget.texture;
				this.copyMaterial.blending = CustomBlending;
				this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			default:
				console.warn( 'THREE.SSAOPass: Unknown output type.' );

		}

	},

	renderPass: function ( renderer, passMaterial, renderTarget, clearColor, clearAlpha ) {

		// save original state
		this.originalClearColor.copy( renderer.getClearColor() );
		var originalClearAlpha = renderer.getClearAlpha();
		var originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );

		// setup pass state
		renderer.autoClear = false;
		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this.fsQuad.material = passMaterial;
		this.fsQuad.render( renderer );

		// restore original state
		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this.originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	},

	renderOverride: function ( renderer, overrideMaterial, renderTarget, clearColor, clearAlpha ) {

		this.originalClearColor.copy( renderer.getClearColor() );
		var originalClearAlpha = renderer.getClearAlpha();
		var originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );
		renderer.autoClear = false;

		clearColor = overrideMaterial.clearColor || clearColor;
		clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this.scene.overrideMaterial = overrideMaterial;
		renderer.render( this.scene, this.camera );
		this.scene.overrideMaterial = null;

		// restore original state

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this.originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	},

	setSize: function ( width, height ) {

		this.width = width;
		this.height = height;

		this.beautyRenderTarget.setSize( width, height );
		this.ssaoRenderTarget.setSize( width, height );
		this.normalRenderTarget.setSize( width, height );
		this.blurRenderTarget.setSize( width, height );

		this.ssaoMaterial.uniforms[ 'resolution' ].value.set( width, height );
		this.ssaoMaterial.uniforms[ 'cameraProjectionMatrix' ].value.copy( this.camera.projectionMatrix );
		this.ssaoMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.getInverse( this.camera.projectionMatrix );

		this.blurMaterial.uniforms[ 'resolution' ].value.set( width, height );

	},

	generateSampleKernel: function () {

		var kernelSize = this.kernelSize;
		var kernel = this.kernel;

		for ( var i = 0; i < kernelSize; i ++ ) {

			var sample = new Vector3();
			sample.x = ( Math.random() * 2 ) - 1;
			sample.y = ( Math.random() * 2 ) - 1;
			sample.z = Math.random();

			sample.normalize();

			var scale = i / kernelSize;
			scale = MathUtils.lerp( 0.1, 1, scale * scale );
			sample.multiplyScalar( scale );

			kernel.push( sample );

		}

	},

	generateRandomKernelRotations: function () {

		var width = 4, height = 4;

		if ( SimplexNoise === undefined ) {

			console.error( 'THREE.SSAOPass: The pass relies on SimplexNoise.' );

		}

		var simplex = new SimplexNoise();

		var size = width * height;
		var data = new Float32Array( size * 4 );

		for ( var i = 0; i < size; i ++ ) {

			var stride = i * 4;

			var x = ( Math.random() * 2 ) - 1;
			var y = ( Math.random() * 2 ) - 1;
			var z = 0;

			var noise = simplex.noise3d( x, y, z );

			data[ stride ] = noise;
			data[ stride + 1 ] = noise;
			data[ stride + 2 ] = noise;
			data[ stride + 3 ] = 1;

		}

		this.noiseTexture = new DataTexture( data, width, height, RGBAFormat, FloatType );
		this.noiseTexture.wrapS = RepeatWrapping;
		this.noiseTexture.wrapT = RepeatWrapping;

	}

} );

SSAOPass.OUTPUT = {
	'Default': 0,
	'SSAO': 1,
	'Blur': 2,
	'Beauty': 3,
	'Depth': 4,
	'Normal': 5
};

export { SSAOPass };
