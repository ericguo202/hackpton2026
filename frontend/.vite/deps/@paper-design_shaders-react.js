"use client";
import { i as __toESM, t as require_react } from "./react-B6J-hxuQ.js";
import { t as require_jsx_runtime } from "./jsx-runtime-BsRXCT-W.js";
//#region node_modules/@paper-design/shaders/dist/vertex-shader.js
var vertexShaderSource = `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_imageAspectRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_objectBoxSize;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;
out vec2 v_patternUV;
out vec2 v_patternBoxSize;
out vec2 v_imageUV;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.);
  // fit = none
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.) { // fit = contain
    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
  } else if (u_fit == 2.) { // fit = cover
    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
  }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;

  vec2 uv = gl_Position.xy * .5;
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * 3.14159265358979323846 / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);


  // ===================================================

  float fixedRatio = 1.;
  vec2 fixedRatioBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );

  v_objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;

  v_objectUV = uv;
  v_objectUV *= objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;

  // ===================================================

  v_responsiveBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;

  #ifdef ADD_HELPERS
  v_responsiveHelperBox = uv;
  v_responsiveHelperBox *= responsiveBoxScale;
  v_responsiveHelperBox += boxOrigin * (responsiveBoxScale - 1.);
  #endif

  v_responsiveUV = uv;
  v_responsiveUV *= responsiveBoxScale;
  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);
  v_responsiveUV += graphicOffset;
  v_responsiveUV /= u_scale;
  v_responsiveUV.x *= responsiveRatio;
  v_responsiveUV = graphicRotation * v_responsiveUV;
  v_responsiveUV.x /= responsiveRatio;

  // ===================================================

  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
  vec2 patternBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;

  vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);
  v_patternBoxSize = boxSizeData.xy;
  float patternBoxNoFitBoxWidth = boxSizeData.z;
  vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;

  v_patternUV = uv;
  v_patternUV += graphicOffset / patternBoxScale;
  v_patternUV += boxOrigin;
  v_patternUV -= boxOrigin / patternBoxScale;
  v_patternUV *= u_resolution.xy;
  v_patternUV /= u_pixelRatio;
  if (u_fit > 0.) {
    v_patternUV *= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);
  }
  v_patternUV /= u_scale;
  v_patternUV = graphicRotation * v_patternUV;
  v_patternUV += boxOrigin / patternBoxScale;
  v_patternUV -= boxOrigin;
  // x100 is a default multiplier between vertex and fragmant shaders
  // we use it to avoid UV presision issues
  v_patternUV *= .01;

  // ===================================================

  vec2 imageBoxSize;
  if (u_fit == 1.) { // contain
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.) { // cover
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

  v_imageUV = uv;
  v_imageUV *= imageBoxScale;
  v_imageUV += boxOrigin * (imageBoxScale - 1.);
  v_imageUV += graphicOffset;
  v_imageUV /= u_scale;
  v_imageUV.x *= u_imageAspectRatio;
  v_imageUV = graphicRotation * v_imageUV;
  v_imageUV.x /= u_imageAspectRatio;

  v_imageUV += .5;
  v_imageUV.y = 1. - v_imageUV.y;
}`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shader-mount.js
var DEFAULT_MAX_PIXEL_COUNT = 1920 * 1080 * 4;
var ShaderMount$1 = class {
	parentElement;
	canvasElement;
	gl;
	program = null;
	uniformLocations = {};
	/** The fragment shader that we are using */
	fragmentShader;
	/** Stores the RAF for the render loop */
	rafId = null;
	/** Time of the last rendered frame */
	lastRenderTime = 0;
	/** Total time that we have played any animation, passed as a uniform to the shader for time-based VFX */
	currentFrame = 0;
	/** The speed that we progress through animation time (multiplies by delta time every update). Allows negatives to play in reverse. If set to 0, rAF will stop entirely so static shaders have no recurring performance costs */
	speed = 0;
	/** Actual speed used that accounts for document visibility (we pause the shader if the tab is hidden) */
	currentSpeed = 0;
	/** Uniforms that are provided by the user for the specific shader being mounted (not including uniforms that this Mount adds, like time and resolution) */
	providedUniforms;
	/** Names of the uniforms that should have mipmaps generated for them */
	mipmaps = [];
	/** Just a sanity check to make sure frames don't run after we're disposed */
	hasBeenDisposed = false;
	/** If the resolution of the canvas has changed since the last render */
	resolutionChanged = true;
	/** Store textures that are provided by the user */
	textures = /* @__PURE__ */ new Map();
	minPixelRatio;
	maxPixelCount;
	isSafari = isSafari();
	uniformCache = {};
	textureUnitMap = /* @__PURE__ */ new Map();
	ownerDocument;
	constructor(parentElement, fragmentShader, uniforms, webGlContextAttributes, speed = 0, frame = 0, minPixelRatio = 2, maxPixelCount = DEFAULT_MAX_PIXEL_COUNT, mipmaps = []) {
		if (parentElement?.nodeType === 1) this.parentElement = parentElement;
		else throw new Error("Paper Shaders: parent element must be an HTMLElement");
		this.ownerDocument = parentElement.ownerDocument;
		if (!this.ownerDocument.querySelector("style[data-paper-shader]")) {
			const styleElement = this.ownerDocument.createElement("style");
			styleElement.innerHTML = defaultStyle;
			styleElement.setAttribute("data-paper-shader", "");
			this.ownerDocument.head.prepend(styleElement);
		}
		const canvasElement = this.ownerDocument.createElement("canvas");
		this.canvasElement = canvasElement;
		this.parentElement.prepend(canvasElement);
		this.fragmentShader = fragmentShader;
		this.providedUniforms = uniforms;
		this.mipmaps = mipmaps;
		this.currentFrame = frame;
		this.minPixelRatio = minPixelRatio;
		this.maxPixelCount = maxPixelCount;
		const gl = canvasElement.getContext("webgl2", webGlContextAttributes);
		if (!gl) throw new Error("Paper Shaders: WebGL is not supported in this browser");
		this.gl = gl;
		this.initProgram();
		this.setupPositionAttribute();
		this.setupUniforms();
		this.setUniformValues(this.providedUniforms);
		this.setupResizeObserver();
		visualViewport?.addEventListener("resize", this.handleVisualViewportChange);
		this.setSpeed(speed);
		this.parentElement.setAttribute("data-paper-shader", "");
		this.parentElement.paperShaderMount = this;
		this.ownerDocument.addEventListener("visibilitychange", this.handleDocumentVisibilityChange);
	}
	initProgram = () => {
		const program = createProgram(this.gl, vertexShaderSource, this.fragmentShader);
		if (!program) return;
		this.program = program;
	};
	setupPositionAttribute = () => {
		const positionAttributeLocation = this.gl.getAttribLocation(this.program, "a_position");
		const positionBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
			-1,
			-1,
			1,
			-1,
			-1,
			1,
			-1,
			1,
			1,
			-1,
			1,
			1
		]), this.gl.STATIC_DRAW);
		this.gl.enableVertexAttribArray(positionAttributeLocation);
		this.gl.vertexAttribPointer(positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
	};
	setupUniforms = () => {
		const uniformLocations = {
			u_time: this.gl.getUniformLocation(this.program, "u_time"),
			u_pixelRatio: this.gl.getUniformLocation(this.program, "u_pixelRatio"),
			u_resolution: this.gl.getUniformLocation(this.program, "u_resolution")
		};
		Object.entries(this.providedUniforms).forEach(([key, value]) => {
			uniformLocations[key] = this.gl.getUniformLocation(this.program, key);
			if (value instanceof HTMLImageElement) {
				const aspectRatioUniformName = `${key}AspectRatio`;
				uniformLocations[aspectRatioUniformName] = this.gl.getUniformLocation(this.program, aspectRatioUniformName);
			}
		});
		this.uniformLocations = uniformLocations;
	};
	/**
	* The scale that we should render at.
	* - Used to target 2x rendering even on 1x screens for better antialiasing
	* - Prevents the virtual resolution from going beyond the maximum resolution
	* - Accounts for the page zoom level so we render in physical device pixels rather than CSS pixels
	*/
	renderScale = 1;
	parentWidth = 0;
	parentHeight = 0;
	parentDevicePixelWidth = 0;
	parentDevicePixelHeight = 0;
	devicePixelsSupported = false;
	resizeObserver = null;
	setupResizeObserver = () => {
		this.resizeObserver = new ResizeObserver(([entry]) => {
			if (entry?.borderBoxSize[0]) {
				const physicalPixelSize = entry.devicePixelContentBoxSize?.[0];
				if (physicalPixelSize !== void 0) {
					this.devicePixelsSupported = true;
					this.parentDevicePixelWidth = physicalPixelSize.inlineSize;
					this.parentDevicePixelHeight = physicalPixelSize.blockSize;
				}
				this.parentWidth = entry.borderBoxSize[0].inlineSize;
				this.parentHeight = entry.borderBoxSize[0].blockSize;
			}
			this.handleResize();
		});
		this.resizeObserver.observe(this.parentElement);
	};
	handleVisualViewportChange = () => {
		this.resizeObserver?.disconnect();
		this.setupResizeObserver();
	};
	/** Resize handler for when the container div changes size or the max pixel count changes and we want to resize our canvas to match */
	handleResize = () => {
		let targetPixelWidth = 0;
		let targetPixelHeight = 0;
		const dpr = Math.max(1, window.devicePixelRatio);
		const pinchZoom = visualViewport?.scale ?? 1;
		if (this.devicePixelsSupported) {
			const scaleToMeetMinPixelRatio = Math.max(1, this.minPixelRatio / dpr);
			targetPixelWidth = this.parentDevicePixelWidth * scaleToMeetMinPixelRatio * pinchZoom;
			targetPixelHeight = this.parentDevicePixelHeight * scaleToMeetMinPixelRatio * pinchZoom;
		} else {
			let targetRenderScale = Math.max(dpr, this.minPixelRatio) * pinchZoom;
			if (this.isSafari) {
				const zoomLevel = bestGuessBrowserZoom(this.ownerDocument);
				targetRenderScale *= Math.max(1, zoomLevel);
			}
			targetPixelWidth = Math.round(this.parentWidth) * targetRenderScale;
			targetPixelHeight = Math.round(this.parentHeight) * targetRenderScale;
		}
		const maxPixelCountHeadroom = Math.sqrt(this.maxPixelCount) / Math.sqrt(targetPixelWidth * targetPixelHeight);
		const scaleToMeetMaxPixelCount = Math.min(1, maxPixelCountHeadroom);
		const newWidth = Math.round(targetPixelWidth * scaleToMeetMaxPixelCount);
		const newHeight = Math.round(targetPixelHeight * scaleToMeetMaxPixelCount);
		const newRenderScale = newWidth / Math.round(this.parentWidth);
		if (this.canvasElement.width !== newWidth || this.canvasElement.height !== newHeight || this.renderScale !== newRenderScale) {
			this.renderScale = newRenderScale;
			this.canvasElement.width = newWidth;
			this.canvasElement.height = newHeight;
			this.resolutionChanged = true;
			this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
			this.render(performance.now());
		}
	};
	render = (currentTime) => {
		if (this.hasBeenDisposed) return;
		if (this.program === null) {
			console.warn("Tried to render before program or gl was initialized");
			return;
		}
		const dt = currentTime - this.lastRenderTime;
		this.lastRenderTime = currentTime;
		if (this.currentSpeed !== 0) this.currentFrame += dt * this.currentSpeed;
		this.gl.clear(this.gl.COLOR_BUFFER_BIT);
		this.gl.useProgram(this.program);
		this.gl.uniform1f(this.uniformLocations.u_time, this.currentFrame * .001);
		if (this.resolutionChanged) {
			this.gl.uniform2f(this.uniformLocations.u_resolution, this.gl.canvas.width, this.gl.canvas.height);
			this.gl.uniform1f(this.uniformLocations.u_pixelRatio, this.renderScale);
			this.resolutionChanged = false;
		}
		this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
		if (this.currentSpeed !== 0) this.requestRender();
		else this.rafId = null;
	};
	requestRender = () => {
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.rafId = requestAnimationFrame(this.render);
	};
	/** Creates a texture from an image and sets it into a uniform value */
	setTextureUniform = (uniformName, image) => {
		if (!image.complete || image.naturalWidth === 0) throw new Error(`Paper Shaders: image for uniform ${uniformName} must be fully loaded`);
		const existingTexture = this.textures.get(uniformName);
		if (existingTexture) this.gl.deleteTexture(existingTexture);
		if (!this.textureUnitMap.has(uniformName)) this.textureUnitMap.set(uniformName, this.textureUnitMap.size);
		const textureUnit = this.textureUnitMap.get(uniformName);
		this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
		const texture = this.gl.createTexture();
		this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
		this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
		if (this.mipmaps.includes(uniformName)) {
			this.gl.generateMipmap(this.gl.TEXTURE_2D);
			this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
		}
		const error = this.gl.getError();
		if (error !== this.gl.NO_ERROR || texture === null) {
			console.error("Paper Shaders: WebGL error when uploading texture:", error);
			return;
		}
		this.textures.set(uniformName, texture);
		const location = this.uniformLocations[uniformName];
		if (location) {
			this.gl.uniform1i(location, textureUnit);
			const aspectRatioUniformName = `${uniformName}AspectRatio`;
			const aspectRatioLocation = this.uniformLocations[aspectRatioUniformName];
			if (aspectRatioLocation) {
				const aspectRatio = image.naturalWidth / image.naturalHeight;
				this.gl.uniform1f(aspectRatioLocation, aspectRatio);
			}
		}
	};
	/** Utility: recursive equality test for all the uniforms */
	areUniformValuesEqual = (a, b) => {
		if (a === b) return true;
		if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.every((val, i) => this.areUniformValuesEqual(val, b[i]));
		return false;
	};
	/** Sets the provided uniform values into the WebGL program, can be a partial list of uniforms that have changed */
	setUniformValues = (updatedUniforms) => {
		this.gl.useProgram(this.program);
		Object.entries(updatedUniforms).forEach(([key, value]) => {
			let cacheValue = value;
			if (value instanceof HTMLImageElement) cacheValue = `${value.src.slice(0, 200)}|${value.naturalWidth}x${value.naturalHeight}`;
			if (this.areUniformValuesEqual(this.uniformCache[key], cacheValue)) return;
			this.uniformCache[key] = cacheValue;
			const location = this.uniformLocations[key];
			if (!location) {
				console.warn(`Uniform location for ${key} not found`);
				return;
			}
			if (value instanceof HTMLImageElement) this.setTextureUniform(key, value);
			else if (Array.isArray(value)) {
				let flatArray = null;
				let valueLength = null;
				if (value[0] !== void 0 && Array.isArray(value[0])) {
					const firstChildLength = value[0].length;
					if (value.every((arr) => arr.length === firstChildLength)) {
						flatArray = value.flat();
						valueLength = firstChildLength;
					} else {
						console.warn(`All child arrays must be the same length for ${key}`);
						return;
					}
				} else {
					flatArray = value;
					valueLength = flatArray.length;
				}
				switch (valueLength) {
					case 2:
						this.gl.uniform2fv(location, flatArray);
						break;
					case 3:
						this.gl.uniform3fv(location, flatArray);
						break;
					case 4:
						this.gl.uniform4fv(location, flatArray);
						break;
					case 9:
						this.gl.uniformMatrix3fv(location, false, flatArray);
						break;
					case 16:
						this.gl.uniformMatrix4fv(location, false, flatArray);
						break;
					default: console.warn(`Unsupported uniform array length: ${valueLength}`);
				}
			} else if (typeof value === "number") this.gl.uniform1f(location, value);
			else if (typeof value === "boolean") this.gl.uniform1i(location, value ? 1 : 0);
			else console.warn(`Unsupported uniform type for ${key}: ${typeof value}`);
		});
	};
	/** Gets the current total animation time from 0ms */
	getCurrentFrame = () => {
		return this.currentFrame;
	};
	/** Set a frame to get a deterministic result, frames are literally just milliseconds from zero since the animation started */
	setFrame = (newFrame) => {
		this.currentFrame = newFrame;
		this.lastRenderTime = performance.now();
		this.render(performance.now());
	};
	/** Set an animation speed (or 0 to stop animation) */
	setSpeed = (newSpeed = 1) => {
		this.speed = newSpeed;
		this.setCurrentSpeed(this.ownerDocument.hidden ? 0 : newSpeed);
	};
	setCurrentSpeed = (newSpeed) => {
		this.currentSpeed = newSpeed;
		if (this.rafId === null && newSpeed !== 0) {
			this.lastRenderTime = performance.now();
			this.rafId = requestAnimationFrame(this.render);
		}
		if (this.rafId !== null && newSpeed === 0) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	};
	/** Set the maximum pixel count for the shader, this will limit the number of pixels that will be rendered */
	setMaxPixelCount = (newMaxPixelCount = DEFAULT_MAX_PIXEL_COUNT) => {
		this.maxPixelCount = newMaxPixelCount;
		this.handleResize();
	};
	/** Set the minimum pixel ratio for the shader */
	setMinPixelRatio = (newMinPixelRatio = 2) => {
		this.minPixelRatio = newMinPixelRatio;
		this.handleResize();
	};
	/** Update the uniforms that are provided by the outside shader, can be a partial set with only the uniforms that have changed */
	setUniforms = (newUniforms) => {
		this.setUniformValues(newUniforms);
		this.providedUniforms = {
			...this.providedUniforms,
			...newUniforms
		};
		this.render(performance.now());
	};
	handleDocumentVisibilityChange = () => {
		this.setCurrentSpeed(this.ownerDocument.hidden ? 0 : this.speed);
	};
	/** Dispose of the shader mount, cleaning up all of the WebGL resources */
	dispose = () => {
		this.hasBeenDisposed = true;
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		if (this.gl && this.program) {
			this.textures.forEach((texture) => {
				this.gl.deleteTexture(texture);
			});
			this.textures.clear();
			this.gl.deleteProgram(this.program);
			this.program = null;
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
			this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null);
			this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
			this.gl.getError();
		}
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		visualViewport?.removeEventListener("resize", this.handleVisualViewportChange);
		this.ownerDocument.removeEventListener("visibilitychange", this.handleDocumentVisibilityChange);
		this.uniformLocations = {};
		this.canvasElement.remove();
		delete this.parentElement.paperShaderMount;
	};
};
function createShader(gl, type, source) {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}
function createProgram(gl, vertexShaderSource2, fragmentShaderSource) {
	const format = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);
	const precision = format ? format.precision : null;
	if (precision && precision < 23) {
		vertexShaderSource2 = vertexShaderSource2.replace(/precision\s+(lowp|mediump)\s+float;/g, "precision highp float;");
		fragmentShaderSource = fragmentShaderSource.replace(/precision\s+(lowp|mediump)\s+float/g, "precision highp float").replace(/\b(uniform|varying|attribute)\s+(lowp|mediump)\s+(\w+)/g, "$1 highp $3");
	}
	const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource2);
	const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
	if (!vertexShader || !fragmentShader) return null;
	const program = gl.createProgram();
	if (!program) return null;
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error("Unable to initialize the shader program: " + gl.getProgramInfoLog(program));
		gl.deleteProgram(program);
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		return null;
	}
	gl.detachShader(program, vertexShader);
	gl.detachShader(program, fragmentShader);
	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);
	return program;
}
var defaultStyle = `@layer paper-shaders {
  :where([data-paper-shader]) {
    isolation: isolate;
    position: relative;

    & canvas {
      contain: strict;
      display: block;
      position: absolute;
      inset: 0;
      z-index: -1;
      width: 100%;
      height: 100%;
      border-radius: inherit;
      corner-shape: inherit;
    }
  }
}`;
function isPaperShaderElement(element) {
	return "paperShaderMount" in element;
}
function isSafari() {
	const ua = navigator.userAgent.toLowerCase();
	return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("android");
}
function bestGuessBrowserZoom(doc) {
	const viewportScale = visualViewport?.scale ?? 1;
	const viewportWidth = visualViewport?.width ?? window.innerWidth;
	const scrollbarWidth = window.innerWidth - doc.documentElement.clientWidth;
	const innerWidth = viewportScale * viewportWidth + scrollbarWidth;
	const ratio = outerWidth / innerWidth;
	const zoomPercentageRounded = Math.round(100 * ratio);
	if (zoomPercentageRounded % 5 === 0) return zoomPercentageRounded / 100;
	if (zoomPercentageRounded === 33) return 1 / 3;
	if (zoomPercentageRounded === 67) return 2 / 3;
	if (zoomPercentageRounded === 133) return 4 / 3;
	return ratio;
}
//#endregion
//#region node_modules/@paper-design/shaders/dist/shader-sizing.js
var defaultObjectSizing = {
	fit: "contain",
	scale: 1,
	rotation: 0,
	offsetX: 0,
	offsetY: 0,
	originX: .5,
	originY: .5,
	worldWidth: 0,
	worldHeight: 0
};
var defaultPatternSizing = {
	fit: "none",
	scale: 1,
	rotation: 0,
	offsetX: 0,
	offsetY: 0,
	originX: .5,
	originY: .5,
	worldWidth: 0,
	worldHeight: 0
};
var ShaderFitOptions = {
	none: 0,
	contain: 1,
	cover: 2
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shader-utils.js
var declarePI = `
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
`;
var rotation2 = `
vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}
`;
var proceduralHash11 = `
  float hash11(float p) {
    p = fract(p * 0.3183099) + 0.1;
    p *= p + 19.19;
    return fract(p * p);
  }
`;
var proceduralHash21 = `
  float hash21(vec2 p) {
    p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }
`;
var textureRandomizerR = `
  float randomR(vec2 p) {
    vec2 uv = floor(p) / 100. + .5;
    return texture(u_noiseTexture, fract(uv)).r;
  }
`;
var textureRandomizerGB = `
  vec2 randomGB(vec2 p) {
    vec2 uv = floor(p) / 100. + .5;
    return texture(u_noiseTexture, fract(uv)).gb;
  }
`;
var colorBandingFix = `
  color += 1. / 256. * (fract(sin(dot(.014 * gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123) - .5);
`;
var simplexNoise = `
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;
var fiberNoise = `
float fiberRandom(vec2 p) {
  vec2 uv = floor(p) / 100.;
  return texture(u_noiseTexture, fract(uv)).b;
}

float fiberValueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = fiberRandom(i);
  float b = fiberRandom(i + vec2(1.0, 0.0));
  float c = fiberRandom(i + vec2(0.0, 1.0));
  float d = fiberRandom(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float fiberNoiseFbm(in vec2 n, vec2 seedOffset) {
  float total = 0.0, amplitude = 1.;
  for (int i = 0; i < 4; i++) {
    n = rotate(n, .7);
    total += fiberValueNoise(n + seedOffset) * amplitude;
    n *= 2.;
    amplitude *= 0.6;
  }
  return total;
}

float fiberNoise(vec2 uv, vec2 seedOffset) {
  float epsilon = 0.001;
  float n1 = fiberNoiseFbm(uv + vec2(epsilon, 0.0), seedOffset);
  float n2 = fiberNoiseFbm(uv - vec2(epsilon, 0.0), seedOffset);
  float n3 = fiberNoiseFbm(uv + vec2(0.0, epsilon), seedOffset);
  float n4 = fiberNoiseFbm(uv - vec2(0.0, epsilon), seedOffset);
  return length(vec2(n1 - n2, n3 - n4)) / (2.0 * epsilon);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/mesh-gradient.js
var meshGradientMeta = { maxColorCount: 10 };
var meshGradientFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colors[${meshGradientMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_distortion;
uniform float u_swirl;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_objectUV;
out vec4 fragColor;

${declarePI}
${rotation2}
${proceduralHash21}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float noise(vec2 n, vec2 seedOffset) {
  return valueNoise(n + seedOffset);
}

vec2 getPosition(int i, float t) {
  float a = float(i) * .37;
  float b = .6 + fract(float(i) / 3.) * .9;
  float c = .8 + fract(float(i + 1) / 4.);

  float x = sin(t * b + a);
  float y = cos(t * c + a * 1.5);

  return .5 + .5 * vec2(x, y);
}

void main() {
  vec2 uv = v_objectUV;
  uv += .5;
  vec2 grainUV = uv * 1000.;

  float grain = noise(grainUV, vec2(0.));
  float mixerGrain = .4 * u_grainMixer * (grain - .5);

  const float firstFrameOffset = 41.5;
  float t = .5 * (u_time + firstFrameOffset);

  float radius = smoothstep(0., 1., length(uv - .5));
  float center = 1. - radius;
  for (float i = 1.; i <= 2.; i++) {
    uv.x += u_distortion * center / i * sin(t + i * .4 * smoothstep(.0, 1., uv.y)) * cos(.2 * t + i * 2.4 * smoothstep(.0, 1., uv.y));
    uv.y += u_distortion * center / i * cos(t + i * 2. * smoothstep(.0, 1., uv.x));
  }

  vec2 uvRotated = uv;
  uvRotated -= vec2(.5);
  float angle = 3. * u_swirl * radius;
  uvRotated = rotate(uvRotated, -angle);
  uvRotated += vec2(.5);

  vec3 color = vec3(0.);
  float opacity = 0.;
  float totalWeight = 0.;

  for (int i = 0; i < ${meshGradientMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;

    vec2 pos = getPosition(i, t) + mixerGrain;
    vec3 colorFraction = u_colors[i].rgb * u_colors[i].a;
    float opacityFraction = u_colors[i].a;

    float dist = length(uvRotated - pos);

    dist = pow(dist, 3.5);
    float weight = 1. / (dist + 1e-3);
    color += colorFraction * weight;
    opacity += opacityFraction * weight;
    totalWeight += weight;
  }

  color /= max(1e-4, totalWeight);
  opacity /= max(1e-4, totalWeight);

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/smoke-ring.js
var smokeRingMeta = {
	maxColorCount: 10,
	maxNoiseIterations: 8
};
var smokeRingFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${smokeRingMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_thickness;
uniform float u_radius;
uniform float u_innerShape;
uniform float u_noiseScale;
uniform float u_noiseIterations;

in vec2 v_objectUV;

out vec4 fragColor;

${declarePI}
${textureRandomizerR}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomR(i);
  float b = randomR(i + vec2(1.0, 0.0));
  float c = randomR(i + vec2(0.0, 1.0));
  float d = randomR(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}
vec2 fbm(vec2 n0, vec2 n1) {
  vec2 total = vec2(0.0);
  float amplitude = .4;
  for (int i = 0; i < ${smokeRingMeta.maxNoiseIterations}; i++) {
    if (i >= int(u_noiseIterations)) break;
    total.x += valueNoise(n0) * amplitude;
    total.y += valueNoise(n1) * amplitude;
    n0 *= 1.99;
    n1 *= 1.99;
    amplitude *= 0.65;
  }
  return total;
}

float getNoise(vec2 uv, vec2 pUv, float t) {
  vec2 pUvLeft = pUv + .03 * t;
  float period = max(abs(u_noiseScale * TWO_PI), 1e-6);
  vec2 pUvRight = vec2(fract(pUv.x / period) * period, pUv.y) + .03 * t;
  vec2 noise = fbm(pUvLeft, pUvRight);
  return mix(noise.y, noise.x, smoothstep(-.25, .25, uv.x));
}

float getRingShape(vec2 uv) {
  float radius = u_radius;
  float thickness = u_thickness;

  float distance = length(uv);
  float ringValue = 1. - smoothstep(radius, radius + thickness, distance);
  ringValue *= smoothstep(radius - pow(u_innerShape, 3.) * thickness, radius, distance);

  return ringValue;
}

void main() {
  vec2 shape_uv = v_objectUV;

  float t = u_time;

  float cycleDuration = 3.;
  float period2 = 2.0 * cycleDuration;
  float localTime1 = fract((0.1 * t + cycleDuration) / period2) * period2;
  float localTime2 = fract((0.1 * t) / period2) * period2;
  float timeBlend = .5 + .5 * sin(.1 * t * PI / cycleDuration - .5 * PI);

  float atg = atan(shape_uv.y, shape_uv.x) + .001;
  float l = length(shape_uv);
  float radialOffset = .5 * l - inversesqrt(max(1e-4, l));
  vec2 polar_uv1 = vec2(atg, localTime1 - radialOffset) * u_noiseScale;
  vec2 polar_uv2 = vec2(atg, localTime2 - radialOffset) * u_noiseScale;
  
  float noise1 = getNoise(shape_uv, polar_uv1, t);
  float noise2 = getNoise(shape_uv, polar_uv2, t);

  float noise = mix(noise1, noise2, timeBlend);

  shape_uv *= (.8 + 1.2 * noise);

  float ringShape = getRingShape(shape_uv);

  float mixer = ringShape * ringShape * (u_colorsCount - 1.);
  int idxLast = int(u_colorsCount) - 1;
  vec4 gradient = u_colors[idxLast];
  gradient.rgb *= gradient.a;
  for (int i = ${smokeRingMeta.maxColorCount} - 2; i >= 0; i--) {
    float localT = clamp(mixer - float(idxLast - i - 1), 0., 1.);
    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localT);
  }

  vec3 color = gradient.rgb * ringShape;
  float opacity = gradient.a * ringShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/neuro-noise.js
var neuroNoiseFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_pixelRatio;

uniform vec4 u_colorFront;
uniform vec4 u_colorMid;
uniform vec4 u_colorBack;
uniform float u_brightness;
uniform float u_contrast;

in vec2 v_patternUV;

out vec4 fragColor;

${rotation2}

float neuroShape(vec2 uv, float t) {
  vec2 sine_acc = vec2(0.);
  vec2 res = vec2(0.);
  float scale = 8.;

  for (int j = 0; j < 15; j++) {
    uv = rotate(uv, 1.);
    sine_acc = rotate(sine_acc, 1.);
    vec2 layer = uv * scale + float(j) + sine_acc - t;
    sine_acc += sin(layer);
    res += (.5 + .5 * cos(layer)) / scale;
    scale *= (1.2);
  }
  return res.x + res.y;
}

void main() {
  vec2 shape_uv = v_patternUV;
  shape_uv *= .13;

  float t = .5 * u_time;

  float noise = neuroShape(shape_uv, t);

  noise = (1. + u_brightness) * noise * noise;
  noise = pow(noise, .7 + 6. * u_contrast);
  noise = min(1.4, noise);

  float blend = smoothstep(0.7, 1.4, noise);

  vec4 frontC = u_colorFront;
  frontC.rgb *= frontC.a;
  vec4 midC = u_colorMid;
  midC.rgb *= midC.a;
  vec4 blendFront = mix(midC, frontC, blend);

  float safeNoise = max(noise, 0.0);
  vec3 color = blendFront.rgb * safeNoise;
  float opacity = clamp(blendFront.a * safeNoise, 0., 1.);

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/dot-orbit.js
var dotOrbitMeta = { maxColorCount: 10 };
var dotOrbitFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${dotOrbitMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_stepsPerColor;
uniform float u_size;
uniform float u_sizeRange;
uniform float u_spreading;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${textureRandomizerR}
${textureRandomizerGB}


vec3 voronoiShape(vec2 uv, float time) {
  vec2 i_uv = floor(uv);
  vec2 f_uv = fract(uv);

  float spreading = .25 * clamp(u_spreading, 0., 1.);

  float minDist = 1.;
  vec2 randomizer = vec2(0.);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 tileOffset = vec2(float(x), float(y));
      vec2 rand = randomGB(i_uv + tileOffset);
      vec2 cellCenter = vec2(.5 + 1e-4);
      cellCenter += spreading * cos(time + TWO_PI * rand);
      cellCenter -= .5;
      cellCenter = rotate(cellCenter, randomR(vec2(rand.x, rand.y)) + .1 * time);
      cellCenter += .5;
      float dist = length(tileOffset + cellCenter - f_uv);
      if (dist < minDist) {
        minDist = dist;
        randomizer = rand;
      }
    }
  }

  return vec3(minDist, randomizer);
}

void main() {

  vec2 shape_uv = v_patternUV;
  shape_uv *= 1.5;

  const float firstFrameOffset = -10.;
  float t = u_time + firstFrameOffset;

  vec3 voronoi = voronoiShape(shape_uv, t) + 1e-4;

  float radius = .25 * clamp(u_size, 0., 1.) - .5 * clamp(u_sizeRange, 0., 1.) * voronoi[2];
  float dist = voronoi[0];
  float edgeWidth = fwidth(dist);
  float dots = 1. - smoothstep(radius - edgeWidth, radius + edgeWidth, dist);

  float shape = voronoi[1];

  float mixer = shape * (u_colorsCount - 1.);
  mixer = (shape - .5 / u_colorsCount) * u_colorsCount;
  float steps = max(1., u_stepsPerColor);

  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  for (int i = 1; i < ${dotOrbitMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;
    float localT = clamp(mixer - float(i - 1), 0.0, 1.0);
    localT = round(localT * steps) / steps;
    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localT);
  }

  if ((mixer < 0.) || (mixer > (u_colorsCount - 1.))) {
    float localT = mixer + 1.;
    if (mixer > (u_colorsCount - 1.)) {
      localT = mixer - (u_colorsCount - 1.);
    }
    localT = round(localT * steps) / steps;
    vec4 cFst = u_colors[0];
    cFst.rgb *= cFst.a;
    vec4 cLast = u_colors[int(u_colorsCount - 1.)];
    cLast.rgb *= cLast.a;
    gradient = mix(cLast, cFst, localT);
  }

  vec3 color = gradient.rgb * dots;
  float opacity = gradient.a * dots;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/dot-grid.js
var dotGridFragmentShader = `#version 300 es
precision mediump float;

uniform vec4 u_colorBack;
uniform vec4 u_colorFill;
uniform vec4 u_colorStroke;
uniform float u_dotSize;
uniform float u_gapX;
uniform float u_gapY;
uniform float u_strokeWidth;
uniform float u_sizeRange;
uniform float u_opacityRange;
uniform float u_shape;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${simplexNoise}

float polygon(vec2 p, float N, float rot) {
  float a = atan(p.x, p.y) + rot;
  float r = TWO_PI / float(N);

  return cos(floor(.5 + a / r) * r - a) * length(p);
}

void main() {

  // x100 is a default multiplier between vertex and fragmant shaders
  // we use it to avoid UV presision issues
  vec2 shape_uv = 100. * v_patternUV;

  vec2 gap = max(abs(vec2(u_gapX, u_gapY)), vec2(1e-6));
  vec2 grid = fract(shape_uv / gap) + 1e-4;
  vec2 grid_idx = floor(shape_uv / gap);
  float sizeRandomizer = .5 + .8 * snoise(2. * vec2(grid_idx.x * 100., grid_idx.y));
  float opacity_randomizer = .5 + .7 * snoise(2. * vec2(grid_idx.y, grid_idx.x));

  vec2 center = vec2(0.5) - 1e-3;
  vec2 p = (grid - center) * vec2(u_gapX, u_gapY);

  float baseSize = u_dotSize * (1. - sizeRandomizer * u_sizeRange);
  float strokeWidth = u_strokeWidth * (1. - sizeRandomizer * u_sizeRange);

  float dist;
  if (u_shape < 0.5) {
    // Circle
    dist = length(p);
  } else if (u_shape < 1.5) {
    // Diamond
    strokeWidth *= 1.5;
    dist = polygon(1.5 * p, 4., .25 * PI);
  } else if (u_shape < 2.5) {
    // Square
    dist = polygon(1.03 * p, 4., 1e-3);
  } else {
    // Triangle
    strokeWidth *= 1.5;
    p = p * 2. - 1.;
    p *= .9;
    p.y = 1. - p.y;
    p.y -= .75 * baseSize;
    dist = polygon(p, 3., 1e-3);
  }

  float edgeWidth = fwidth(dist);
  float shapeOuter = 1. - smoothstep(baseSize - edgeWidth, baseSize + edgeWidth, dist - strokeWidth);
  float shapeInner = 1. - smoothstep(baseSize - edgeWidth, baseSize + edgeWidth, dist);
  float stroke = shapeOuter - shapeInner;

  float dotOpacity = max(0., 1. - opacity_randomizer * u_opacityRange);
  stroke *= dotOpacity;
  shapeInner *= dotOpacity;

  stroke *= u_colorStroke.a;
  shapeInner *= u_colorFill.a;

  vec3 color = vec3(0.);
  color += stroke * u_colorStroke.rgb;
  color += shapeInner * u_colorFill.rgb;
  color += (1. - shapeInner - stroke) * u_colorBack.rgb * u_colorBack.a;

  float opacity = 0.;
  opacity += stroke;
  opacity += shapeInner;
  opacity += (1. - opacity) * u_colorBack.a;

  fragColor = vec4(color, opacity);
}
`;
var DotGridShapes = {
	circle: 0,
	diamond: 1,
	square: 2,
	triangle: 3
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/simplex-noise.js
var simplexNoiseMeta = { maxColorCount: 10 };
var simplexNoiseFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;
uniform float u_scale;

uniform vec4 u_colors[${simplexNoiseMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_stepsPerColor;
uniform float u_softness;

in vec2 v_patternUV;

out vec4 fragColor;

${simplexNoise}

float getNoise(vec2 uv, float t) {
  float noise = .5 * snoise(uv - vec2(0., .3 * t));
  noise += .5 * snoise(2. * uv + vec2(0., .32 * t));

  return noise;
}

float steppedSmooth(float m, float steps, float softness) {
  float stepT = floor(m * steps) / steps;
  float f = m * steps - floor(m * steps);
  float fw = steps * fwidth(m);
  float smoothed = smoothstep(.5 - softness, min(1., .5 + softness + fw), f);
  return stepT + smoothed / steps;
}

void main() {
  vec2 shape_uv = v_patternUV;
  shape_uv *= .1;

  float t = .2 * u_time;

  float shape = .5 + .5 * getNoise(shape_uv, t);

  bool u_extraSides = true;

  float mixer = shape * (u_colorsCount - 1.);
  if (u_extraSides == true) {
    mixer = (shape - .5 / u_colorsCount) * u_colorsCount;
  }

  float steps = max(1., u_stepsPerColor);

  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  for (int i = 1; i < ${simplexNoiseMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;

    float localM = clamp(mixer - float(i - 1), 0., 1.);
    localM = steppedSmooth(localM, steps, .5 * u_softness);

    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localM);
  }

  if (u_extraSides == true) {
    if ((mixer < 0.) || (mixer > (u_colorsCount - 1.))) {
      float localM = mixer + 1.;
      if (mixer > (u_colorsCount - 1.)) {
        localM = mixer - (u_colorsCount - 1.);
      }
      localM = steppedSmooth(localM, steps, .5 * u_softness);
      vec4 cFst = u_colors[0];
      cFst.rgb *= cFst.a;
      vec4 cLast = u_colors[int(u_colorsCount - 1.)];
      cLast.rgb *= cLast.a;
      gradient = mix(cLast, cFst, localM);
    }
  }

  vec3 color = gradient.rgb;
  float opacity = gradient.a;

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/metaballs.js
var metaballsMeta = {
	maxColorCount: 8,
	maxBallsCount: 20
};
var metaballsFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${metaballsMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_size;
uniform float u_sizeRange;
uniform float u_count;

in vec2 v_objectUV;

out vec4 fragColor;

${declarePI}
${textureRandomizerR}
float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  vec2 p0 = vec2(i, 0.0);
  vec2 p1 = vec2(i + 1.0, 0.0);
  return mix(randomR(p0), randomR(p1), u);
}

float getBallShape(vec2 uv, vec2 c, float p) {
  float s = .5 * length(uv - c);
  s = 1. - clamp(s, 0., 1.);
  s = pow(s, p);
  return s;
}

void main() {
  vec2 shape_uv = v_objectUV;

  shape_uv += .5;

  const float firstFrameOffset = 2503.4;
  float t = .2 * (u_time + firstFrameOffset);

  vec3 totalColor = vec3(0.);
  float totalShape = 0.;
  float totalOpacity = 0.;

  for (int i = 0; i < ${metaballsMeta.maxBallsCount}; i++) {
    if (i >= int(ceil(u_count))) break;

    float idxFract = float(i) / float(${metaballsMeta.maxBallsCount});
    float angle = TWO_PI * idxFract;

    float speed = 1. - .2 * idxFract;
    float noiseX = noise(angle * 10. + float(i) + t * speed);
    float noiseY = noise(angle * 20. + float(i) - t * speed);

    vec2 pos = vec2(.5) + 1e-4 + .9 * (vec2(noiseX, noiseY) - .5);

    int safeIndex = i % int(u_colorsCount + 0.5);
    vec4 ballColor = u_colors[safeIndex];
    ballColor.rgb *= ballColor.a;

    float sizeFrac = 1.;
    if (float(i) > floor(u_count - 1.)) {
      sizeFrac *= fract(u_count);
    }

    float shape = getBallShape(shape_uv, pos, 45. - 30. * u_size * sizeFrac);
    shape *= pow(u_size, .2);
    shape = smoothstep(0., 1., shape);

    totalColor += ballColor.rgb * shape;
    totalShape += shape;
    totalOpacity += ballColor.a * shape;
  }

  totalColor /= max(totalShape, 1e-4);
  totalOpacity /= max(totalShape, 1e-4);

  float edge_width = fwidth(totalShape);
  float finalShape = smoothstep(.4, .4 + edge_width, totalShape);

  vec3 color = totalColor * finalShape;
  float opacity = totalOpacity * finalShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/perlin-noise.js
var perlinNoiseFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform float u_proportion;
uniform float u_softness;
uniform float u_octaveCount;
uniform float u_persistence;
uniform float u_lacunarity;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${proceduralHash11}
${proceduralHash21}

float hash31(vec3 p) {
  p = fract(p * 0.3183099) + 0.1;
  p += dot(p, p.yzx + 19.19);
  return fract(p.x * (p.y + p.z));
}

vec3 gradientPredefined(float hash) {
  int idx = int(hash * 12.0) % 12;

  if (idx == 0) return vec3(1, 1, 0);
  if (idx == 1) return vec3(-1, 1, 0);
  if (idx == 2) return vec3(1, -1, 0);
  if (idx == 3) return vec3(-1, -1, 0);
  if (idx == 4) return vec3(1, 0, 1);
  if (idx == 5) return vec3(-1, 0, 1);
  if (idx == 6) return vec3(1, 0, -1);
  if (idx == 7) return vec3(-1, 0, -1);
  if (idx == 8) return vec3(0, 1, 1);
  if (idx == 9) return vec3(0, -1, 1);
  if (idx == 10) return vec3(0, 1, -1);
  return vec3(0, -1, -1);// idx == 11
}

float interpolateSafe(float v000, float v001, float v010, float v011,
float v100, float v101, float v110, float v111, vec3 t) {
  t = clamp(t, 0.0, 1.0);

  float v00 = mix(v000, v100, t.x);
  float v01 = mix(v001, v101, t.x);
  float v10 = mix(v010, v110, t.x);
  float v11 = mix(v011, v111, t.x);

  float v0 = mix(v00, v10, t.y);
  float v1 = mix(v01, v11, t.y);

  return mix(v0, v1, t.z);
}

vec3 fade(vec3 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float perlinNoise(vec3 position, float seed) {
  position += vec3(seed * 127.1, seed * 311.7, seed * 74.7);

  vec3 i = floor(position);
  vec3 f = fract(position);
  float h000 = hash31(i);
  float h001 = hash31(i + vec3(0, 0, 1));
  float h010 = hash31(i + vec3(0, 1, 0));
  float h011 = hash31(i + vec3(0, 1, 1));
  float h100 = hash31(i + vec3(1, 0, 0));
  float h101 = hash31(i + vec3(1, 0, 1));
  float h110 = hash31(i + vec3(1, 1, 0));
  float h111 = hash31(i + vec3(1, 1, 1));
  vec3 g000 = gradientPredefined(h000);
  vec3 g001 = gradientPredefined(h001);
  vec3 g010 = gradientPredefined(h010);
  vec3 g011 = gradientPredefined(h011);
  vec3 g100 = gradientPredefined(h100);
  vec3 g101 = gradientPredefined(h101);
  vec3 g110 = gradientPredefined(h110);
  vec3 g111 = gradientPredefined(h111);
  float v000 = dot(g000, f - vec3(0, 0, 0));
  float v001 = dot(g001, f - vec3(0, 0, 1));
  float v010 = dot(g010, f - vec3(0, 1, 0));
  float v011 = dot(g011, f - vec3(0, 1, 1));
  float v100 = dot(g100, f - vec3(1, 0, 0));
  float v101 = dot(g101, f - vec3(1, 0, 1));
  float v110 = dot(g110, f - vec3(1, 1, 0));
  float v111 = dot(g111, f - vec3(1, 1, 1));

  vec3 u = fade(f);
  return interpolateSafe(v000, v001, v010, v011, v100, v101, v110, v111, u);
}

float p_noise(vec3 position, int octaveCount, float persistence, float lacunarity) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 10.0;
  float maxValue = 0.0;
  octaveCount = clamp(octaveCount, 1, 8);

  for (int i = 0; i < octaveCount; i++) {
    float seed = float(i) * 0.7319;
    value += perlinNoise(position * frequency, seed) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value;
}

float get_max_amp(float persistence, float octaveCount) {
  persistence = clamp(persistence * 0.999, 0.0, 0.999);
  octaveCount = clamp(octaveCount, 1.0, 8.0);

  if (abs(persistence - 1.0) < 0.001) {
    return octaveCount;
  }

  return (1.0 - pow(persistence, octaveCount)) / max(1e-4, (1.0 - persistence));
}

void main() {
  vec2 uv = v_patternUV;
  uv *= .5;

  float t = .2 * u_time;

  vec3 p = vec3(uv, t);

  float octCount = floor(u_octaveCount);
  float noise = p_noise(p, int(octCount), u_persistence, u_lacunarity);

  float max_amp = get_max_amp(u_persistence, octCount);
  float noise_normalized = clamp((noise + max_amp) / max(1e-4, (2. * max_amp)) + (u_proportion - .5), 0.0, 1.0);
  float sharpness = clamp(u_softness, 0., 1.);
  float smooth_w = 0.5 * max(fwidth(noise_normalized), 0.001);
  float res = smoothstep(
  .5 - .5 * sharpness - smooth_w,
  .5 + .5 * sharpness + smooth_w,
  noise_normalized
  );

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/voronoi.js
var voronoiMeta = { maxColorCount: 5 };
var voronoiFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform float u_scale;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colors[${voronoiMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_stepsPerColor;
uniform vec4 u_colorGlow;
uniform vec4 u_colorGap;
uniform float u_distortion;
uniform float u_gap;
uniform float u_glow;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${textureRandomizerGB}

vec4 voronoi(vec2 x, float t) {
  vec2 ip = floor(x);
  vec2 fp = fract(x);

  vec2 mg, mr;
  float md = 8.;
  float rand = 0.;

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = randomGB(ip + g);
      float raw_hash = o.x;
      o = .5 + u_distortion * sin(t + TWO_PI * o);
      vec2 r = g + o - fp;
      float d = dot(r, r);

      if (d < md) {
        md = d;
        mr = r;
        mg = g;
        rand = raw_hash;
      }
    }
  }

  md = 8.;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 o = randomGB(ip + g);
      o = .5 + u_distortion * sin(t + TWO_PI * o);
      vec2 r = g + o - fp;
      if (dot(mr - r, mr - r) > .00001) {
        md = min(md, dot(.5 * (mr + r), normalize(r - mr)));
      }
    }
  }

  return vec4(md, mr, rand);
}

void main() {
  vec2 shape_uv = v_patternUV;
  shape_uv *= 1.25;

  float t = u_time;

  vec4 voronoiRes = voronoi(shape_uv, t);

  float shape = clamp(voronoiRes.w, 0., 1.);
  float mixer = shape * (u_colorsCount - 1.);
  mixer = (shape - .5 / u_colorsCount) * u_colorsCount;
  float steps = max(1., u_stepsPerColor);

  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  for (int i = 1; i < ${voronoiMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;
    float localT = clamp(mixer - float(i - 1), 0.0, 1.0);
    localT = round(localT * steps) / steps;
    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localT);
  }

  if ((mixer < 0.) || (mixer > (u_colorsCount - 1.))) {
    float localT = mixer + 1.;
    if (mixer > (u_colorsCount - 1.)) {
      localT = mixer - (u_colorsCount - 1.);
    }
    localT = round(localT * steps) / steps;
    vec4 cFst = u_colors[0];
    cFst.rgb *= cFst.a;
    vec4 cLast = u_colors[int(u_colorsCount - 1.)];
    cLast.rgb *= cLast.a;
    gradient = mix(cLast, cFst, localT);
  }

  vec3 cellColor = gradient.rgb;
  float cellOpacity = gradient.a;

  float glows = length(voronoiRes.yz * u_glow);
  glows = pow(glows, 1.5);

  vec3 color = mix(cellColor, u_colorGlow.rgb * u_colorGlow.a, u_colorGlow.a * glows);
  float opacity = cellOpacity + u_colorGlow.a * glows;

  float edge = voronoiRes.x;
  float smoothEdge = .02 / (2. * u_scale) * (1. + .5 * u_gap);
  edge = smoothstep(u_gap - smoothEdge, u_gap + smoothEdge, edge);

  color = mix(u_colorGap.rgb * u_colorGap.a, color, edge);
  opacity = mix(u_colorGap.a, opacity, edge);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/waves.js
var wavesFragmentShader = `#version 300 es
precision mediump float;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform float u_shape;
uniform float u_frequency;
uniform float u_amplitude;
uniform float u_spacing;
uniform float u_proportion;
uniform float u_softness;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}

void main() {
  vec2 shape_uv = v_patternUV;
  shape_uv *= 4.;

  float wave = .5 * cos(shape_uv.x * u_frequency * TWO_PI);
  float zigzag = 2. * abs(fract(shape_uv.x * u_frequency) - .5);
  float irregular = sin(shape_uv.x * .25 * u_frequency * TWO_PI) * cos(shape_uv.x * u_frequency * TWO_PI);
  float irregular2 = .75 * (sin(shape_uv.x * u_frequency * TWO_PI) + .5 * cos(shape_uv.x * .5 * u_frequency * TWO_PI));

  float offset = mix(zigzag, wave, smoothstep(0., 1., u_shape));
  offset = mix(offset, irregular, smoothstep(1., 2., u_shape));
  offset = mix(offset, irregular2, smoothstep(2., 3., u_shape));
  offset *= 2. * u_amplitude;

  float spacing = (.001 + u_spacing);
  float shape = .5 + .5 * sin((shape_uv.y + offset) * PI / spacing);

  float aa = .0001 + fwidth(shape);
  float dc = 1. - clamp(u_proportion, 0., 1.);
  float e0 = dc - u_softness - aa;
  float e1 = dc + u_softness + aa;
  float res = smoothstep(min(e0, e1), max(e0, e1), shape);

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/warp.js
var warpMeta = { maxColorCount: 10 };
var warpFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;
uniform float u_scale;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colors[${warpMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_proportion;
uniform float u_softness;
uniform float u_shape;
uniform float u_shapeScale;
uniform float u_distortion;
uniform float u_swirl;
uniform float u_swirlIterations;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${rotation2}
float randomG(vec2 p) {
  vec2 uv = floor(p) / 100. + .5;
  return texture(u_noiseTexture, fract(uv)).g;
}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomG(i);
  float b = randomG(i + vec2(1.0, 0.0));
  float c = randomG(i + vec2(0.0, 1.0));
  float d = randomG(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}


void main() {
  vec2 uv = v_patternUV;
  uv *= .5;

  const float firstFrameOffset = 118.;
  float t = 0.0625 * (u_time + firstFrameOffset);

  float n1 = valueNoise(uv * 1. + t);
  float n2 = valueNoise(uv * 2. - t);
  float angle = n1 * TWO_PI;
  uv.x += 4. * u_distortion * n2 * cos(angle);
  uv.y += 4. * u_distortion * n2 * sin(angle);

  float swirl = u_swirl;
  for (int i = 1; i <= 20; i++) {
    if (i >= int(u_swirlIterations)) break;
    float iFloat = float(i);
    //    swirl *= (1. - smoothstep(.0, .25, length(fwidth(uv))));
    uv.x += swirl / iFloat * cos(t + iFloat * 1.5 * uv.y);
    uv.y += swirl / iFloat * cos(t + iFloat * 1. * uv.x);
  }

  float proportion = clamp(u_proportion, 0., 1.);

  float shape = 0.;
  if (u_shape < .5) {
    vec2 checksShape_uv = uv * (.5 + 3.5 * u_shapeScale);
    shape = .5 + .5 * sin(checksShape_uv.x) * cos(checksShape_uv.y);
    shape += .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else if (u_shape < 1.5) {
    vec2 stripesShape_uv = uv * (2. * u_shapeScale);
    float f = fract(stripesShape_uv.y);
    shape = smoothstep(.0, .55, f) * (1.0 - smoothstep(.45, 1., f));
    shape += .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else {
    float shapeScaling = 5. * (1. - u_shapeScale);
    float e0 = 0.45 - shapeScaling;
    float e1 = 0.55 + shapeScaling;
    shape = smoothstep(min(e0, e1), max(e0, e1), 1.0 - uv.y + 0.3 * (proportion - 0.5));
  }

  float mixer = shape * (u_colorsCount - 1.);
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  float aa = fwidth(shape);
  for (int i = 1; i < ${warpMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;
    float m = clamp(mixer - float(i - 1), 0.0, 1.0);

    float localMixerStart = floor(m);
    float softness = .5 * u_softness + fwidth(m);
    float smoothed = smoothstep(max(0., .5 - softness - aa), min(1., .5 + softness + aa), m - localMixerStart);
    float stepped = localMixerStart + smoothed;

    m = mix(stepped, m, u_softness);

    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, m);
  }

  vec3 color = gradient.rgb;
  float opacity = gradient.a;

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
var WarpPatterns = {
	checks: 0,
	stripes: 1,
	edge: 2
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/god-rays.js
var godRaysMeta = { maxColorCount: 5 };
var godRaysFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colorBloom;
uniform vec4 u_colors[${godRaysMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_density;
uniform float u_spotty;
uniform float u_midSize;
uniform float u_midIntensity;
uniform float u_intensity;
uniform float u_bloom;

in vec2 v_objectUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${textureRandomizerR}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomR(i);
  float b = randomR(i + vec2(1.0, 0.0));
  float c = randomR(i + vec2(0.0, 1.0));
  float d = randomR(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

${proceduralHash11}

float raysShape(vec2 uv, float r, float freq, float intensity, float radius) {
  float a = atan(uv.y, uv.x);
  vec2 left = vec2(a * freq, r);
  vec2 right = vec2(fract(a / TWO_PI) * TWO_PI * freq, r);
  float n_left = pow(valueNoise(left), intensity);
  float n_right = pow(valueNoise(right), intensity);
  float shape = mix(n_right, n_left, smoothstep(-.15, .15, uv.x));
  return shape;
}

void main() {
  vec2 shape_uv = v_objectUV;

  float t = .2 * u_time;

  float radius = length(shape_uv);
  float spots = 6.5 * abs(u_spotty);

  float intensity = 4. - 3. * clamp(u_intensity, 0., 1.);

  float delta = 1. - smoothstep(0., 1., radius);

  float midSize = 10. * abs(u_midSize);
  float ms_lo = 0.02 * midSize;
  float ms_hi = max(midSize, 1e-6);
  float middleShape = pow(u_midIntensity, 0.3) * (1. - smoothstep(ms_lo, ms_hi, 3.0 * radius));
  middleShape = pow(middleShape, 5.0);

  vec3 accumColor = vec3(0.0);
  float accumAlpha = 0.0;

  for (int i = 0; i < ${godRaysMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;

    vec2 rotatedUV = rotate(shape_uv, float(i) + 1.0);

    float r1 = radius * (1.0 + 0.4 * float(i)) - 3.0 * t;
    float r2 = 0.5 * radius * (1.0 + spots) - 2.0 * t;
    float density = 6. * u_density + step(.5, u_density) * pow(4.5 * (u_density - .5), 4.);
    float f = mix(1.0, 3.0 + 0.5 * float(i), hash11(float(i) * 15.)) * density;

    float ray = raysShape(rotatedUV, r1, 5.0 * f, intensity, radius);
    ray *= raysShape(rotatedUV, r2, 4.0 * f, intensity, radius);
    ray += (1. + 4. * ray) * middleShape;
    ray = clamp(ray, 0.0, 1.0);

    float srcAlpha = u_colors[i].a * ray;
    vec3 srcColor = u_colors[i].rgb * srcAlpha;

    vec3 alphaBlendColor = accumColor + (1.0 - accumAlpha) * srcColor;
    float alphaBlendAlpha = accumAlpha + (1.0 - accumAlpha) * srcAlpha;

    vec3 addBlendColor = accumColor + srcColor;
    float addBlendAlpha = accumAlpha + srcAlpha;

    accumColor = mix(alphaBlendColor, addBlendColor, u_bloom);
    accumAlpha = mix(alphaBlendAlpha, addBlendAlpha, u_bloom);
  }

  float overlayAlpha = u_colorBloom.a;
  vec3 overlayColor = u_colorBloom.rgb * overlayAlpha;

  vec3 colorWithOverlay = accumColor + accumAlpha * overlayColor;
  accumColor = mix(accumColor, colorWithOverlay, u_bloom);

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;

  vec3 color = accumColor + (1. - accumAlpha) * bgColor;
  float opacity = accumAlpha + (1. - accumAlpha) * u_colorBack.a;
  color = clamp(color, 0., 1.);
  opacity = clamp(opacity, 0., 1.);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/spiral.js
var spiralFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colorFront;
uniform float u_density;
uniform float u_distortion;
uniform float u_strokeWidth;
uniform float u_strokeCap;
uniform float u_strokeTaper;
uniform float u_noise;
uniform float u_noiseFrequency;
uniform float u_softness;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${simplexNoise}

void main() {
  vec2 uv = 2. * v_patternUV;

  float t = u_time;
  float l = length(uv);
  float density = clamp(u_density, 0., 1.);
  l = pow(max(l, 1e-6), density);
  float angle = atan(uv.y, uv.x) - t;
  float angleNormalised = angle / TWO_PI;

  angleNormalised += .125 * u_noise * snoise(16. * pow(u_noiseFrequency, 3.) * uv);

  float offset = l + angleNormalised;
  offset -= u_distortion * (sin(4. * l - .5 * t) * cos(PI + l + .5 * t));
  float stripe = fract(offset);

  float shape = 2. * abs(stripe - .5);
  float width = 1. - clamp(u_strokeWidth, .005 * u_strokeTaper, 1.);


  float wCap = mix(width, (1. - stripe) * (1. - step(.5, stripe)), (1. - clamp(l, 0., 1.)));
  width = mix(width, wCap, u_strokeCap);
  width *= (1. - clamp(u_strokeTaper, 0., 1.) * l);

  float fw = fwidth(offset);
  float fwMult = 4. - 3. * (smoothstep(.05, .4, 2. * u_strokeWidth) * smoothstep(.05, .4, 2. * (1. - u_strokeWidth)));
  float pixelSize = mix(fwMult * fw, fwidth(shape), clamp(fw, 0., 1.));
  pixelSize = mix(pixelSize, .002, u_strokeCap * (1. - clamp(l, 0., 1.)));

  float res = smoothstep(width - pixelSize - u_softness, width + pixelSize + u_softness, shape);

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/swirl.js
var swirlMeta = { maxColorCount: 10 };
var swirlFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${swirlMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_bandCount;
uniform float u_twist;
uniform float u_center;
uniform float u_proportion;
uniform float u_softness;
uniform float u_noise;
uniform float u_noiseFrequency;

in vec2 v_objectUV;

out vec4 fragColor;

${declarePI}
${simplexNoise}
${rotation2}

void main() {
  vec2 shape_uv = v_objectUV;

  float l = length(shape_uv);
  l = max(1e-4, l);

  float t = u_time;

  float angle = ceil(u_bandCount) * atan(shape_uv.y, shape_uv.x) + t;
  float angle_norm = angle / TWO_PI;

  float twist = 3. * clamp(u_twist, 0., 1.);
  float offset = pow(l, -twist) + angle_norm;

  float shape = fract(offset);
  shape = 1. - abs(2. * shape - 1.);
  shape += u_noise * snoise(15. * pow(u_noiseFrequency, 2.) * shape_uv);

  float mid = smoothstep(.2, .2 + .8 * u_center, pow(l, twist));
  shape = mix(0., shape, mid);

  float proportion = clamp(u_proportion, 0., 1.);
  float exponent = mix(.25, 1., proportion * 2.);
  exponent = mix(exponent, 10., max(0., proportion * 2. - 1.));
  shape = pow(shape, exponent);

  float mixer = shape * u_colorsCount;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;

  float outerShape = 0.;
  for (int i = 1; i < ${swirlMeta.maxColorCount + 1}; i++) {
    if (i > int(u_colorsCount)) break;

    float m = clamp(mixer - float(i - 1), 0., 1.);
    float aa = fwidth(m);
    m = smoothstep(.5 - .5 * u_softness - aa, .5 + .5 * u_softness + aa, m);

    if (i == 1) {
      outerShape = m;
    }

    vec4 c = u_colors[i - 1];
    c.rgb *= c.a;
    gradient = mix(gradient, c, m);
  }

  float midAA = .1 * fwidth(pow(l, -twist));
  float outerMid = smoothstep(.2, .2 + midAA, pow(l, twist));
  outerShape = mix(0., outerShape, outerMid);

  vec3 color = gradient.rgb * outerShape;
  float opacity = gradient.a * outerShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/dithering.js
var ditheringFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

uniform float u_pxSize;
uniform vec4 u_colorBack;
uniform vec4 u_colorFront;
uniform float u_shape;
uniform float u_type;

out vec4 fragColor;

${simplexNoise}
${declarePI}
${proceduralHash11}
${proceduralHash21}

float getSimplexNoise(vec2 uv, float t) {
  float noise = .5 * snoise(uv - vec2(0., .3 * t));
  noise += .5 * snoise(2. * uv + vec2(0., .32 * t));

  return noise;
}

const int bayer2x2[4] = int[4](0, 2, 3, 1);
const int bayer4x4[16] = int[16](
0, 8, 2, 10,
12, 4, 14, 6,
3, 11, 1, 9,
15, 7, 13, 5
);

const int bayer8x8[64] = int[64](
0, 32, 8, 40, 2, 34, 10, 42,
48, 16, 56, 24, 50, 18, 58, 26,
12, 44, 4, 36, 14, 46, 6, 38,
60, 28, 52, 20, 62, 30, 54, 22,
3, 35, 11, 43, 1, 33, 9, 41,
51, 19, 59, 27, 49, 17, 57, 25,
15, 47, 7, 39, 13, 45, 5, 37,
63, 31, 55, 23, 61, 29, 53, 21
);

float getBayerValue(vec2 uv, int size) {
  ivec2 pos = ivec2(fract(uv / float(size)) * float(size));
  int index = pos.y * size + pos.x;

  if (size == 2) {
    return float(bayer2x2[index]) / 4.0;
  } else if (size == 4) {
    return float(bayer4x4[index]) / 16.0;
  } else if (size == 8) {
    return float(bayer8x8[index]) / 64.0;
  }
  return 0.0;
}


void main() {
  float t = .5 * u_time;

  float pxSize = u_pxSize * u_pixelRatio;
  vec2 pxSizeUV = gl_FragCoord.xy - .5 * u_resolution;
  pxSizeUV /= pxSize;
  vec2 canvasPixelizedUV = (floor(pxSizeUV) + .5) * pxSize;
  vec2 normalizedUV = canvasPixelizedUV / u_resolution;

  vec2 ditheringNoiseUV = canvasPixelizedUV;
  vec2 shapeUV = normalizedUV;

  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * PI / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
  vec2 boxSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  
  if (u_shape > 3.5) {
    vec2 objectBoxSize = vec2(0.);
    // fit = none
    objectBoxSize.x = min(boxSize.x, boxSize.y);
    if (u_fit == 1.) { // fit = contain
      objectBoxSize.x = min(u_resolution.x, u_resolution.y);
    } else if (u_fit == 2.) { // fit = cover
      objectBoxSize.x = max(u_resolution.x, u_resolution.y);
    }
    objectBoxSize.y = objectBoxSize.x;
    vec2 objectWorldScale = u_resolution.xy / objectBoxSize;

    shapeUV *= objectWorldScale;
    shapeUV += boxOrigin * (objectWorldScale - 1.);
    shapeUV += vec2(-u_offsetX, u_offsetY);
    shapeUV /= u_scale;
    shapeUV = graphicRotation * shapeUV;
  } else {
    vec2 patternBoxSize = vec2(0.);
    // fit = none
    patternBoxSize.x = patternBoxRatio * min(boxSize.x / patternBoxRatio, boxSize.y);
    float patternWorldNoFitBoxWidth = patternBoxSize.x;
    if (u_fit == 1.) { // fit = contain
      patternBoxSize.x = patternBoxRatio * min(u_resolution.x / patternBoxRatio, u_resolution.y);
    } else if (u_fit == 2.) { // fit = cover
      patternBoxSize.x = patternBoxRatio * max(u_resolution.x / patternBoxRatio, u_resolution.y);
    }
    patternBoxSize.y = patternBoxSize.x / patternBoxRatio;
    vec2 patternWorldScale = u_resolution.xy / patternBoxSize;

    shapeUV += vec2(-u_offsetX, u_offsetY) / patternWorldScale;
    shapeUV += boxOrigin;
    shapeUV -= boxOrigin / patternWorldScale;
    shapeUV *= u_resolution.xy;
    shapeUV /= u_pixelRatio;
    if (u_fit > 0.) {
      shapeUV *= (patternWorldNoFitBoxWidth / patternBoxSize.x);
    }
    shapeUV /= u_scale;
    shapeUV = graphicRotation * shapeUV;
    shapeUV += boxOrigin / patternWorldScale;
    shapeUV -= boxOrigin;
    shapeUV += .5;
  }

  float shape = 0.;
  if (u_shape < 1.5) {
    // Simplex noise
    shapeUV *= .001;

    shape = 0.5 + 0.5 * getSimplexNoise(shapeUV, t);
    shape = smoothstep(0.3, 0.9, shape);

  } else if (u_shape < 2.5) {
    // Warp
    shapeUV *= .003;

    for (float i = 1.0; i < 6.0; i++) {
      shapeUV.x += 0.6 / i * cos(i * 2.5 * shapeUV.y + t);
      shapeUV.y += 0.6 / i * cos(i * 1.5 * shapeUV.x + t);
    }

    shape = .15 / max(0.001, abs(sin(t - shapeUV.y - shapeUV.x)));
    shape = smoothstep(0.02, 1., shape);

  } else if (u_shape < 3.5) {
    // Dots
    shapeUV *= .05;

    float stripeIdx = floor(2. * shapeUV.x / TWO_PI);
    float rand = hash11(stripeIdx * 10.);
    rand = sign(rand - .5) * pow(.1 + abs(rand), .4);
    shape = sin(shapeUV.x) * cos(shapeUV.y - 5. * rand * t);
    shape = pow(abs(shape), 6.);

  } else if (u_shape < 4.5) {
    // Sine wave
    shapeUV *= 4.;

    float wave = cos(.5 * shapeUV.x - 2. * t) * sin(1.5 * shapeUV.x + t) * (.75 + .25 * cos(3. * t));
    shape = 1. - smoothstep(-1., 1., shapeUV.y + wave);

  } else if (u_shape < 5.5) {
    // Ripple

    float dist = length(shapeUV);
    float waves = sin(pow(dist, 1.7) * 7. - 3. * t) * .5 + .5;
    shape = waves;

  } else if (u_shape < 6.5) {
    // Swirl

    float l = length(shapeUV);
    float angle = 6. * atan(shapeUV.y, shapeUV.x) + 4. * t;
    float twist = 1.2;
    float offset = 1. / pow(max(l, 1e-6), twist) + angle / TWO_PI;
    float mid = smoothstep(0., 1., pow(l, twist));
    shape = mix(0., fract(offset), mid);

  } else {
    // Sphere
    shapeUV *= 2.;

    float d = 1. - pow(length(shapeUV), 2.);
    vec3 pos = vec3(shapeUV, sqrt(max(0., d)));
    vec3 lightPos = normalize(vec3(cos(1.5 * t), .8, sin(1.25 * t)));
    shape = .5 + .5 * dot(lightPos, pos);
    shape *= step(0., d);
  }


  int type = int(floor(u_type));
  float dithering = 0.0;

  switch (type) {
    case 1: {
      dithering = step(hash21(ditheringNoiseUV), shape);
    } break;
    case 2:
    dithering = getBayerValue(pxSizeUV, 2);
    break;
    case 3:
    dithering = getBayerValue(pxSizeUV, 4);
    break;
    default :
    dithering = getBayerValue(pxSizeUV, 8);
    break;
  }

  dithering -= .5;
  float res = step(.5, shape + dithering);

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);

  fragColor = vec4(color, opacity);
}
`;
var DitheringShapes = {
	simplex: 1,
	warp: 2,
	dots: 3,
	wave: 4,
	ripple: 5,
	swirl: 6,
	sphere: 7
};
var DitheringTypes = {
	"random": 1,
	"2x2": 2,
	"4x4": 3,
	"8x8": 4
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/grain-gradient.js
var grainGradientMeta = { maxColorCount: 7 };
var grainGradientFragmentShader = `#version 300 es
precision lowp float;

uniform mediump float u_time;
uniform mediump vec2 u_resolution;
uniform mediump float u_pixelRatio;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${grainGradientMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_softness;
uniform float u_intensity;
uniform float u_noise;
uniform float u_shape;

uniform mediump float u_originX;
uniform mediump float u_originY;
uniform mediump float u_worldWidth;
uniform mediump float u_worldHeight;
uniform mediump float u_fit;

uniform mediump float u_scale;
uniform mediump float u_rotation;
uniform mediump float u_offsetX;
uniform mediump float u_offsetY;

in vec2 v_objectUV;
in vec2 v_patternUV;
in vec2 v_objectBoxSize;
in vec2 v_patternBoxSize;

out vec4 fragColor;

${declarePI}
${simplexNoise}
${rotation2}
${textureRandomizerR}

float valueNoiseR(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomR(i);
  float b = randomR(i + vec2(1.0, 0.0));
  float c = randomR(i + vec2(0.0, 1.0));
  float d = randomR(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}
vec4 fbmR(vec2 n0, vec2 n1, vec2 n2, vec2 n3) {
  float amplitude = 0.2;
  vec4 total = vec4(0.);
  for (int i = 0; i < 3; i++) {
    n0 = rotate(n0, 0.3);
    n1 = rotate(n1, 0.3);
    n2 = rotate(n2, 0.3);
    n3 = rotate(n3, 0.3);
    total.x += valueNoiseR(n0) * amplitude;
    total.y += valueNoiseR(n1) * amplitude;
    total.z += valueNoiseR(n2) * amplitude;
    total.z += valueNoiseR(n3) * amplitude;
    n0 *= 1.99;
    n1 *= 1.99;
    n2 *= 1.99;
    n3 *= 1.99;
    amplitude *= 0.6;
  }
  return total;
}

${proceduralHash11}

vec2 truchet(vec2 uv, float idx){
  idx = fract(((idx - .5) * 2.));
  if (idx > 0.75) {
    uv = vec2(1.0) - uv;
  } else if (idx > 0.5) {
    uv = vec2(1.0 - uv.x, uv.y);
  } else if (idx > 0.25) {
    uv = 1.0 - vec2(1.0 - uv.x, uv.y);
  }
  return uv;
}

void main() {

  const float firstFrameOffset = 7.;
  float t = .1 * (u_time + firstFrameOffset);

  vec2 shape_uv = vec2(0.);
  vec2 grain_uv = vec2(0.);

  float r = u_rotation * PI / 180.;
  float cr = cos(r);
  float sr = sin(r);
  mat2 graphicRotation = mat2(cr, sr, -sr, cr);
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  if (u_shape > 3.5) {
    shape_uv = v_objectUV;
    grain_uv = shape_uv;

    // apply inverse transform to grain_uv so it respects the originXY
    grain_uv = transpose(graphicRotation) * grain_uv;
    grain_uv *= u_scale;
    grain_uv -= graphicOffset;
    grain_uv *= v_objectBoxSize;
    grain_uv *= .7;
  } else {
    shape_uv = .5 * v_patternUV;
    grain_uv = 100. * v_patternUV;

    // apply inverse transform to grain_uv so it respects the originXY
    grain_uv = transpose(graphicRotation) * grain_uv;
    grain_uv *= u_scale;
    if (u_fit > 0.) {
      vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
      givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
      float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
      vec2 patternBoxGivenSize = vec2(
      (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
      (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
      );
      patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;
      float patternBoxNoFitBoxWidth = patternBoxRatio * min(patternBoxGivenSize.x / patternBoxRatio, patternBoxGivenSize.y);
      grain_uv /= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);
    }
    vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;
    grain_uv -= graphicOffset / patternBoxScale;
    grain_uv *= 1.6;
  }


  float shape = 0.;

  if (u_shape < 1.5) {
    // Sine wave

    float wave = cos(.5 * shape_uv.x - 4. * t) * sin(1.5 * shape_uv.x + 2. * t) * (.75 + .25 * cos(6. * t));
    shape = 1. - smoothstep(-1., 1., shape_uv.y + wave);

  } else if (u_shape < 2.5) {
    // Grid (dots)

    float stripeIdx = floor(2. * shape_uv.x / TWO_PI);
    float rand = hash11(stripeIdx * 100.);
    rand = sign(rand - .5) * pow(4. * abs(rand), .3);
    shape = sin(shape_uv.x) * cos(shape_uv.y - 5. * rand * t);
    shape = pow(abs(shape), 4.);

  } else if (u_shape < 3.5) {
    // Truchet pattern

    float n2 = valueNoiseR(shape_uv * .4 - 3.75 * t);
    shape_uv.x += 10.;
    shape_uv *= .6;

    vec2 tile = truchet(fract(shape_uv), randomR(floor(shape_uv)));

    float distance1 = length(tile);
    float distance2 = length(tile - vec2(1.));

    n2 -= .5;
    n2 *= .1;
    shape = smoothstep(.2, .55, distance1 + n2) * (1. - smoothstep(.45, .8, distance1 - n2));
    shape += smoothstep(.2, .55, distance2 + n2) * (1. - smoothstep(.45, .8, distance2 - n2));

    shape = pow(shape, 1.5);

  } else if (u_shape < 4.5) {
    // Corners

    shape_uv *= .6;
    vec2 outer = vec2(.5);

    vec2 bl = smoothstep(vec2(0.), outer, shape_uv + vec2(.1 + .1 * sin(3. * t), .2 - .1 * sin(5.25 * t)));
    vec2 tr = smoothstep(vec2(0.), outer, 1. - shape_uv);
    shape = 1. - bl.x * bl.y * tr.x * tr.y;

    shape_uv = -shape_uv;
    bl = smoothstep(vec2(0.), outer, shape_uv + vec2(.1 + .1 * sin(3. * t), .2 - .1 * cos(5.25 * t)));
    tr = smoothstep(vec2(0.), outer, 1. - shape_uv);
    shape -= bl.x * bl.y * tr.x * tr.y;

    shape = 1. - smoothstep(0., 1., shape);

  } else if (u_shape < 5.5) {
    // Ripple

    shape_uv *= 2.;
    float dist = length(.4 * shape_uv);
    float waves = sin(pow(dist, 1.2) * 5. - 3. * t) * .5 + .5;
    shape = waves;

  } else if (u_shape < 6.5) {
    // Blob

    t *= 2.;

    vec2 f1_traj = .25 * vec2(1.3 * sin(t), .2 + 1.3 * cos(.6 * t + 4.));
    vec2 f2_traj = .2 * vec2(1.2 * sin(-t), 1.3 * sin(1.6 * t));
    vec2 f3_traj = .25 * vec2(1.7 * cos(-.6 * t), cos(-1.6 * t));
    vec2 f4_traj = .3 * vec2(1.4 * cos(.8 * t), 1.2 * sin(-.6 * t - 3.));

    shape = .5 * pow(1. - clamp(0., 1., length(shape_uv + f1_traj)), 5.);
    shape += .5 * pow(1. - clamp(0., 1., length(shape_uv + f2_traj)), 5.);
    shape += .5 * pow(1. - clamp(0., 1., length(shape_uv + f3_traj)), 5.);
    shape += .5 * pow(1. - clamp(0., 1., length(shape_uv + f4_traj)), 5.);

    shape = smoothstep(.0, .9, shape);
    float edge = smoothstep(.25, .3, shape);
    shape = mix(.0, shape, edge);

  } else {
    // Sphere

    shape_uv *= 2.;
    float d = 1. - pow(length(shape_uv), 2.);
    vec3 pos = vec3(shape_uv, sqrt(max(d, 0.)));
    vec3 lightPos = normalize(vec3(cos(1.5 * t), .8, sin(1.25 * t)));
    shape = .5 + .5 * dot(lightPos, pos);
    shape *= step(0., d);
  }

  float baseNoise = snoise(grain_uv * .5);
  vec4 fbmVals = fbmR(
  .002 * grain_uv + 10.,
  .003 * grain_uv,
  .001 * grain_uv,
  rotate(.4 * grain_uv, 2.)
  );
  float grainDist = baseNoise * snoise(grain_uv * .2) - fbmVals.x - fbmVals.y;
  float rawNoise = .75 * baseNoise - fbmVals.w - fbmVals.z;
  float noise = clamp(rawNoise, 0., 1.);

  shape += u_intensity * 2. / u_colorsCount * (grainDist + .5);
  shape += u_noise * 10. / u_colorsCount * noise;

  float aa = fwidth(shape);

  shape = clamp(shape - .5 / u_colorsCount, 0., 1.);
  float totalShape = smoothstep(0., u_softness + 2. * aa, clamp(shape * u_colorsCount, 0., 1.));
  float mixer = shape * (u_colorsCount - 1.);

  int cntStop = int(u_colorsCount) - 1;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  for (int i = 1; i < ${grainGradientMeta.maxColorCount}; i++) {
    if (i > cntStop) break;

    float localT = clamp(mixer - float(i - 1), 0., 1.);
    localT = smoothstep(.5 - .5 * u_softness - aa, .5 + .5 * u_softness + aa, localT);

    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localT);
  }

  vec3 color = gradient.rgb * totalShape;
  float opacity = gradient.a * totalShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  fragColor = vec4(color, opacity);
}
`;
var GrainGradientShapes = {
	wave: 1,
	dots: 2,
	truchet: 3,
	corners: 4,
	ripple: 5,
	blob: 6,
	sphere: 7
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/pulsing-border.js
var pulsingBorderMeta = {
	maxColorCount: 5,
	maxSpots: 4
};
var pulsingBorderFragmentShader = `#version 300 es
precision lowp float;

uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${pulsingBorderMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_roundness;
uniform float u_thickness;
uniform float u_marginLeft;
uniform float u_marginRight;
uniform float u_marginTop;
uniform float u_marginBottom;
uniform float u_aspectRatio;
uniform float u_softness;
uniform float u_intensity;
uniform float u_bloom;
uniform float u_spotSize;
uniform float u_spots;
uniform float u_pulse;
uniform float u_smoke;
uniform float u_smokeSize;

uniform sampler2D u_noiseTexture;

in vec2 v_responsiveUV;
in vec2 v_responsiveBoxGivenSize;
in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}

float beat(float time) {
  float first = pow(abs(sin(time * TWO_PI)), 10.);
  float second = pow(abs(sin((time - .15) * TWO_PI)), 10.);

  return clamp(first + 0.6 * second, 0.0, 1.0);
}

float sst(float edge0, float edge1, float x) {
  return smoothstep(edge0, edge1, x);
}

float roundedBox(vec2 uv, vec2 halfSize, float distance, float cornerDistance, float thickness, float softness) {
  float borderDistance = abs(distance);
  float aa = 2. * fwidth(distance);
  float border = 1. - sst(min(mix(thickness, -thickness, softness), thickness + aa), max(mix(thickness, -thickness, softness), thickness + aa), borderDistance);
  float cornerFadeCircles = 0.;
  cornerFadeCircles = mix(1., cornerFadeCircles, sst(0., 1., length((uv + halfSize) / thickness)));
  cornerFadeCircles = mix(1., cornerFadeCircles, sst(0., 1., length((uv - vec2(-halfSize.x, halfSize.y)) / thickness)));
  cornerFadeCircles = mix(1., cornerFadeCircles, sst(0., 1., length((uv - vec2(halfSize.x, -halfSize.y)) / thickness)));
  cornerFadeCircles = mix(1., cornerFadeCircles, sst(0., 1., length((uv - halfSize) / thickness)));
  aa = fwidth(cornerDistance);
  float cornerFade = sst(0., mix(aa, thickness, softness), cornerDistance);
  cornerFade *= cornerFadeCircles;
  border += cornerFade;
  return border;
}

${textureRandomizerGB}

float randomG(vec2 p) {
  vec2 uv = floor(p) / 100. + .5;
  return texture(u_noiseTexture, fract(uv)).g;
}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomG(i);
  float b = randomG(i + vec2(1.0, 0.0));
  float c = randomG(i + vec2(0.0, 1.0));
  float d = randomG(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

void main() {
  const float firstFrameOffset = 109.;
  float t = 1.2 * (u_time + firstFrameOffset);

  vec2 borderUV = v_responsiveUV;
  float pulse = u_pulse * beat(.18 * u_time);

  float canvasRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 halfSize = vec2(.5);
  borderUV.x *= max(canvasRatio, 1.);
  borderUV.y /= min(canvasRatio, 1.);
  halfSize.x *= max(canvasRatio, 1.);
  halfSize.y /= min(canvasRatio, 1.);

  float mL = u_marginLeft;
  float mR = u_marginRight;
  float mT = u_marginTop;
  float mB = u_marginBottom;
  float mX = mL + mR;
  float mY = mT + mB;

  if (u_aspectRatio > 0.) {
    float shapeRatio = canvasRatio * (1. - mX) / max(1. - mY, 1e-6);
    float freeX = shapeRatio > 1. ? (1. - mX) * (1. - 1. / max(abs(shapeRatio), 1e-6)) : 0.;
    float freeY = shapeRatio < 1. ? (1. - mY) * (1. - shapeRatio) : 0.;
    mL += freeX * 0.5;
    mR += freeX * 0.5;
    mT += freeY * 0.5;
    mB += freeY * 0.5;
    mX = mL + mR;
    mY = mT + mB;
  }

  float thickness = .5 * u_thickness * min(halfSize.x, halfSize.y);

  halfSize.x *= (1. - mX);
  halfSize.y *= (1. - mY);

  vec2 centerShift = vec2(
  (mL - mR) * max(canvasRatio, 1.) * 0.5,
  (mB - mT) / min(canvasRatio, 1.) * 0.5
  );

  borderUV -= centerShift;
  halfSize -= mix(thickness, 0., u_softness);

  float radius = mix(0., min(halfSize.x, halfSize.y), u_roundness);
  vec2 d = abs(borderUV) - halfSize + radius;
  float outsideDistance = length(max(d, .0001)) - radius;
  float insideDistance = min(max(d.x, d.y), .0001);
  float cornerDistance = abs(min(max(d.x, d.y) - .45 * radius, .0));
  float distance = outsideDistance + insideDistance;

  float borderThickness = mix(thickness, 3. * thickness, u_softness);
  float border = roundedBox(borderUV, halfSize, distance, cornerDistance, borderThickness, u_softness);
  border = pow(border, 1. + u_softness);

  vec2 smokeUV = .3 * u_smokeSize * v_patternUV;
  float smoke = clamp(3. * valueNoise(2.7 * smokeUV + .5 * t), 0., 1.);
  smoke -= valueNoise(3.4 * smokeUV - .5 * t);
  float smokeThickness = thickness + .2;
  smokeThickness = min(.4, max(smokeThickness, .1));
  smoke *= roundedBox(borderUV, halfSize, distance, cornerDistance, smokeThickness, 1.);
  smoke = 30. * smoke * smoke;
  smoke *= mix(0., .5, pow(u_smoke, 2.));
  smoke *= mix(1., pulse, u_pulse);
  smoke = clamp(smoke, 0., 1.);
  border += smoke;

  border = clamp(border, 0., 1.);

  vec3 blendColor = vec3(0.);
  float blendAlpha = 0.;
  vec3 addColor = vec3(0.);
  float addAlpha = 0.;

  float bloom = 4. * u_bloom;
  float intensity = 1. + (1. + 4. * u_softness) * u_intensity;

  float angle = atan(borderUV.y, borderUV.x) / TWO_PI;

  for (int colorIdx = 0; colorIdx < ${pulsingBorderMeta.maxColorCount}; colorIdx++) {
    if (colorIdx >= int(u_colorsCount)) break;
    float colorIdxF = float(colorIdx);

    vec3 c = u_colors[colorIdx].rgb * u_colors[colorIdx].a;
    float a = u_colors[colorIdx].a;

    for (int spotIdx = 0; spotIdx < ${pulsingBorderMeta.maxSpots}; spotIdx++) {
      if (spotIdx >= int(u_spots)) break;
      float spotIdxF = float(spotIdx);

      vec2 randVal = randomGB(vec2(spotIdxF * 10. + 2., 40. + colorIdxF));

      float time = (.1 + .15 * abs(sin(spotIdxF * (2. + colorIdxF)) * cos(spotIdxF * (2. + 2.5 * colorIdxF)))) * t + randVal.x * 3.;
      time *= mix(1., -1., step(.5, randVal.y));

      float mask = .5 + .5 * mix(
      sin(t + spotIdxF * (5. - 1.5 * colorIdxF)),
      cos(t + spotIdxF * (3. + 1.3 * colorIdxF)),
      step(mod(colorIdxF, 2.), .5)
      );

      float p = clamp(2. * u_pulse - randVal.x, 0., 1.);
      mask = mix(mask, pulse, p);

      float atg1 = fract(angle + time);
      float spotSize = .05 + .6 * pow(u_spotSize, 2.) + .05 * randVal.x;
      spotSize = mix(spotSize, .1, p);
      float sector = sst(.5 - spotSize, .5, atg1) * (1. - sst(.5, .5 + spotSize, atg1));

      sector *= mask;
      sector *= border;
      sector *= intensity;
      sector = clamp(sector, 0., 1.);

      vec3 srcColor = c * sector;
      float srcAlpha = a * sector;

      blendColor += ((1. - blendAlpha) * srcColor);
      blendAlpha = blendAlpha + (1. - blendAlpha) * srcAlpha;
      addColor += srcColor;
      addAlpha += srcAlpha;
    }
  }

  vec3 accumColor = mix(blendColor, addColor, bloom);
  float accumAlpha = mix(blendAlpha, addAlpha, bloom);
  accumAlpha = clamp(accumAlpha, 0., 1.);

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  vec3 color = accumColor + (1. - accumAlpha) * bgColor;
  float opacity = accumAlpha + (1. - accumAlpha) * u_colorBack.a;

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}`;
var PulsingBorderAspectRatios = {
	auto: 0,
	square: 1
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/color-panels.js
var colorPanelsMeta = { maxColorCount: 7 };
var colorPanelsFragmentShader = `#version 300 es
precision lowp float;

uniform float u_time;
uniform mediump float u_scale;

uniform vec4 u_colors[${colorPanelsMeta.maxColorCount}];
uniform float u_colorsCount;
uniform vec4 u_colorBack;
uniform float u_density;
uniform float u_angle1;
uniform float u_angle2;
uniform float u_length;
uniform bool u_edges;
uniform float u_blur;
uniform float u_fadeIn;
uniform float u_fadeOut;
uniform float u_gradient;

in vec2 v_objectUV;

out vec4 fragColor;

${declarePI}

const float zLimit = .5;

vec2 getPanel(float angle, vec2 uv, float invLength, float aa) {
  float sinA = sin(angle);
  float cosA = cos(angle);

  float denom = sinA - uv.y * cosA;
  if (abs(denom) < .01) return vec2(0.);

  float z = uv.y / denom;

  if (z <= 0. || z > zLimit) return vec2(0.);

  float zRatio = z / zLimit;
  float panelMap = 1. - zRatio;
  float x = uv.x * (cosA * z + 1.) * invLength;

  float zOffset = zRatio - .5;
  float left = -.5 + zOffset * u_angle1;
  float right = .5 - zOffset * u_angle2;
  float blurX = aa + 2. * panelMap * u_blur;

  float leftEdge1 = left - blurX;
  float leftEdge2 = left + .25 * blurX;
  float rightEdge1 = right - .25 * blurX;
  float rightEdge2 = right + blurX;

  float panel = smoothstep(leftEdge1, leftEdge2, x) * (1.0 - smoothstep(rightEdge1, rightEdge2, x));
  panel *= mix(0., panel, smoothstep(0., .01 / max(u_scale, 1e-6), panelMap));

  float midScreen = abs(sinA);
  if (u_edges == true) {
    panelMap = mix(.99, panelMap, panel * clamp(panelMap / (.15 * (1. - pow(midScreen, .1))), 0.0, 1.0));
  } else if (midScreen < .07) {
    panel *= (midScreen * 15.);
  }

  return vec2(panel, panelMap);
}

vec4 blendColor(vec4 colorA, float panelMask, float panelMap) {
  float fade = 1. - smoothstep(.97 - .97 * u_fadeIn, 1., panelMap);

  fade *= smoothstep(-.2 * (1. - u_fadeOut), u_fadeOut, panelMap);

  vec3 blendedRGB = mix(vec3(0.), colorA.rgb, fade);
  float blendedAlpha = mix(0., colorA.a, fade);

  return vec4(blendedRGB, blendedAlpha) * panelMask;
}

void main() {
  vec2 uv = v_objectUV;
  uv *= 1.25;

  float t = .02 * u_time;
  t = fract(t);
  bool reverseTime = (t < 0.5);

  vec3 color = vec3(0.);
  float opacity = 0.;

  float aa = .005 / u_scale;
  int colorsCount = int(u_colorsCount);

  vec4 premultipliedColors[${colorPanelsMeta.maxColorCount}];
  for (int i = 0; i < ${colorPanelsMeta.maxColorCount}; i++) {
    if (i >= colorsCount) break;
    vec4 c = u_colors[i];
    c.rgb *= c.a;
    premultipliedColors[i] = c;
  }

  float invLength = 1.5 / max(u_length, .001);

  float totalColorWeight = 0.;
  int panelsNumber = 12;

  float densityNormalizer = 1.;
  if (colorsCount == 4) {
    panelsNumber = 16;
    densityNormalizer = 1.34;
  } else if (colorsCount == 5) {
    panelsNumber = 20;
    densityNormalizer = 1.67;
  } else if (colorsCount == 7) {
    panelsNumber = 14;
    densityNormalizer = 1.17;
  }

  float fPanelsNumber = float(panelsNumber);

  float totalPanelsShape = 0.;
  float panelGrad = 1. - clamp(u_gradient, 0., 1.);

  for (int set = 0; set < 2; set++) {
    bool isForward = (set == 0 && !reverseTime) || (set == 1 && reverseTime);
    if (!isForward) continue;

    for (int i = 0; i <= 20; i++) {
      if (i >= panelsNumber) break;

      int idx = panelsNumber - 1 - i;

      float offset = float(idx) / fPanelsNumber;
      if (set == 1) {
        offset += .5;
      }

      float densityFract = densityNormalizer * fract(t + offset);
      float angleNorm = densityFract / u_density;
      if (densityFract >= .5 || angleNorm >= .3) continue;

      float smoothDensity = clamp((.5 - densityFract) / .1, 0., 1.) * clamp(densityFract / .01, 0., 1.);
      float smoothAngle = clamp((.3 - angleNorm) / .05, 0., 1.);
      if (smoothDensity * smoothAngle < .001) continue;

      if (angleNorm > .5) {
        angleNorm = 0.5;
      }
      vec2 panel = getPanel(angleNorm * TWO_PI + PI, uv, invLength, aa);
      if (panel[0] <= .001) continue;
      float panelMask = panel[0] * smoothDensity * smoothAngle;
      float panelMap = panel[1];

      int colorIdx = idx % colorsCount;
      int nextColorIdx = (idx + 1) % colorsCount;

      vec4 colorA = premultipliedColors[colorIdx];
      vec4 colorB = premultipliedColors[nextColorIdx];

      colorA = mix(colorA, colorB, max(0., smoothstep(.0, .45, panelMap) - panelGrad));
      vec4 blended = blendColor(colorA, panelMask, panelMap);
      color = blended.rgb + color * (1. - blended.a);
      opacity = blended.a + opacity * (1. - blended.a);
    }


    for (int i = 0; i <= 20; i++) {
      if (i >= panelsNumber) break;

      int idx = panelsNumber - 1 - i;

      float offset = float(idx) / fPanelsNumber;
      if (set == 0) {
        offset += .5;
      }

      float densityFract = densityNormalizer * fract(-t + offset);
      float angleNorm = -densityFract / u_density;
      if (densityFract >= .5 || angleNorm < -.3) continue;

      float smoothDensity = clamp((.5 - densityFract) / .1, 0., 1.) * clamp(densityFract / .01, 0., 1.);
      float smoothAngle = clamp((angleNorm + .3) / .05, 0., 1.);
      if (smoothDensity * smoothAngle < .001) continue;

      vec2 panel = getPanel(angleNorm * TWO_PI + PI, uv, invLength, aa);
      float panelMask = panel[0] * smoothDensity * smoothAngle;
      if (panelMask <= .001) continue;
      float panelMap = panel[1];

      int colorIdx = (colorsCount - (idx % colorsCount)) % colorsCount;
      if (colorIdx < 0) colorIdx += colorsCount;
      int nextColorIdx = (colorIdx + 1) % colorsCount;

      vec4 colorA = premultipliedColors[colorIdx];
      vec4 colorB = premultipliedColors[nextColorIdx];

      colorA = mix(colorA, colorB, max(0., smoothstep(.0, .45, panelMap) - panelGrad));
      vec4 blended = blendColor(colorA, panelMask, panelMap);
      color = blended.rgb + color * (1. - blended.a);
      opacity = blended.a + opacity * (1. - blended.a);
    }
  }

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/static-mesh-gradient.js
var staticMeshGradientMeta = { maxColorCount: 10 };
var staticMeshGradientFragmentShader = `#version 300 es
precision mediump float;

uniform vec4 u_colors[${staticMeshGradientMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_positions;
uniform float u_waveX;
uniform float u_waveXShift;
uniform float u_waveY;
uniform float u_waveYShift;
uniform float u_mixing;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_objectUV;
out vec4 fragColor;

${declarePI}
${rotation2}
${proceduralHash21}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float noise(vec2 n, vec2 seedOffset) {
  return valueNoise(n + seedOffset);
}

vec2 getPosition(int i, float t) {
  float a = float(i) * .37;
  float b = .6 + mod(float(i), 3.) * .3;
  float c = .8 + mod(float(i + 1), 4.) * 0.25;

  float x = sin(t * b + a);
  float y = cos(t * c + a * 1.5);

  return .5 + .5 * vec2(x, y);
}

void main() {
  vec2 uv = v_objectUV;
  uv += .5;
  vec2 grainUV = uv * 1000.;

  float grain = noise(grainUV, vec2(0.));
  float mixerGrain = .4 * u_grainMixer * (grain - .5);

  float radius = smoothstep(0., 1., length(uv - .5));
  float center = 1. - radius;
  for (float i = 1.; i <= 2.; i++) {
    uv.x += u_waveX * center / i * cos(TWO_PI * u_waveXShift + i * 2. * smoothstep(.0, 1., uv.y));
    uv.y += u_waveY * center / i * cos(TWO_PI * u_waveYShift + i * 2. * smoothstep(.0, 1., uv.x));
  }

  vec3 color = vec3(0.);
  float opacity = 0.;
  float totalWeight = 0.;
  float positionSeed = 25. + .33 * u_positions;

  for (int i = 0; i < ${staticMeshGradientMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;

    vec2 pos = getPosition(i, positionSeed) + mixerGrain;
    float dist = length(uv - pos);
    dist = length(uv - pos);

    vec3 colorFraction = u_colors[i].rgb * u_colors[i].a;
    float opacityFraction = u_colors[i].a;

    float mixing = pow(u_mixing, .7);
    float power = mix(2., 1., mixing);
    dist = pow(dist, power);

    float w = 1. / (dist + 1e-3);
    float baseSharpness = mix(.0, 8., clamp(w, 0., 1.));
    float sharpness = mix(baseSharpness, 1., mixing);
    w = pow(w, sharpness);
    color += colorFraction * w;
    opacity += opacityFraction * w;
    totalWeight += w;
  }

  color /= max(1e-4, totalWeight);
  opacity /= max(1e-4, totalWeight);

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/static-radial-gradient.js
var staticRadialGradientMeta = { maxColorCount: 10 };
var staticRadialGradientFragmentShader = `#version 300 es
precision mediump float;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${staticRadialGradientMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_radius;
uniform float u_focalDistance;
uniform float u_focalAngle;
uniform float u_falloff;
uniform float u_mixing;
uniform float u_distortion;
uniform float u_distortionShift;
uniform float u_distortionFreq;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_objectUV;
out vec4 fragColor;

${declarePI}
${rotation2}
${proceduralHash21}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float noise(vec2 n, vec2 seedOffset) {
  return valueNoise(n + seedOffset);
}

vec2 getPosition(int i, float t) {
  float a = float(i) * .37;
  float b = .6 + mod(float(i), 3.) * .3;
  float c = .8 + mod(float(i + 1), 4.) * 0.25;

  float x = sin(t * b + a);
  float y = cos(t * c + a * 1.5);

  return .5 + .5 * vec2(x, y);
}

void main() {
  vec2 uv = 2. * v_objectUV;
  vec2 grainUV = uv * 1000.;

  vec2 center = vec2(0.);
  float angleRad = -radians(u_focalAngle + 90.);
  vec2 focalPoint = vec2(cos(angleRad), sin(angleRad)) * u_focalDistance;
  float radius = u_radius;

  vec2 c_to_uv = uv - center;
  vec2 f_to_uv = uv - focalPoint;
  vec2 f_to_c = center - focalPoint;
  float r = length(c_to_uv);

  float fragAngle = atan(c_to_uv.y, c_to_uv.x);
  float angleDiff = fract((fragAngle - angleRad + PI) / TWO_PI) * TWO_PI - PI;

  float halfAngle = acos(clamp(radius / max(u_focalDistance, 1e-4), 0.0, 1.0));
  float e0 = 0.6 * PI, e1 = halfAngle;
  float lo = min(e0, e1), hi = max(e0, e1);
  float s  = smoothstep(lo, hi, abs(angleDiff));
  float isInSector = (e1 >= e0) ? (1.0 - s) : s;

  float a = dot(f_to_uv, f_to_uv);
  float b = -2.0 * dot(f_to_uv, f_to_c);
  float c = dot(f_to_c, f_to_c) - radius * radius;

  float discriminant = b * b - 4.0 * a * c;
  float t = 1.0;

  if (discriminant >= 0.0) {
    float sqrtD = sqrt(discriminant);
    float div = max(1e-4, 2.0 * a);
    float t0 = (-b - sqrtD) / div;
    float t1 = (-b + sqrtD) / div;
    t = max(t0, t1);
    if (t < 0.0) t = 0.0;
  }

  float dist = length(f_to_uv);
  float normalized = dist / max(1e-4, length(f_to_uv * t));
  float shape = clamp(normalized, 0.0, 1.0);

  float falloffMapped = mix(.2 + .8 * max(0., u_falloff + 1.), mix(1., 15., u_falloff * u_falloff), step(.0, u_falloff));

  float falloffExp = mix(falloffMapped, 1., shape);
  shape = pow(shape, falloffExp);
  shape = 1. - clamp(shape, 0., 1.);


  float outerMask = .002;
  float outer = 1.0 - smoothstep(radius - outerMask, radius + outerMask, r);
  outer = mix(outer, 1., isInSector);

  shape = mix(0., shape, outer);
  shape *= 1. - smoothstep(radius - .01, radius, r);

  float angle = atan(f_to_uv.y, f_to_uv.x);
  shape -= pow(u_distortion, 2.) * shape * pow(abs(sin(PI * clamp(length(f_to_uv) - 0.2 + u_distortionShift, 0.0, 1.0))), 4.0) * (sin(u_distortionFreq * angle) + cos(floor(0.65 * u_distortionFreq) * angle));

  float grain = noise(grainUV, vec2(0.));
  float mixerGrain = .4 * u_grainMixer * (grain - .5);

  float mixer = shape * u_colorsCount + mixerGrain;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;

  float outerShape = 0.;
  for (int i = 1; i < ${staticRadialGradientMeta.maxColorCount + 1}; i++) {
    if (i > int(u_colorsCount)) break;
    float mLinear = clamp(mixer - float(i - 1), 0.0, 1.0);

    float aa = fwidth(mLinear);
    float width = min(u_mixing, 0.5);
    float t = clamp((mLinear - (0.5 - width - aa)) / (2. * width + 2. * aa), 0., 1.);
    float p = mix(2., 1., clamp((u_mixing - 0.5) * 2., 0., 1.));
    float m = t < 0.5
      ? 0.5 * pow(2. * t, p)
      : 1. - 0.5 * pow(2. * (1. - t), p);

    float quadBlend = clamp((u_mixing - 0.5) * 2., 0., 1.);
    m = mix(m, m * m, 0.5 * quadBlend);
    
    if (i == 1) {
      outerShape = m;
    }

    vec4 c = u_colors[i - 1];
    c.rgb *= c.a;
    gradient = mix(gradient, c, m);
  }

  vec3 color = gradient.rgb * outerShape;
  float opacity = gradient.a * outerShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/paper-texture.js
var paperTextureFragmentShader = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_contrast;
uniform float u_roughness;
uniform float u_fiber;
uniform float u_fiberSize;
uniform float u_crumples;
uniform float u_crumpleSize;
uniform float u_folds;
uniform float u_foldCount;
uniform float u_drops;
uniform float u_seed;
uniform float u_fade;

uniform sampler2D u_noiseTexture;

in vec2 v_imageUV;

out vec4 fragColor;

float getUvFrame(vec2 uv) {
  float aax = 2. * fwidth(uv.x);
  float aay = 2. * fwidth(uv.y);

  float left   = smoothstep(0., aax, uv.x);
  float right = 1. - smoothstep(1. - aax, 1., uv.x);
  float bottom = smoothstep(0., aay, uv.y);
  float top = 1. - smoothstep(1. - aay, 1., uv.y);

  return left * right * bottom * top;
}

${declarePI}
${rotation2}
${textureRandomizerR}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomR(i);
  float b = randomR(i + vec2(1.0, 0.0));
  float c = randomR(i + vec2(0.0, 1.0));
  float d = randomR(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}
float fbm(vec2 n) {
  float total = 0.0, amplitude = .4;
  for (int i = 0; i < 3; i++) {
    total += valueNoise(n) * amplitude;
    n *= 1.99;
    amplitude *= 0.65;
  }
  return total;
}


float randomG(vec2 p) {
  vec2 uv = floor(p) / 50. + .5;
  return texture(u_noiseTexture, fract(uv)).g;
}
float roughness(vec2 p) {
  p *= .1;
  float o = 0.;
  for (float i = 0.; ++i < 4.; p *= 2.1) {
    vec4 w = vec4(floor(p), ceil(p));
    vec2 f = fract(p);
    o += mix(
    mix(randomG(w.xy), randomG(w.xw), f.y),
    mix(randomG(w.zy), randomG(w.zw), f.y),
    f.x);
    o += .2 / exp(2. * abs(sin(.2 * p.x + .5 * p.y)));
  }
  return o / 3.;
}

${fiberNoise}

vec2 randomGB(vec2 p) {
  vec2 uv = floor(p) / 50. + .5;
  return texture(u_noiseTexture, fract(uv)).gb;
}
float crumpledNoise(vec2 t, float pw) {
  vec2 p = floor(t);
  float wsum = 0.;
  float cl = 0.;
  for (int y = -1; y < 2; y += 1) {
    for (int x = -1; x < 2; x += 1) {
      vec2 b = vec2(float(x), float(y));
      vec2 q = b + p;
      vec2 q2 = q - floor(q / 8.) * 8.;
      vec2 c = q + randomGB(q2);
      vec2 r = c - t;
      float w = pow(smoothstep(0., 1., 1. - abs(r.x)), pw) * pow(smoothstep(0., 1., 1. - abs(r.y)), pw);
      cl += (.5 + .5 * sin((q2.x + q2.y * 5.) * 8.)) * w;
      wsum += w;
    }
  }
  return pow(wsum != 0.0 ? cl / wsum : 0.0, .5) * 2.;
}
float crumplesShape(vec2 uv) {
  return crumpledNoise(uv * .25, 16.) * crumpledNoise(uv * .5, 2.);
}


vec2 folds(vec2 uv) {
  vec3 pp = vec3(0.);
  float l = 9.;
  for (float i = 0.; i < 15.; i++) {
    if (i >= u_foldCount) break;
    vec2 rand = randomGB(vec2(i, i * u_seed));
    float an = rand.x * TWO_PI;
    vec2 p = vec2(cos(an), sin(an)) * rand.y;
    float dist = distance(uv, p);
    l = min(l, dist);

    if (l == dist) {
      pp.xy = (uv - p.xy);
      pp.z = dist;
    }
  }
  return mix(pp.xy, vec2(0.), pow(pp.z, .25));
}

float drops(vec2 uv) {
  vec2 iDropsUV = floor(uv);
  vec2 fDropsUV = fract(uv);
  float dropsMinDist = 1.;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 neighbor = vec2(float(i), float(j));
      vec2 offset = randomGB(iDropsUV + neighbor);
      offset = .5 + .5 * sin(10. * u_seed + TWO_PI * offset);
      vec2 pos = neighbor + offset - fDropsUV;
      float dist = length(pos);
      dropsMinDist = min(dropsMinDist, dropsMinDist*dist);
    }
  }
  return 1. - smoothstep(.05, .09, pow(dropsMinDist, .5));
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

void main() {

  vec2 imageUV = v_imageUV;
  vec2 patternUV = v_imageUV - .5;
  patternUV = 5. * (patternUV * vec2(u_imageAspectRatio, 1.));

  vec2 roughnessUv = 1.5 * (gl_FragCoord.xy - .5 * u_resolution) / u_pixelRatio;
  float roughness = roughness(roughnessUv + vec2(1., 0.)) - roughness(roughnessUv - vec2(1., 0.));

  vec2 crumplesUV = fract(patternUV * .02 / u_crumpleSize - u_seed) * 32.;
  float crumples = u_crumples * (crumplesShape(crumplesUV + vec2(.05, 0.)) - crumplesShape(crumplesUV));

  vec2 fiberUV = 2. / u_fiberSize * patternUV;
  float fiber = fiberNoise(fiberUV, vec2(0.));
  fiber = .5 * u_fiber * (fiber - 1.);

  vec2 normal = vec2(0.);
  vec2 normalImage = vec2(0.);

  vec2 foldsUV = patternUV * .12;
  foldsUV = rotate(foldsUV, 4. * u_seed);
  vec2 w = folds(foldsUV);
  foldsUV = rotate(foldsUV + .007 * cos(u_seed), .01 * sin(u_seed));
  vec2 w2 = folds(foldsUV);

  float drops = u_drops * drops(patternUV * 2.);

  float fade = u_fade * fbm(.17 * patternUV + 10. * u_seed);
  fade = clamp(8. * fade * fade * fade, 0., 1.);

  w = mix(w, vec2(0.), fade);
  w2 = mix(w2, vec2(0.), fade);
  crumples = mix(crumples, 0., fade);
  drops = mix(drops, 0., fade);
  fiber *= mix(1., .5, fade);
  roughness *= mix(1., .5, fade);

  normal.xy += u_folds * min(5. * u_contrast, 1.) * 4. * max(vec2(0.), w + w2);
  normalImage.xy += u_folds * 2. * w;

  normal.xy += crumples;
  normalImage.xy += 1.5 * crumples;

  normal.xy += 3. * drops;
  normalImage.xy += .2 * drops;

  normal.xy += u_roughness * 1.5 * roughness;
  normal.xy += fiber;

  normalImage += u_roughness * .75 * roughness;
  normalImage += .2 * fiber;

  vec3 lightPos = vec3(1., 2., 1.);
  float res = dot(normalize(vec3(normal, 9.5 - 9. * pow(u_contrast, .1))), normalize(lightPos));

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  imageUV += .02 * normalImage;
  float frame = getUvFrame(imageUV);
  vec4 image = texture(u_image, imageUV);
  image.rgb += .6 * pow(u_contrast, .4) * (res - .7);

  frame *= image.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);
  opacity = mix(opacity, 1., frame);

  color -= .007 * drops;

  color.rgb = mix(color, image.rgb, frame);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/water.js
var waterFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colorHighlight;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_size;
uniform float u_highlights;
uniform float u_layering;
uniform float u_edges;
uniform float u_caustic;
uniform float u_waves;

in vec2 v_imageUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${simplexNoise}

float getUvFrame(vec2 uv) {
  float aax = 2. * fwidth(uv.x);
  float aay = 2. * fwidth(uv.y);

  float left   = smoothstep(0., aax, uv.x);
  float right = 1.0 - smoothstep(1. - aax, 1., uv.x);
  float bottom = smoothstep(0., aay, uv.y);
  float top = 1.0 - smoothstep(1. - aay, 1., uv.y);

  return left * right * bottom * top;
}

mat2 rotate2D(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

float getCausticNoise(vec2 uv, float t, float scale) {
  vec2 n = vec2(.1);
  vec2 N = vec2(.1);
  mat2 m = rotate2D(.5);
  for (int j = 0; j < 6; j++) {
    uv *= m;
    n *= m;
    vec2 q = uv * scale + float(j) + n + (.5 + .5 * float(j)) * (mod(float(j), 2.) - 1.) * t;
    n += sin(q);
    N += cos(q) / scale;
    scale *= 1.1;
  }
  return (N.x + N.y + 1.);
}

void main() {
  vec2 imageUV = v_imageUV;
  vec2 patternUV = v_imageUV - .5;
  patternUV = (patternUV * vec2(u_imageAspectRatio, 1.));
  patternUV /= (.01 + .09 * u_size);

  float t = u_time;

  float wavesNoise = snoise((.3 + .1 * sin(t)) * .1 * patternUV + vec2(0., .4 * t));

  float causticNoise = getCausticNoise(patternUV + u_waves * vec2(1., -1.) * wavesNoise, 2. * t, 1.5);

  causticNoise += u_layering * getCausticNoise(patternUV + 2. * u_waves * vec2(1., -1.) * wavesNoise, 1.5 * t, 2.);
  causticNoise = causticNoise * causticNoise;

  float edgesDistortion = smoothstep(0., .1, imageUV.x);
  edgesDistortion *= smoothstep(0., .1, imageUV.y);
  edgesDistortion *= (smoothstep(1., 1.1, imageUV.x) + (1.0 - smoothstep(.8, .95, imageUV.x)));
  edgesDistortion *= (1.0 - smoothstep(.9, 1., imageUV.y));
  edgesDistortion = mix(edgesDistortion, 1., u_edges);

  float causticNoiseDistortion = .02 * causticNoise * edgesDistortion;

  float wavesDistortion = .1 * u_waves * wavesNoise;

  imageUV += vec2(wavesDistortion, -wavesDistortion);
  imageUV += (u_caustic * causticNoiseDistortion);

  float frame = getUvFrame(imageUV);

  vec4 image = texture(u_image, imageUV);
  vec4 backColor = u_colorBack;
  backColor.rgb *= backColor.a;

  vec3 color = mix(backColor.rgb, image.rgb, image.a * frame);
  float opacity = backColor.a + image.a * frame;

  causticNoise = max(-.2, causticNoise);

  float hightlight = .025 * u_highlights * causticNoise;
  hightlight *= u_colorHighlight.a;
  color = mix(color, u_colorHighlight.rgb, .05 * u_highlights * causticNoise);
  opacity += hightlight;

  color += hightlight * (.5 + .5 * wavesNoise);
  opacity += hightlight * (.5 + .5 * wavesNoise);

  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/fluted-glass.js
var flutedGlassFragmentShader = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_rotation;

uniform vec4 u_colorBack;
uniform vec4 u_colorShadow;
uniform vec4 u_colorHighlight;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_size;
uniform float u_shadows;
uniform float u_angle;
uniform float u_stretch;
uniform float u_shape;
uniform float u_distortion;
uniform float u_highlights;
uniform float u_distortionShape;
uniform float u_shift;
uniform float u_blur;
uniform float u_edges;
uniform float u_marginLeft;
uniform float u_marginRight;
uniform float u_marginTop;
uniform float u_marginBottom;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_imageUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${proceduralHash21}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float getUvFrame(vec2 uv, float softness) {
  float aax = 2. * fwidth(uv.x);
  float aay = 2. * fwidth(uv.y);
  float left   = smoothstep(0., aax + softness, uv.x);
  float right  = 1. - smoothstep(1. - softness - aax, 1., uv.x);
  float bottom = smoothstep(0., aay + softness, uv.y);
  float top    = 1. - smoothstep(1. - softness - aay, 1., uv.y);
  return left * right * bottom * top;
}

const int MAX_RADIUS = 50;
vec4 samplePremultiplied(sampler2D tex, vec2 uv) {
  vec4 c = texture(tex, uv);
  c.rgb *= c.a;
  return c;
}
vec4 getBlur(sampler2D tex, vec2 uv, vec2 texelSize, vec2 dir, float sigma) {
  if (sigma <= .5) return texture(tex, uv);
  int radius = int(min(float(MAX_RADIUS), ceil(3.0 * sigma)));

  float twoSigma2 = 2.0 * sigma * sigma;
  float gaussianNorm = 1.0 / sqrt(TWO_PI * sigma * sigma);

  vec4 sum = samplePremultiplied(tex, uv) * gaussianNorm;
  float weightSum = gaussianNorm;

  for (int i = 1; i <= MAX_RADIUS; i++) {
    if (i > radius) break;

    float x = float(i);
    float w = exp(-(x * x) / twoSigma2) * gaussianNorm;

    vec2 offset = dir * texelSize * x;
    vec4 s1 = samplePremultiplied(tex, uv + offset);
    vec4 s2 = samplePremultiplied(tex, uv - offset);

    sum += (s1 + s2) * w;
    weightSum += 2.0 * w;
  }

  vec4 result = sum / weightSum;
  if (result.a > 0.) {
    result.rgb /= result.a;
  }

  return result;
}

vec2 rotateAspect(vec2 p, float a, float aspect) {
  p.x *= aspect;
  p = rotate(p, a);
  p.x /= aspect;
  return p;
}

float smoothFract(float x) {
  float f = fract(x);
  float w = fwidth(x);

  float edge = abs(f - 0.5) - 0.5;
  float band = smoothstep(-w, w, edge);

  return mix(f, 1.0 - f, band);
}

void main() {

  float patternRotation = -u_angle * PI / 180.;
  float patternSize = mix(200., 5., u_size);

  vec2 uv = v_imageUV;

  vec2 uvMask = gl_FragCoord.xy / u_resolution.xy;
  vec2 sw = vec2(.005);
  vec4 margins = vec4(u_marginLeft, u_marginTop, u_marginRight, u_marginBottom);
  float mask =
  smoothstep(margins[0], margins[0] + sw.x, uvMask.x + sw.x) *
  smoothstep(margins[2], margins[2] + sw.x, 1.0 - uvMask.x + sw.x) *
  smoothstep(margins[1], margins[1] + sw.y, uvMask.y + sw.y) *
  smoothstep(margins[3], margins[3] + sw.y, 1.0 - uvMask.y + sw.y);
  float maskOuter =
  smoothstep(margins[0] - sw.x, margins[0], uvMask.x + sw.x) *
  smoothstep(margins[2] - sw.x, margins[2], 1.0 - uvMask.x + sw.x) *
  smoothstep(margins[1] - sw.y, margins[1], uvMask.y + sw.y) *
  smoothstep(margins[3] - sw.y, margins[3], 1.0 - uvMask.y + sw.y);
  float maskStroke = maskOuter - mask;
  float maskInner =
  smoothstep(margins[0] - 2. * sw.x, margins[0], uvMask.x) *
  smoothstep(margins[2] - 2. * sw.x, margins[2], 1.0 - uvMask.x) *
  smoothstep(margins[1] - 2. * sw.y, margins[1], uvMask.y) *
  smoothstep(margins[3] - 2. * sw.y, margins[3], 1.0 - uvMask.y);
  float maskStrokeInner = maskInner - mask;

  uv -= .5;
  uv *= patternSize;
  uv = rotateAspect(uv, patternRotation, u_imageAspectRatio);

  float curve = 0.;
  float patternY = uv.y / u_imageAspectRatio;
  if (u_shape > 4.5) {
    // pattern
    curve = .5 + .5 * sin(.5 * PI * uv.x) * cos(.5 * PI * patternY);
  } else if (u_shape > 3.5) {
    // zigzag
    curve = 10. * abs(fract(.1 * patternY) - .5);
  } else if (u_shape > 2.5) {
    // wave
    curve = 4. * sin(.23 * patternY);
  } else if (u_shape > 1.5) {
    // lines irregular
    curve = .5 + .5 * sin(.5 * uv.x) * sin(1.7 * uv.x);
  } else {
    // lines
  }

  vec2 UvToFract = uv + curve;
  vec2 fractOrigUV = fract(uv);
  vec2 floorOrigUV = floor(uv);

  float x = smoothFract(UvToFract.x);
  float xNonSmooth = fract(UvToFract.x) + .0001;

  float highlightsWidth = 2. * max(.001, fwidth(UvToFract.x));
  highlightsWidth += 2. * maskStrokeInner;
  float highlights = smoothstep(0., highlightsWidth, xNonSmooth);
  highlights *= smoothstep(1., 1. - highlightsWidth, xNonSmooth);
  highlights = 1. - highlights;
  highlights *= u_highlights;
  highlights = clamp(highlights, 0., 1.);
  highlights *= mask;

  float shadows = pow(x, 1.3);
  float distortion = 0.;
  float fadeX = 1.;
  float frameFade = 0.;

  float aa = fwidth(xNonSmooth);
  aa = max(aa, fwidth(uv.x));
  aa = max(aa, fwidth(UvToFract.x));
  aa = max(aa, .0001);

  if (u_distortionShape == 1.) {
    distortion = -pow(1.5 * x, 3.);
    distortion += (.5 - u_shift);

    frameFade = pow(1.5 * x, 3.);
    aa = max(.2, aa);
    aa += mix(.2, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    distortion = mix(.5, distortion, fadeX);
  } else if (u_distortionShape == 2.) {
    distortion = 2. * pow(x, 2.);
    distortion -= (.5 + u_shift);

    frameFade = pow(abs(x - .5), 4.);
    aa = max(.2, aa);
    aa += mix(.2, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    distortion = mix(.5, distortion, fadeX);
    frameFade = mix(1., frameFade, .5 * fadeX);
  } else if (u_distortionShape == 3.) {
    distortion = pow(2. * (xNonSmooth - .5), 6.);
    distortion -= .25;
    distortion -= u_shift;

    frameFade = 1. - 2. * pow(abs(x - .4), 2.);
    aa = .15;
    aa += mix(.1, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    frameFade = mix(1., frameFade, fadeX);

  } else if (u_distortionShape == 4.) {
    x = xNonSmooth;
    distortion = sin((x + .25) * TWO_PI);
    shadows = .5 + .5 * asin(distortion) / (.5 * PI);
    distortion *= .5;
    distortion -= u_shift;
    frameFade = .5 + .5 * sin(x * TWO_PI);
  } else if (u_distortionShape == 5.) {
    distortion -= pow(abs(x), .2) * x;
    distortion += .33;
    distortion -= 3. * u_shift;
    distortion *= .33;

    frameFade = .3 * (smoothstep(.0, 1., x));
    shadows = pow(x, 2.5);

    aa = max(.1, aa);
    aa += mix(.1, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    distortion *= fadeX;
  }

  vec2 dudx = dFdx(v_imageUV);
  vec2 dudy = dFdy(v_imageUV);
  vec2 grainUV = v_imageUV - .5;
  grainUV *= (.8 / vec2(length(dudx), length(dudy)));
  grainUV += .5;
  float grain = valueNoise(grainUV);
  grain = smoothstep(.4, .7, grain);
  grain *= u_grainMixer;
  distortion = mix(distortion, 0., grain);

  shadows = min(shadows, 1.);
  shadows += maskStrokeInner;
  shadows *= mask;
  shadows = min(shadows, 1.);
  shadows *= pow(u_shadows, 2.);
  shadows = clamp(shadows, 0., 1.);

  distortion *= 3. * u_distortion;
  frameFade *= u_distortion;

  fractOrigUV.x += distortion;
  floorOrigUV = rotateAspect(floorOrigUV, -patternRotation, u_imageAspectRatio);
  fractOrigUV = rotateAspect(fractOrigUV, -patternRotation, u_imageAspectRatio);

  uv = (floorOrigUV + fractOrigUV) / patternSize;
  uv += pow(maskStroke, 4.);

  uv += vec2(.5);

  uv = mix(v_imageUV, uv, smoothstep(0., .7, mask));
  float blur = mix(0., 50., u_blur);
  blur = mix(0., blur, smoothstep(.5, 1., mask));

  float edgeDistortion = mix(.0, .04, u_edges);
  edgeDistortion += .06 * frameFade * u_edges;
  edgeDistortion *= mask;
  float frame = getUvFrame(uv, edgeDistortion);

  float stretch = 1. - smoothstep(0., .5, xNonSmooth) * smoothstep(1., 1. - .5, xNonSmooth);
  stretch = pow(stretch, 2.);
  stretch *= mask;
  stretch *= getUvFrame(uv, .1 + .05 * mask * frameFade);
  uv.y = mix(uv.y, .5, u_stretch * stretch);

  vec4 image = getBlur(u_image, uv, 1. / u_resolution / u_pixelRatio, vec2(0., 1.), blur);
  image.rgb *= image.a;
  vec4 backColor = u_colorBack;
  backColor.rgb *= backColor.a;
  vec4 highlightColor = u_colorHighlight;
  highlightColor.rgb *= highlightColor.a;
  vec4 shadowColor = u_colorShadow;

  vec3 color = highlightColor.rgb * highlights;
  float opacity = highlightColor.a * highlights;

  shadows = mix(shadows * shadowColor.a, 0., highlights);
  color = mix(color, shadowColor.rgb * shadowColor.a, .5 * shadows);
  color += .5 * pow(shadows, .5) * shadowColor.rgb;
  opacity += shadows;
  color = clamp(color, vec3(0.), vec3(1.));
  opacity = clamp(opacity, 0., 1.);

  color += image.rgb * (1. - opacity) * frame;
  opacity += image.a * (1. - opacity) * frame;

  color += backColor.rgb * (1. - opacity);
  opacity += backColor.a * (1. - opacity);

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  grainOverlayStrength *= mask;
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
var GlassGridShapes = {
	lines: 1,
	linesIrregular: 2,
	wave: 3,
	zigzag: 4,
	pattern: 5
};
var GlassDistortionShapes = {
	prism: 1,
	lens: 2,
	contour: 3,
	cascade: 4,
	flat: 5
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/image-dithering.js
var imageDitheringFragmentShader = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;

uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform vec4 u_colorHighlight;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_type;
uniform float u_pxSize;
uniform bool u_originalColors;
uniform bool u_inverted;
uniform float u_colorSteps;

out vec4 fragColor;


${proceduralHash21}
${declarePI}

float getUvFrame(vec2 uv, vec2 pad) {
  float aa = 0.0001;

  float left   = smoothstep(-pad.x, -pad.x + aa, uv.x);
  float right  = smoothstep(1.0 + pad.x, 1.0 + pad.x - aa, uv.x);
  float bottom = smoothstep(-pad.y, -pad.y + aa, uv.y);
  float top    = smoothstep(1.0 + pad.y, 1.0 + pad.y - aa, uv.y);

  return left * right * bottom * top;
}

vec2 getImageUV(vec2 uv) {
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  float r = u_rotation * PI / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  vec2 imageBoxSize;
  if (u_fit == 1.) { // contain
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.) { // cover
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

  vec2 imageUV = uv;
  imageUV *= imageBoxScale;
  imageUV += boxOrigin * (imageBoxScale - 1.);
  imageUV += graphicOffset;
  imageUV /= u_scale;
  imageUV.x *= u_imageAspectRatio;
  imageUV = graphicRotation * imageUV;
  imageUV.x /= u_imageAspectRatio;

  imageUV += .5;
  imageUV.y = 1. - imageUV.y;

  return imageUV;
}

const int bayer2x2[4] = int[4](0, 2, 3, 1);
const int bayer4x4[16] = int[16](
0, 8, 2, 10,
12, 4, 14, 6,
3, 11, 1, 9,
15, 7, 13, 5
);

const int bayer8x8[64] = int[64](
0, 32, 8, 40, 2, 34, 10, 42,
48, 16, 56, 24, 50, 18, 58, 26,
12, 44, 4, 36, 14, 46, 6, 38,
60, 28, 52, 20, 62, 30, 54, 22,
3, 35, 11, 43, 1, 33, 9, 41,
51, 19, 59, 27, 49, 17, 57, 25,
15, 47, 7, 39, 13, 45, 5, 37,
63, 31, 55, 23, 61, 29, 53, 21
);

float getBayerValue(vec2 uv, int size) {
  ivec2 pos = ivec2(fract(uv / float(size)) * float(size));
  int index = pos.y * size + pos.x;

  if (size == 2) {
    return float(bayer2x2[index]) / 4.0;
  } else if (size == 4) {
    return float(bayer4x4[index]) / 16.0;
  } else if (size == 8) {
    return float(bayer8x8[index]) / 64.0;
  }
  return 0.0;
}


void main() {

  float pxSize = u_pxSize * u_pixelRatio;
  vec2 pxSizeUV = gl_FragCoord.xy - .5 * u_resolution;
  pxSizeUV /= pxSize;
  vec2 canvasPixelizedUV = (floor(pxSizeUV) + .5) * pxSize;
  vec2 normalizedUV = canvasPixelizedUV / u_resolution;

  vec2 imageUV = getImageUV(normalizedUV);
  vec2 ditheringNoiseUV = canvasPixelizedUV;
  vec4 image = texture(u_image, imageUV);
  float frame = getUvFrame(imageUV, pxSize / u_resolution);

  int type = int(floor(u_type));
  float dithering = 0.0;

  float lum = dot(vec3(.2126, .7152, .0722), image.rgb);
  lum = u_inverted ? (1. - lum) : lum;

  switch (type) {
    case 1: {
      dithering = step(hash21(ditheringNoiseUV), lum);
    } break;
    case 2:
    dithering = getBayerValue(pxSizeUV, 2);
    break;
    case 3:
    dithering = getBayerValue(pxSizeUV, 4);
    break;
    default :
    dithering = getBayerValue(pxSizeUV, 8);
    break;
  }

  float colorSteps = max(floor(u_colorSteps), 1.);
  vec3 color = vec3(0.0);
  float opacity = 1.;

  dithering -= .5;
  float brightness = clamp(lum + dithering / colorSteps, 0.0, 1.0);
  brightness = mix(0.0, brightness, frame);
  brightness = mix(0.0, brightness, image.a);
  float quantLum = floor(brightness * colorSteps + 0.5) / colorSteps;
  quantLum = mix(0.0, quantLum, frame);

  if (u_originalColors == true) {
    vec3 normColor = image.rgb / max(lum, 0.001);
    color = normColor * quantLum;

    float quantAlpha = floor(image.a * colorSteps + 0.5) / colorSteps;
    opacity = mix(quantLum, 1., quantAlpha);
  } else {
    vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
    float fgOpacity = u_colorFront.a;
    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    float bgOpacity = u_colorBack.a;
    vec3 hlColor = u_colorHighlight.rgb * u_colorHighlight.a;
    float hlOpacity = u_colorHighlight.a;

    fgColor = mix(fgColor, hlColor, step(1.02 - .02 * u_colorSteps, brightness));
    fgOpacity = mix(fgOpacity, hlOpacity, step(1.02 - .02 * u_colorSteps, brightness));

    color = fgColor * quantLum;
    opacity = fgOpacity * quantLum;
    color += bgColor * (1.0 - opacity);
    opacity += bgOpacity * (1.0 - opacity);
  }

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/heatmap.js
var heatmapMeta = { maxColorCount: 10 };
var heatmapFragmentShader = `#version 300 es
precision highp float;

in mediump vec2 v_imageUV;
in mediump vec2 v_objectUV;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_time;
uniform mediump float u_imageAspectRatio;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${heatmapMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_angle;
uniform float u_noise;
uniform float u_innerGlow;
uniform float u_outerGlow;
uniform float u_contour;

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846

float getImgFrame(vec2 uv, float th) {
  float frame = 1.;
  frame *= smoothstep(0., th, uv.y);
  frame *= 1. - smoothstep(1. - th, 1., uv.y);
  frame *= smoothstep(0., th, uv.x);
  frame *= 1. - smoothstep(1. - th, 1., uv.x);
  return frame;
}

float circle(vec2 uv, vec2 c, vec2 r) {
  return 1. - smoothstep(r[0], r[1], length(uv - c));
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

float sst(float edge0, float edge1, float x) {
  return smoothstep(edge0, edge1, x);
}

float shadowShape(vec2 uv, float t, float contour) {
  vec2 scaledUV = uv;

  // base shape tranjectory
  float posY = mix(-1., 2., t);

  // scaleX when it's moving down
  scaledUV.y -= .5;
  float mainCircleScale = sst(0., .8, posY) * lst(1.4, .9, posY);
  scaledUV *= vec2(1., 1. + 1.5 * mainCircleScale);
  scaledUV.y += .5;

  // base shape
  float innerR = .4;
  float outerR = 1. - .3 * (sst(.1, .2, t) * (1. - sst(.2, .5, t)));
  float s = circle(scaledUV, vec2(.5, posY - .2), vec2(innerR, outerR));
  float shapeSizing = sst(.2, .3, t) * sst(.6, .3, t);
  s = pow(s, 1.4);
  s *= 1.2;

  // flat gradient to take over the shadow shape
  float topFlattener = 0.;
  {
    float pos = posY - uv.y;
    float edge = 1.2;
    topFlattener = lst(-.4, 0., pos) * (1. - sst(.0, edge, pos));
    topFlattener = pow(topFlattener, 3.);
    float topFlattenerMixer = (1. - sst(.0, .3, pos));
    s = mix(topFlattener, s, topFlattenerMixer);
  }

  // apple right circle
  {
    float visibility = sst(.6, .7, t) * (1. - sst(.8, .9, t));
    float angle = -2. -t * TWO_PI;
    float rightCircle = circle(uv, vec2(.95 - .2 * cos(angle), .4 - .1 * sin(angle)), vec2(.15, .3));
    rightCircle *= visibility;
    s = mix(s, 0., rightCircle);
  }

  // apple top circle
  {
    float topCircle = circle(uv, vec2(.5, .19), vec2(.05, .25));
    topCircle += 2. * contour * circle(uv, vec2(.5, .19), vec2(.2, .5));
    float visibility = .55 * sst(.2, .3, t) * (1. - sst(.3, .45, t));
    topCircle *= visibility;
    s = mix(s, 0., topCircle);
  }

  float leafMask = circle(uv, vec2(.53, .13), vec2(.08, .19));
  leafMask = mix(leafMask, 0., 1. - sst(.4, .54, uv.x));
  leafMask = mix(0., leafMask, sst(.0, .2, uv.y));
  leafMask *= (sst(.5, 1.1, posY) * sst(1.5, 1.3, posY));
  s += leafMask;

  // apple bottom circle
  {
    float visibility = sst(.0, .4, t) * (1. - sst(.6, .8, t));
    s = mix(s, 0., visibility * circle(uv, vec2(.52, .92), vec2(.09, .25)));
  }

  // random balls that are invisible if apple logo is selected
  {
    float pos = sst(.0, .6, t) * (1. - sst(.6, 1., t));
    s = mix(s, .5, circle(uv, vec2(.0, 1.2 - .5 * pos), vec2(.1, .3)));
    s = mix(s, .0, circle(uv, vec2(1., .5 + .5 * pos), vec2(.1, .3)));

    s = mix(s, 1., circle(uv, vec2(.95, .2 + .2 * sst(.3, .4, t) * sst(.7, .5, t)), vec2(.07, .22)));
    s = mix(s, 1., circle(uv, vec2(.95, .2 + .2 * sst(.3, .4, t) * (1. - sst(.5, .7, t))), vec2(.07, .22)));
    s /= max(1e-4, sst(1., .85, uv.y));
  }

  s = clamp(0., 1., s);
  return s;
}

float blurEdge3x3(sampler2D tex, vec2 uv, vec2 dudx, vec2 dudy, float radius, float centerSample) {
  vec2 texel = 1.0 / vec2(textureSize(tex, 0));
  vec2 r = radius * texel;

  float w1 = 1.0, w2 = 2.0, w4 = 4.0;
  float norm = 16.0;
  float sum = w4 * centerSample;

  sum += w2 * textureGrad(tex, uv + vec2(0.0, -r.y), dudx, dudy).g;
  sum += w2 * textureGrad(tex, uv + vec2(0.0, r.y), dudx, dudy).g;
  sum += w2 * textureGrad(tex, uv + vec2(-r.x, 0.0), dudx, dudy).g;
  sum += w2 * textureGrad(tex, uv + vec2(r.x, 0.0), dudx, dudy).g;

  sum += w1 * textureGrad(tex, uv + vec2(-r.x, -r.y), dudx, dudy).g;
  sum += w1 * textureGrad(tex, uv + vec2(r.x, -r.y), dudx, dudy).g;
  sum += w1 * textureGrad(tex, uv + vec2(-r.x, r.y), dudx, dudy).g;
  sum += w1 * textureGrad(tex, uv + vec2(r.x, r.y), dudx, dudy).g;

  return sum / norm;
}

void main() {
  vec2 uv = v_objectUV + .5;
  uv.y = 1. - uv.y;

  vec2 imgUV = v_imageUV;
  imgUV -= .5;
  imgUV *= 0.5714285714285714;
  imgUV += .5;
  float imgSoftFrame = getImgFrame(imgUV, .03);

  vec4 img = texture(u_image, imgUV);
  vec2 dudx = dFdx(imgUV);
  vec2 dudy = dFdy(imgUV);

  if (img.a == 0.) {
    fragColor = u_colorBack;
    return;
  }

  float t = .1 * u_time;
  t -= .3;

  float tCopy = t + 1. / 3.;
  float tCopy2 = t + 2. / 3.;

  t = mod(t, 1.);
  tCopy = mod(tCopy, 1.);
  tCopy2 = mod(tCopy2, 1.);

  vec2 animationUV = imgUV - vec2(.5);
  float angle = -u_angle * PI / 180.;
  float cosA = cos(angle);
  float sinA = sin(angle);
  animationUV = vec2(
  animationUV.x * cosA - animationUV.y * sinA,
  animationUV.x * sinA + animationUV.y * cosA
  ) + vec2(.5);

  float shape = img[0];

  img[1] = blurEdge3x3(u_image, imgUV, dudx, dudy, 8., img[1]);

  float outerBlur = 1. - mix(1., img[1], shape);
  float innerBlur = mix(img[1], 0., shape);
  float contour = mix(img[2], 0., shape);

  outerBlur *= imgSoftFrame;

  float shadow = shadowShape(animationUV, t, innerBlur);
  float shadowCopy = shadowShape(animationUV, tCopy, innerBlur);
  float shadowCopy2 = shadowShape(animationUV, tCopy2, innerBlur);

  float inner = .8 + .8 * innerBlur;
  inner = mix(inner, 0., shadow);
  inner = mix(inner, 0., shadowCopy);
  inner = mix(inner, 0., shadowCopy2);

  inner *= mix(0., 2., u_innerGlow);

  inner += (u_contour * 2.) * contour;
  inner = min(1., inner);
  inner *= (1. - shape);

  float outer = 0.;
  {
    t *= 3.;
    t = mod(t - .1, 1.);

    outer = .9 * pow(outerBlur, .8);
    float y = mod(animationUV.y - t, 1.);
    float animatedMask = sst(.3, .65, y) * (1. - sst(.65, 1., y));
    animatedMask = .5 + animatedMask;
    outer *= animatedMask;
    outer *= mix(0., 5., pow(u_outerGlow, 2.));
    outer *= imgSoftFrame;
  }

  inner = pow(inner, 1.2);
  float heat = clamp(inner + outer, 0., 1.);

  heat += (.005 + .35 * u_noise) * (fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453123) - .5);

  float mixer = heat * u_colorsCount;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  float outerShape = 0.;
  for (int i = 1; i < ${heatmapMeta.maxColorCount + 1}; i++) {
    if (i > int(u_colorsCount)) break;
    float m = clamp(mixer - float(i - 1), 0., 1.);
    if (i == 1) {
      outerShape = m;
    }
    vec4 c = u_colors[i - 1];
    c.rgb *= c.a;
    gradient = mix(gradient, c, m);
  }

  vec3 color = gradient.rgb * outerShape;
  float opacity = gradient.a * outerShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  color += .02 * (fract(sin(dot(uv + 1., vec2(12.9898, 78.233))) * 43758.5453123) - .5);

  fragColor = vec4(color, opacity);
}
`;
function toProcessedHeatmap(file) {
	const canvas = document.createElement("canvas");
	const canvasSize = 1e3;
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.addEventListener("load", () => {
			if (typeof file === "string" ? file.endsWith(".svg") : file.type === "image/svg+xml") {
				image.width = canvasSize;
				image.height = canvasSize;
			}
			const ratio = image.naturalWidth / image.naturalHeight;
			const maxBlur = Math.floor(canvasSize * .15);
			const padding = Math.ceil(maxBlur * 2.5);
			let imgWidth = canvasSize;
			let imgHeight = canvasSize;
			if (ratio > 1) imgHeight = Math.floor(canvasSize / ratio);
			else imgWidth = Math.floor(canvasSize * ratio);
			canvas.width = imgWidth + 2 * padding;
			canvas.height = imgHeight + 2 * padding;
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			if (!ctx) throw new Error("Failed to get canvas 2d context");
			ctx.fillStyle = "white";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(image, padding, padding, imgWidth, imgHeight);
			const { width, height } = canvas;
			const src = ctx.getImageData(0, 0, width, height).data;
			const totalPixels = width * height;
			const gray = new Uint8ClampedArray(totalPixels);
			for (let i = 0; i < totalPixels; i++) {
				const px = i * 4;
				const r = src[px] ?? 0;
				const g = src[px + 1] ?? 0;
				const b = src[px + 2] ?? 0;
				gray[i] = .299 * r + .587 * g + .114 * b | 0;
			}
			const bigBlurRadius = maxBlur;
			const innerBlurRadius = Math.max(1, Math.round(.12 * maxBlur));
			const contourRadius = 5;
			const bigBlurGray = multiPassBlurGray(gray, width, height, bigBlurRadius, 3);
			const innerBlurGray = multiPassBlurGray(gray, width, height, innerBlurRadius, 3);
			const contourGray = multiPassBlurGray(gray, width, height, contourRadius, 1);
			const processedImageData = ctx.createImageData(width, height);
			const dst = processedImageData.data;
			for (let i = 0; i < totalPixels; i++) {
				const px = i * 4;
				dst[px] = contourGray[i] ?? 0;
				dst[px + 1] = bigBlurGray[i] ?? 0;
				dst[px + 2] = innerBlurGray[i] ?? 0;
				dst[px + 3] = 255;
			}
			ctx.putImageData(processedImageData, 0, 0);
			canvas.toBlob((blob) => {
				if (!blob) {
					reject(/* @__PURE__ */ new Error("Failed to create PNG blob"));
					return;
				}
				resolve({ blob });
			}, "image/png");
		});
		image.addEventListener("error", () => {
			reject(/* @__PURE__ */ new Error("Failed to load image"));
		});
		image.src = typeof file === "string" ? file : URL.createObjectURL(file);
	});
}
function blurGray(gray, width, height, radius) {
	if (radius <= 0) return gray.slice();
	const out = new Uint8ClampedArray(width * height);
	const integral = new Uint32Array(width * height);
	for (let y = 0; y < height; y++) {
		let rowSum = 0;
		for (let x = 0; x < width; x++) {
			const idx = y * width + x;
			const v = gray[idx] ?? 0;
			rowSum += v;
			integral[idx] = rowSum + (y > 0 ? integral[idx - width] ?? 0 : 0);
		}
	}
	for (let y = 0; y < height; y++) {
		const y1 = Math.max(0, y - radius);
		const y2 = Math.min(height - 1, y + radius);
		for (let x = 0; x < width; x++) {
			const x1 = Math.max(0, x - radius);
			const x2 = Math.min(width - 1, x + radius);
			const idxA = y2 * width + x2;
			const idxB = y2 * width + (x1 - 1);
			const idxC = (y1 - 1) * width + x2;
			const idxD = (y1 - 1) * width + (x1 - 1);
			const A = integral[idxA] ?? 0;
			const B = x1 > 0 ? integral[idxB] ?? 0 : 0;
			const C = y1 > 0 ? integral[idxC] ?? 0 : 0;
			const D = x1 > 0 && y1 > 0 ? integral[idxD] ?? 0 : 0;
			const sum = A - B - C + D;
			const area = (x2 - x1 + 1) * (y2 - y1 + 1);
			out[y * width + x] = Math.round(sum / area);
		}
	}
	return out;
}
function multiPassBlurGray(gray, width, height, radius, passes) {
	if (radius <= 0 || passes <= 1) return blurGray(gray, width, height, radius);
	let input = gray;
	let tmp = gray;
	for (let p = 0; p < passes; p++) {
		tmp = blurGray(input, width, height, radius);
		input = tmp;
	}
	return tmp;
}
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/liquid-metal.js
var liquidMetalFragmentShader = `#version 300 es
precision mediump float;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform vec2 u_resolution;
uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colorTint;

uniform float u_softness;
uniform float u_repetition;
uniform float u_shiftRed;
uniform float u_shiftBlue;
uniform float u_distortion;
uniform float u_contour;
uniform float u_angle;

uniform float u_shape;
uniform bool u_isImage;

in vec2 v_objectUV;
in vec2 v_responsiveUV;
in vec2 v_responsiveBoxGivenSize;
in vec2 v_imageUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${simplexNoise}

float getColorChanges(float c1, float c2, float stripe_p, vec3 w, float blur, float bump, float tint) {

  float ch = mix(c2, c1, smoothstep(.0, 2. * blur, stripe_p));

  float border = w[0];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  if (u_isImage == true) {
    bump = smoothstep(.2, .8, bump);
  }
  border = w[0] + .4 * (1. - bump) * w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + .5 * (1. - bump) * w[1];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  float gradient_t = (stripe_p - w[0] - w[1]) / w[2];
  float gradient = mix(c1, c2, smoothstep(0., 1., gradient_t));
  ch = mix(ch, gradient, smoothstep(border, border + .5 * blur, stripe_p));

  // Tint color is applied with color burn blending
  ch = mix(ch, 1. - min(1., (1. - ch) / max(tint, 0.0001)), u_colorTint.a);
  return ch;
}

float getImgFrame(vec2 uv, float th) {
  float frame = 1.;
  frame *= smoothstep(0., th, uv.y);
  frame *= 1.0 - smoothstep(1. - th, 1., uv.y);
  frame *= smoothstep(0., th, uv.x);
  frame *= 1.0 - smoothstep(1. - th, 1., uv.x);
  return frame;
}

float blurEdge3x3(sampler2D tex, vec2 uv, vec2 dudx, vec2 dudy, float radius, float centerSample) {
  vec2 texel = 1.0 / vec2(textureSize(tex, 0));
  vec2 r = radius * texel;

  float w1 = 1.0, w2 = 2.0, w4 = 4.0;
  float norm = 16.0;
  float sum = w4 * centerSample;

  sum += w2 * textureGrad(tex, uv + vec2(0.0, -r.y), dudx, dudy).r;
  sum += w2 * textureGrad(tex, uv + vec2(0.0, r.y), dudx, dudy).r;
  sum += w2 * textureGrad(tex, uv + vec2(-r.x, 0.0), dudx, dudy).r;
  sum += w2 * textureGrad(tex, uv + vec2(r.x, 0.0), dudx, dudy).r;

  sum += w1 * textureGrad(tex, uv + vec2(-r.x, -r.y), dudx, dudy).r;
  sum += w1 * textureGrad(tex, uv + vec2(r.x, -r.y), dudx, dudy).r;
  sum += w1 * textureGrad(tex, uv + vec2(-r.x, r.y), dudx, dudy).r;
  sum += w1 * textureGrad(tex, uv + vec2(r.x, r.y), dudx, dudy).r;

  return sum / norm;
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

void main() {

  const float firstFrameOffset = 2.8;
  float t = .3 * (u_time + firstFrameOffset);

  vec2 uv = v_imageUV;
  vec2 dudx = dFdx(v_imageUV);
  vec2 dudy = dFdy(v_imageUV);
  vec4 img = textureGrad(u_image, uv, dudx, dudy);

  if (u_isImage == false) {
    uv = v_objectUV + .5;
    uv.y = 1. - uv.y;
  }

  float cycleWidth = u_repetition;
  float edge = 0.;
  float contOffset = 1.;

  vec2 rotatedUV = uv - vec2(.5);
  float angle = (-u_angle + 70.) * PI / 180.;
  float cosA = cos(angle);
  float sinA = sin(angle);
  rotatedUV = vec2(
  rotatedUV.x * cosA - rotatedUV.y * sinA,
  rotatedUV.x * sinA + rotatedUV.y * cosA
  ) + vec2(.5);

  if (u_isImage == true) {
    float edgeRaw = img.r;
    edge = blurEdge3x3(u_image, uv, dudx, dudy, 6., edgeRaw);
    edge = pow(edge, 1.6);
    edge *= mix(0.0, 1.0, smoothstep(0.0, 0.4, u_contour));
  } else {
    if (u_shape < 1.) {
      // full-fill on canvas
      vec2 borderUV = v_responsiveUV + .5;
      float ratio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
      vec2 mask = min(borderUV, 1. - borderUV);
      vec2 pixel_thickness = min(250. / v_responsiveBoxGivenSize, vec2(.5));
      float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
      float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
      maskX = pow(maskX, .25);
      maskY = pow(maskY, .25);
      edge = clamp(1. - maskX * maskY, 0., 1.);

      uv = v_responsiveUV;
      if (ratio > 1.) {
        uv.y /= ratio;
      } else {
        uv.x *= ratio;
      }
      uv += .5;
      uv.y = 1. - uv.y;

      cycleWidth *= 2.;
      contOffset = 1.5;

    } else if (u_shape < 2.) {
      // circle
      vec2 shapeUV = uv - .5;
      shapeUV *= .67;
      edge = pow(clamp(3. * length(shapeUV), 0., 1.), 18.);
    } else if (u_shape < 3.) {
      // daisy
      vec2 shapeUV = uv - .5;
      shapeUV *= 1.68;

      float r = length(shapeUV) * 2.;
      float a = atan(shapeUV.y, shapeUV.x) + .2;
      r *= (1. + .05 * sin(3. * a + 2. * t));
      float f = abs(cos(a * 3.));
      edge = smoothstep(f, f + .7, r);
      edge *= edge;

      uv *= .8;
      cycleWidth *= 1.6;

    } else if (u_shape < 4.) {
      // diamond
      vec2 shapeUV = uv - .5;
      shapeUV = rotate(shapeUV, .25 * PI);
      shapeUV *= 1.42;
      shapeUV += .5;
      vec2 mask = min(shapeUV, 1. - shapeUV);
      vec2 pixel_thickness = vec2(.15);
      float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
      float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
      maskX = pow(maskX, .25);
      maskY = pow(maskY, .25);
      edge = clamp(1. - maskX * maskY, 0., 1.);
    } else if (u_shape < 5.) {
      // metaballs
      vec2 shapeUV = uv - .5;
      shapeUV *= 1.3;
      edge = 0.;
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float speed = 1.5 + 2./3. * sin(fi * 12.345);
        float angle = -fi * 1.5;
        vec2 dir1 = vec2(cos(angle), sin(angle));
        vec2 dir2 = vec2(cos(angle + 1.57), sin(angle + 1.));
        vec2 traj = .4 * (dir1 * sin(t * speed + fi * 1.23) + dir2 * cos(t * (speed * 0.7) + fi * 2.17));
        float d = length(shapeUV + traj);
        edge += pow(1.0 - clamp(d, 0.0, 1.0), 4.0);
      }
      edge = 1. - smoothstep(.65, .9, edge);
      edge = pow(edge, 4.);
    }

    edge = mix(smoothstep(.9 - 2. * fwidth(edge), .9, edge), edge, smoothstep(0.0, 0.4, u_contour));

  }

  float opacity = 0.;
  if (u_isImage == true) {
    opacity = img.g;
    float frame = getImgFrame(v_imageUV, 0.);
    opacity *= frame;
  } else {
    opacity = 1. - smoothstep(.9 - 2. * fwidth(edge), .9, edge);
    if (u_shape < 2.) {
      edge = 1.2 * edge;
    } else if (u_shape < 5.) {
      edge = 1.8 * pow(edge, 1.5);
    }
  }

  float diagBLtoTR = rotatedUV.x - rotatedUV.y;
  float diagTLtoBR = rotatedUV.x + rotatedUV.y;

  vec3 color = vec3(0.);
  vec3 color1 = vec3(.98, 0.98, 1.);
  vec3 color2 = vec3(.1, .1, .1 + .1 * smoothstep(.7, 1.3, diagTLtoBR));

  vec2 grad_uv = uv - .5;

  float dist = length(grad_uv + vec2(0., .2 * diagBLtoTR));
  grad_uv = rotate(grad_uv, (.25 - .2 * diagBLtoTR) * PI);
  float direction = grad_uv.x;

  float bump = pow(1.8 * dist, 1.2);
  bump = 1. - bump;
  bump *= pow(uv.y, .3);


  float thin_strip_1_ratio = .12 / cycleWidth * (1. - .4 * bump);
  float thin_strip_2_ratio = .07 / cycleWidth * (1. + .4 * bump);
  float wide_strip_ratio = (1. - thin_strip_1_ratio - thin_strip_2_ratio);

  float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
  float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

  float noise = snoise(uv - t);

  edge += (1. - edge) * u_distortion * noise;

  direction += diagBLtoTR;
  float contour = 0.;
  direction -= 2. * noise * diagBLtoTR * (smoothstep(0., 1., edge) * (1.0 - smoothstep(0., 1., edge)));
  direction *= mix(1., 1. - edge, smoothstep(.5, 1., u_contour));
  direction -= 1.7 * edge * smoothstep(.5, 1., u_contour);
  direction += .2 * pow(u_contour, 4.) * (1.0 - smoothstep(0., 1., edge));

  bump *= clamp(pow(uv.y, .1), .3, 1.);
  direction *= (.1 + (1.1 - edge) * bump);

  direction *= (.4 + .6 * (1.0 - smoothstep(.5, 1., edge)));
  direction += .18 * (smoothstep(.1, .2, uv.y) * (1.0 - smoothstep(.2, .4, uv.y)));
  direction += .03 * (smoothstep(.1, .2, 1. - uv.y) * (1.0 - smoothstep(.2, .4, 1. - uv.y)));

  direction *= (.5 + .5 * pow(uv.y, 2.));
  direction *= cycleWidth;
  direction -= t;


  float colorDispersion = (1. - bump);
  colorDispersion = clamp(colorDispersion, 0., 1.);
  float dispersionRed = colorDispersion;
  dispersionRed += .03 * bump * noise;
  dispersionRed += 5. * (smoothstep(-.1, .2, uv.y) * (1.0 - smoothstep(.1, .5, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, 1., bump)));
  dispersionRed -= diagBLtoTR;

  float dispersionBlue = colorDispersion;
  dispersionBlue *= 1.3;
  dispersionBlue += (smoothstep(0., .4, uv.y) * (1.0 - smoothstep(.1, .8, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, .8, bump)));
  dispersionBlue -= .2 * edge;

  dispersionRed *= (u_shiftRed / 20.);
  dispersionBlue *= (u_shiftBlue / 20.);

  float blur = 0.;
  float rExtraBlur = 0.;
  float gExtraBlur = 0.;
  if (u_isImage == true) {
    float softness = 0.05 * u_softness;
    blur = softness + .5 * smoothstep(1., 10., u_repetition) * smoothstep(.0, 1., edge);
    float smallCanvasT = 1.0 - smoothstep(100., 500., min(u_resolution.x, u_resolution.y));
    blur += smallCanvasT * smoothstep(.0, 1., edge);
    rExtraBlur = softness * (0.05 + .1 * (u_shiftRed / 20.) * bump);
    gExtraBlur = softness * 0.05 / max(0.001, abs(1. - diagBLtoTR));
  } else {
    blur = u_softness / 15. + .3 * contour;
  }

  vec3 w = vec3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
  w[1] -= .02 * smoothstep(.0, 1., edge + bump);
  float stripe_r = fract(direction + dispersionRed);
  float r = getColorChanges(color1.r, color2.r, stripe_r, w, blur + fwidth(stripe_r) + rExtraBlur, bump, u_colorTint.r);
  float stripe_g = fract(direction);
  float g = getColorChanges(color1.g, color2.g, stripe_g, w, blur + fwidth(stripe_g) + gExtraBlur, bump, u_colorTint.g);
  float stripe_b = fract(direction - dispersionBlue);
  float b = getColorChanges(color1.b, color2.b, stripe_b, w, blur + fwidth(stripe_b), bump, u_colorTint.b);

  color = vec3(r, g, b);
  color *= opacity;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
var POISSON_CONFIG_OPTIMIZED$1 = {
	measurePerformance: false,
	workingSize: 512,
	iterations: 40
};
function toProcessedLiquidMetal(file) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	const isBlob = typeof file === "string" && file.startsWith("blob:");
	return new Promise((resolve, reject) => {
		if (!file || !ctx) {
			reject(/* @__PURE__ */ new Error("Invalid file or canvas context"));
			return;
		}
		const blobContentTypePromise = isBlob && fetch(file).then((res) => res.headers.get("Content-Type"));
		const img = new Image();
		img.crossOrigin = "anonymous";
		const totalStartTime = performance.now();
		img.onload = async () => {
			let isSVG;
			const blobContentType = await blobContentTypePromise;
			if (blobContentType) isSVG = blobContentType === "image/svg+xml";
			else if (typeof file === "string") isSVG = file.endsWith(".svg") || file.startsWith("data:image/svg+xml");
			else isSVG = file.type === "image/svg+xml";
			let originalWidth = img.width || img.naturalWidth;
			let originalHeight = img.height || img.naturalHeight;
			if (isSVG) {
				const svgMaxSize = 4096;
				const aspectRatio = originalWidth / originalHeight;
				if (originalWidth > originalHeight) {
					originalWidth = svgMaxSize;
					originalHeight = svgMaxSize / aspectRatio;
				} else {
					originalHeight = svgMaxSize;
					originalWidth = svgMaxSize * aspectRatio;
				}
				img.width = originalWidth;
				img.height = originalHeight;
			}
			const minDimension = Math.min(originalWidth, originalHeight);
			const scaleFactor = POISSON_CONFIG_OPTIMIZED$1.workingSize / minDimension;
			const width = Math.round(originalWidth * scaleFactor);
			const height = Math.round(originalHeight * scaleFactor);
			if (POISSON_CONFIG_OPTIMIZED$1.measurePerformance) {
				console.log(`[Processing Mode]`);
				console.log(`  Original: ${originalWidth}\xD7${originalHeight}`);
				console.log(`  Working: ${width}\xD7${height} (${(scaleFactor * 100).toFixed(1)}% scale)`);
				if (scaleFactor < 1) console.log(`  Speedup: ~${Math.round(1 / (scaleFactor * scaleFactor))}\xD7`);
			}
			canvas.width = originalWidth;
			canvas.height = originalHeight;
			const shapeCanvas = document.createElement("canvas");
			shapeCanvas.width = width;
			shapeCanvas.height = height;
			const shapeCtx = shapeCanvas.getContext("2d");
			shapeCtx.drawImage(img, 0, 0, width, height);
			const startMask = performance.now();
			const data = shapeCtx.getImageData(0, 0, width, height).data;
			const shapeMask = new Uint8Array(width * height);
			const boundaryMask = new Uint8Array(width * height);
			let shapePixelCount = 0;
			for (let i = 0, idx = 0; i < data.length; i += 4, idx++) {
				const isShape = data[i + 3] === 0 ? 0 : 1;
				shapeMask[idx] = isShape;
				shapePixelCount += isShape;
			}
			const boundaryIndices = [];
			const interiorIndices = [];
			for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
				const idx = y * width + x;
				if (!shapeMask[idx]) continue;
				let isBoundary = false;
				if (x === 0 || x === width - 1 || y === 0 || y === height - 1) isBoundary = true;
				else isBoundary = !shapeMask[idx - 1] || !shapeMask[idx + 1] || !shapeMask[idx - width] || !shapeMask[idx + width] || !shapeMask[idx - width - 1] || !shapeMask[idx - width + 1] || !shapeMask[idx + width - 1] || !shapeMask[idx + width + 1];
				if (isBoundary) {
					boundaryMask[idx] = 1;
					boundaryIndices.push(idx);
				} else interiorIndices.push(idx);
			}
			if (POISSON_CONFIG_OPTIMIZED$1.measurePerformance) {
				console.log(`[Mask Building] Time: ${(performance.now() - startMask).toFixed(2)}ms`);
				console.log(`  Shape pixels: ${shapePixelCount} / ${width * height} (${(shapePixelCount / (width * height) * 100).toFixed(1)}%)`);
				console.log(`  Interior pixels: ${interiorIndices.length}`);
				console.log(`  Boundary pixels: ${boundaryIndices.length}`);
			}
			const sparseData = buildSparseData$1(shapeMask, boundaryMask, new Uint32Array(interiorIndices), new Uint32Array(boundaryIndices), width, height);
			const startSolve = performance.now();
			const u = solvePoissonSparse$1(sparseData, shapeMask, boundaryMask, width, height);
			if (POISSON_CONFIG_OPTIMIZED$1.measurePerformance) console.log(`[Poisson Solve] Time: ${(performance.now() - startSolve).toFixed(2)}ms`);
			let maxVal = 0;
			let finalImageData;
			for (let i = 0; i < interiorIndices.length; i++) {
				const idx = interiorIndices[i];
				if (u[idx] > maxVal) maxVal = u[idx];
			}
			const tempCanvas = document.createElement("canvas");
			tempCanvas.width = width;
			tempCanvas.height = height;
			const tempCtx = tempCanvas.getContext("2d");
			const tempImg = tempCtx.createImageData(width, height);
			for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
				const idx = y * width + x;
				const px = idx * 4;
				if (!shapeMask[idx]) {
					tempImg.data[px] = 255;
					tempImg.data[px + 1] = 255;
					tempImg.data[px + 2] = 255;
					tempImg.data[px + 3] = 0;
				} else {
					const gray = 255 * (1 - u[idx] / maxVal);
					tempImg.data[px] = gray;
					tempImg.data[px + 1] = gray;
					tempImg.data[px + 2] = gray;
					tempImg.data[px + 3] = 255;
				}
			}
			tempCtx.putImageData(tempImg, 0, 0);
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "high";
			ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, originalWidth, originalHeight);
			const outImg = ctx.getImageData(0, 0, originalWidth, originalHeight);
			const originalCanvas = document.createElement("canvas");
			originalCanvas.width = originalWidth;
			originalCanvas.height = originalHeight;
			const originalCtx = originalCanvas.getContext("2d");
			originalCtx.drawImage(img, 0, 0, originalWidth, originalHeight);
			const originalData = originalCtx.getImageData(0, 0, originalWidth, originalHeight);
			for (let i = 0; i < outImg.data.length; i += 4) {
				const a = originalData.data[i + 3];
				const upscaledAlpha = outImg.data[i + 3];
				if (a === 0) {
					outImg.data[i] = 255;
					outImg.data[i + 1] = 0;
				} else {
					outImg.data[i] = upscaledAlpha === 0 ? 0 : outImg.data[i];
					outImg.data[i + 1] = a;
				}
				outImg.data[i + 2] = 255;
				outImg.data[i + 3] = 255;
			}
			ctx.putImageData(outImg, 0, 0);
			finalImageData = outImg;
			canvas.toBlob((blob) => {
				if (!blob) {
					reject(/* @__PURE__ */ new Error("Failed to create PNG blob"));
					return;
				}
				if (POISSON_CONFIG_OPTIMIZED$1.measurePerformance) {
					const totalTime = performance.now() - totalStartTime;
					console.log(`[Total Processing Time] ${totalTime.toFixed(2)}ms`);
					if (scaleFactor < 1) {
						const estimatedFullResTime = totalTime * Math.pow(originalWidth * originalHeight / (width * height), 1.5);
						console.log(`[Estimated time at full resolution] ~${estimatedFullResTime.toFixed(0)}ms`);
						console.log(`[Time saved] ~${(estimatedFullResTime - totalTime).toFixed(0)}ms (${Math.round(estimatedFullResTime / totalTime)}\xD7 faster)`);
					}
				}
				resolve({
					imageData: finalImageData,
					pngBlob: blob
				});
			}, "image/png");
		};
		img.onerror = () => reject(/* @__PURE__ */ new Error("Failed to load image"));
		img.src = typeof file === "string" ? file : URL.createObjectURL(file);
	});
}
function buildSparseData$1(shapeMask, boundaryMask, interiorPixels, boundaryPixels, width, height) {
	const pixelCount = interiorPixels.length;
	const neighborIndices = new Int32Array(pixelCount * 4);
	for (let i = 0; i < pixelCount; i++) {
		const idx = interiorPixels[i];
		const x = idx % width;
		const y = Math.floor(idx / width);
		neighborIndices[i * 4 + 0] = x < width - 1 && shapeMask[idx + 1] ? idx + 1 : -1;
		neighborIndices[i * 4 + 1] = x > 0 && shapeMask[idx - 1] ? idx - 1 : -1;
		neighborIndices[i * 4 + 2] = y > 0 && shapeMask[idx - width] ? idx - width : -1;
		neighborIndices[i * 4 + 3] = y < height - 1 && shapeMask[idx + width] ? idx + width : -1;
	}
	return {
		interiorPixels,
		boundaryPixels,
		pixelCount,
		neighborIndices
	};
}
function solvePoissonSparse$1(sparseData, shapeMask, boundaryMask, width, height) {
	const ITERATIONS = POISSON_CONFIG_OPTIMIZED$1.iterations;
	const C = .01;
	const u = new Float32Array(width * height);
	const { interiorPixels, neighborIndices, pixelCount } = sparseData;
	const startTime = performance.now();
	const omega = 1.9;
	const redPixels = [];
	const blackPixels = [];
	for (let i = 0; i < pixelCount; i++) {
		const idx = interiorPixels[i];
		if ((idx % width + Math.floor(idx / width)) % 2 === 0) redPixels.push(i);
		else blackPixels.push(i);
	}
	for (let iter = 0; iter < ITERATIONS; iter++) {
		for (const i of redPixels) {
			const idx = interiorPixels[i];
			const eastIdx = neighborIndices[i * 4 + 0];
			const westIdx = neighborIndices[i * 4 + 1];
			const northIdx = neighborIndices[i * 4 + 2];
			const southIdx = neighborIndices[i * 4 + 3];
			let sumN = 0;
			if (eastIdx >= 0) sumN += u[eastIdx];
			if (westIdx >= 0) sumN += u[westIdx];
			if (northIdx >= 0) sumN += u[northIdx];
			if (southIdx >= 0) sumN += u[southIdx];
			u[idx] = omega * ((C + sumN) / 4) + (1 - omega) * u[idx];
		}
		for (const i of blackPixels) {
			const idx = interiorPixels[i];
			const eastIdx = neighborIndices[i * 4 + 0];
			const westIdx = neighborIndices[i * 4 + 1];
			const northIdx = neighborIndices[i * 4 + 2];
			const southIdx = neighborIndices[i * 4 + 3];
			let sumN = 0;
			if (eastIdx >= 0) sumN += u[eastIdx];
			if (westIdx >= 0) sumN += u[westIdx];
			if (northIdx >= 0) sumN += u[northIdx];
			if (southIdx >= 0) sumN += u[southIdx];
			u[idx] = omega * ((C + sumN) / 4) + (1 - omega) * u[idx];
		}
	}
	if (POISSON_CONFIG_OPTIMIZED$1.measurePerformance) {
		const elapsed = performance.now() - startTime;
		console.log(`[Optimized Poisson Solver (SOR \u03C9=${omega})]`);
		console.log(`  Working size: ${width}\xD7${height}`);
		console.log(`  Iterations: ${ITERATIONS}`);
		console.log(`  Time: ${elapsed.toFixed(2)}ms`);
		console.log(`  Interior pixels processed: ${pixelCount}`);
		console.log(`  Speed: ${(ITERATIONS * pixelCount / (elapsed * 1e3)).toFixed(2)} Mpixels/sec`);
	}
	return u;
}
var LiquidMetalShapes = {
	none: 0,
	circle: 1,
	daisy: 2,
	diamond: 3,
	metaballs: 4
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/halftone-dots.js
var halftoneDotsFragmentShader = `#version 300 es
precision mediump float;

uniform float u_rotation;

uniform float u_time;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform float u_radius;
uniform float u_contrast;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_size;
uniform float u_grainMixer;
uniform float u_grainOverlay;
uniform float u_grainSize;
uniform float u_grid;
uniform bool u_originalColors;
uniform bool u_inverted;
uniform float u_type;

in vec2 v_imageUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${proceduralHash21}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

float sst(float edge0, float edge1, float x) {
  return smoothstep(edge0, edge1, x);
}

float getCircle(vec2 uv, float r, float baseR) {
  r = mix(.25 * baseR, 0., r);
  float d = length(uv - .5);
  float aa = fwidth(d);
  return 1. - smoothstep(r - aa, r + aa, d);
}

float getCell(vec2 uv) {
  float insideX = step(0.0, uv.x) * (1.0 - step(1.0, uv.x));
  float insideY = step(0.0, uv.y) * (1.0 - step(1.0, uv.y));
  return insideX * insideY;
}

float getCircleWithHole(vec2 uv, float r, float baseR) {
  float cell = getCell(uv);

  r = mix(.75 * baseR, 0., r);
  float rMod = mod(r, .5);

  float d = length(uv - .5);
  float aa = fwidth(d);
  float circle = 1. - smoothstep(rMod - aa, rMod + aa, d);
  if (r < .5) {
    return circle;
  } else {
    return cell - circle;
  }
}

float getGooeyBall(vec2 uv, float r, float baseR) {
  float d = length(uv - .5);
  float sizeRadius = .3;
  if (u_grid == 1.) {
    sizeRadius = .42;
  }
  sizeRadius = mix(sizeRadius * baseR, 0., r);
  d = 1. - sst(0., sizeRadius, d);

  d = pow(d, 2. + baseR);
  return d;
}

float getSoftBall(vec2 uv, float r, float baseR) {
  float d = length(uv - .5);
  float sizeRadius = clamp(baseR, 0., 1.);
  sizeRadius = mix(.5 * sizeRadius, 0., r);
  d = 1. - lst(0., sizeRadius, d);
  float powRadius = 1. - lst(0., 2., baseR);
  d = pow(d, 4. + 3. * powRadius);
  return d;
}

float getUvFrame(vec2 uv, vec2 pad) {
  float aa = 0.0001;

  float left   = smoothstep(-pad.x, -pad.x + aa, uv.x);
  float right  = smoothstep(1.0 + pad.x, 1.0 + pad.x - aa, uv.x);
  float bottom = smoothstep(-pad.y, -pad.y + aa, uv.y);
  float top    = smoothstep(1.0 + pad.y, 1.0 + pad.y - aa, uv.y);

  return left * right * bottom * top;
}

float sigmoid(float x, float k) {
  return 1.0 / (1.0 + exp(-k * (x - 0.5)));
}

float getLumAtPx(vec2 uv, float contrast) {
  vec4 tex = texture(u_image, uv);
  vec3 color = vec3(
  sigmoid(tex.r, contrast),
  sigmoid(tex.g, contrast),
  sigmoid(tex.b, contrast)
  );
  float lum = dot(vec3(0.2126, 0.7152, 0.0722), color);
  lum = mix(1., lum, tex.a);
  lum = u_inverted ? (1. - lum) : lum;
  return lum;
}

float getLumBall(vec2 p, vec2 pad, vec2 inCellOffset, float contrast, float baseR, float stepSize, out vec4 ballColor) {
  p += inCellOffset;
  vec2 uv_i = floor(p);
  vec2 uv_f = fract(p);
  vec2 samplingUV = (uv_i + .5 - inCellOffset) * pad + vec2(.5);
  float outOfFrame = getUvFrame(samplingUV, pad * stepSize);

  float lum = getLumAtPx(samplingUV, contrast);
  ballColor = texture(u_image, samplingUV);
  ballColor.rgb *= ballColor.a;
  ballColor *= outOfFrame;

  float ball = 0.;
  if (u_type == 0.) {
    // classic
    ball = getCircle(uv_f, lum, baseR);
  } else if (u_type == 1.) {
    // gooey
    ball = getGooeyBall(uv_f, lum, baseR);
  } else if (u_type == 2.) {
    // holes
    ball = getCircleWithHole(uv_f, lum, baseR);
  } else if (u_type == 3.) {
    // soft
    ball = getSoftBall(uv_f, lum, baseR);
  }

  return ball * outOfFrame;
}


void main() {

  float stepMultiplier = 1.;
  if (u_type == 0.) {
    // classic
    stepMultiplier = 2.;
  } else if (u_type == 1. || u_type == 3.) {
    // gooey & soft
    stepMultiplier = 6.;
  }

  float cellsPerSide = mix(300., 7., pow(u_size, .7));
  cellsPerSide /= stepMultiplier;
  float cellSizeY = 1. / cellsPerSide;
  vec2 pad = cellSizeY * vec2(1. / u_imageAspectRatio, 1.);
  if (u_type == 1. && u_grid == 1.) {
    // gooey diagonal grid works differently
    pad *= .7;
  }

  vec2 uv = v_imageUV;
  uv -= vec2(.5);
  uv /= pad;

  float contrast = mix(0., 15., pow(u_contrast, 1.5));
  float baseRadius = u_radius;
  if (u_originalColors == true) {
    contrast = mix(.1, 4., pow(u_contrast, 2.));
    baseRadius = 2. * pow(.5 * u_radius, .3);
  }

  float totalShape = 0.;
  vec3 totalColor = vec3(0.);
  float totalOpacity = 0.;

  vec4 ballColor;
  float shape;
  float stepSize = 1. / stepMultiplier;
  for (float x = -0.5; x < 0.5; x += stepSize) {
    for (float y = -0.5; y < 0.5; y += stepSize) {
      vec2 offset = vec2(x, y);

      if (u_grid == 1.) {
        float rowIndex = floor((y + .5) / stepSize);
        float colIndex = floor((x + .5) / stepSize);
        if (stepSize == 1.) {
          rowIndex = floor(uv.y + y + 1.);
          if (u_type == 1.) {
            colIndex = floor(uv.x + x + 1.);
          }
        }
        if (u_type == 1.) {
          if (mod(rowIndex + colIndex, 2.) == 1.) {
            continue;
          }
        } else {
          if (mod(rowIndex, 2.) == 1.) {
            offset.x += .5 * stepSize;
          }
        }
      }

      shape = getLumBall(uv, pad, offset, contrast, baseRadius, stepSize, ballColor);
      totalColor   += ballColor.rgb * shape;
      totalShape   += shape;
      totalOpacity += shape;
    }
  }

  const float eps = 1e-4;

  totalColor /= max(totalShape, eps);
  totalOpacity /= max(totalShape, eps);

  float finalShape = 0.;
  if (u_type == 0.) {
    finalShape = min(1., totalShape);
  } else if (u_type == 1.) {
    float aa = fwidth(totalShape);
    float th = .5;
    finalShape = smoothstep(th - aa, th + aa, totalShape);
  } else if (u_type == 2.) {
    finalShape = min(1., totalShape);
  } else if (u_type == 3.) {
    finalShape = totalShape;
  }

  vec2 grainSize = mix(2000., 200., u_grainSize) * vec2(1., 1. / u_imageAspectRatio);
  vec2 grainUV = v_imageUV - .5;
  grainUV *= grainSize;
  grainUV += .5;
  float grain = valueNoise(grainUV);
  grain = smoothstep(.55, .7 + .2 * u_grainMixer, grain);
  grain *= u_grainMixer;
  finalShape = mix(finalShape, 0., grain);

  vec3 color = vec3(0.);
  float opacity = 0.;

  if (u_originalColors == true) {
    color = totalColor * finalShape;
    opacity = totalOpacity * finalShape;

    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    color = color + bgColor * (1. - opacity);
    opacity = opacity + u_colorBack.a * (1. - opacity);
  } else {
    vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
    float fgOpacity = u_colorFront.a;
    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    float bgOpacity = u_colorBack.a;

    color = fgColor * finalShape;
    opacity = fgOpacity * finalShape;
    color += bgColor * (1. - opacity);
    opacity += bgOpacity * (1. - opacity);
  }

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .5 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
var HalftoneDotsTypes = {
	classic: 0,
	gooey: 1,
	holes: 2,
	soft: 3
};
var HalftoneDotsGrids = {
	square: 0,
	hex: 1
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/halftone-cmyk.js
var halftoneCmykFragmentShader = `#version 300 es
precision mediump float;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform vec4 u_colorBack;
uniform vec4 u_colorC;
uniform vec4 u_colorM;
uniform vec4 u_colorY;
uniform vec4 u_colorK;
uniform float u_size;
uniform float u_minDot;
uniform float u_contrast;
uniform float u_grainSize;
uniform float u_grainMixer;
uniform float u_grainOverlay;
uniform float u_gridNoise;
uniform float u_softness;
uniform float u_floodC;
uniform float u_floodM;
uniform float u_floodY;
uniform float u_floodK;
uniform float u_gainC;
uniform float u_gainM;
uniform float u_gainY;
uniform float u_gainK;
uniform float u_type;
uniform sampler2D u_noiseTexture;

in vec2 v_imageUV;
out vec4 fragColor;

const float shiftC = -.5;
const float shiftM = -.25;
const float shiftY = .2;
const float shiftK = 0.;

// Precomputed sin/cos for rotation angles (15\xB0, 75\xB0, 0\xB0, 45\xB0)
const float cosC = 0.9659258;  const float sinC = 0.2588190;   // 15\xB0
const float cosM = 0.2588190;  const float sinM = 0.9659258;   // 75\xB0
const float cosY = 1.0;        const float sinY = 0.0;         // 0\xB0
const float cosK = 0.7071068;  const float sinK = 0.7071068;   // 45\xB0

${declarePI}

vec2 randomRG(vec2 p) {
  vec2 uv = floor(p) / 100. + .5;
  return texture(u_noiseTexture, fract(uv)).rg;
}
vec3 hash23(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.3183099, 0.3678794, 0.3141592)) + 0.1;
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3(p3.x * p3.y, p3.y * p3.z, p3.z * p3.x));
}

float sst(float edge0, float edge1, float x) {
  return smoothstep(edge0, edge1, x);
}

vec3 valueNoise3(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec3 a = hash23(i);
  vec3 b = hash23(i + vec2(1.0, 0.0));
  vec3 c = hash23(i + vec2(0.0, 1.0));
  vec3 d = hash23(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec3 x1 = mix(a, b, u.x);
  vec3 x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float getUvFrame(vec2 uv, vec2 pad) {
  float left   = smoothstep(-pad.x, 0., uv.x);
  float right  = smoothstep(1. + pad.x, 1., uv.x);
  float bottom = smoothstep(-pad.y, 0., uv.y);
  float top    = smoothstep(1. + pad.y, 1., uv.y);

  return left * right * bottom * top;
}

vec4 RGBAtoCMYK(vec4 rgba) {
  float k = 1. - max(max(rgba.r, rgba.g), rgba.b);
  float denom = 1. - k;
  vec3 cmy = vec3(0.);
  if (denom > 1e-5) {
    cmy = (1. - rgba.rgb - vec3(k)) / denom;
  }
  return vec4(cmy, k) * rgba.a;
}

vec3 applyContrast(vec3 rgb) {
  return clamp((rgb - 0.5) * u_contrast + 0.5, 0.0, 1.0);
}

// Single-component CMYK extractors with contrast built-in, alpha-aware
float getCyan(vec4 rgba) {
  vec3 c = clamp((rgba.rgb - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  float maxRGB = max(max(c.r, c.g), c.b);
  return (maxRGB > 1e-5 ? (maxRGB - c.r) / maxRGB : 0.) * rgba.a;
}
float getMagenta(vec4 rgba) {
  vec3 c = clamp((rgba.rgb - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  float maxRGB = max(max(c.r, c.g), c.b);
  return (maxRGB > 1e-5 ? (maxRGB - c.g) / maxRGB : 0.) * rgba.a;
}
float getYellow(vec4 rgba) {
  vec3 c = clamp((rgba.rgb - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  float maxRGB = max(max(c.r, c.g), c.b);
  return (maxRGB > 1e-5 ? (maxRGB - c.b) / maxRGB : 0.) * rgba.a;
}
float getBlack(vec4 rgba) {
  vec3 c = clamp((rgba.rgb - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  return (1. - max(max(c.r, c.g), c.b)) * rgba.a;
}

vec2 cellCenterPos(vec2 uv, vec2 cellOffset, float channelIdx) {
  vec2 cellCenter = floor(uv) + .5 + cellOffset;
  return cellCenter + (randomRG(cellCenter + channelIdx * 50.) - .5) * u_gridNoise;
}

vec2 gridToImageUV(vec2 cellCenter, float cosA, float sinA, float shift, vec2 pad) {
  vec2 uvGrid = mat2(cosA, -sinA, sinA, cosA) * (cellCenter - shift);
  return uvGrid * pad + 0.5;
}

void colorMask(vec2 pos, vec2 cellCenter, float rad, float transparency, float grain, float channelAddon, float channelgain, float generalComp, bool isJoined, inout float outMask) {
  float dist = length(pos - cellCenter);

  float radius = rad;
  radius *= (1. + generalComp);
  radius += (.15 + channelgain * radius);
  radius = max(0., radius);
  radius = mix(0., radius, transparency);
  radius += channelAddon;
  radius *= (1. - grain);

  float mask = 1. - sst(0., radius, dist);
  if (isJoined) {
    // ink or sharp (joined)
    mask = pow(mask, 1.2);
  } else {
    // dots (separate)
    mask = sst(.5 - .5 * u_softness, .51 + .49 * u_softness, mask);
  }

  mask *= mix(1., mix(.5, 1., 1.5 * radius), u_softness);
  outMask += mask;
}

vec3 applyInk(vec3 paper, vec3 inkColor, float cov) {
  vec3 inkEffect = mix(vec3(1.0), inkColor, clamp(cov, 0.0, 1.0));
  return paper * inkEffect;
}

void main() {
  vec2 uv = v_imageUV;

  float cellsPerSide = mix(400.0, 7.0, pow(u_size, 0.7));
  float cellSizeY = 1.0 / cellsPerSide;
  vec2 pad = cellSizeY * vec2(1.0 / u_imageAspectRatio, 1.0);
  vec2 uvGrid = (uv - .5) / pad;
  float insideImageBox = getUvFrame(uv, pad);

  float generalComp = .1 * u_softness + .1 * u_gridNoise + .1 * (1. - step(0.5, u_type)) * (1.5 - u_softness);

  vec2 uvC = mat2(cosC, sinC, -sinC, cosC) * uvGrid + shiftC;
  vec2 uvM = mat2(cosM, sinM, -sinM, cosM) * uvGrid + shiftM;
  vec2 uvY = mat2(cosY, sinY, -sinY, cosY) * uvGrid + shiftY;
  vec2 uvK = mat2(cosK, sinK, -sinK, cosK) * uvGrid + shiftK;

  vec2 grainSize = mix(2000., 200., u_grainSize) * vec2(1., 1. / u_imageAspectRatio);
  vec2 grainUV = (v_imageUV - .5) * grainSize + .5;
  vec3 noiseValues = valueNoise3(grainUV);
  float grain = sst(.55, 1., noiseValues.r);
  grain *= u_grainMixer;

  vec4 outMask = vec4(0.);
  bool isJoined = u_type > 0.5;

  if (u_type < 1.5) {
    // dots or ink: per-cell color sampling
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 cellOffset = vec2(float(dx), float(dy));

        vec2 cellCenterC = cellCenterPos(uvC, cellOffset, 0.);
        vec4 texC = texture(u_image, gridToImageUV(cellCenterC, cosC, sinC, shiftC, pad));
        colorMask(uvC, cellCenterC, getCyan(texC), insideImageBox * texC.a, grain, u_floodC, u_gainC, generalComp, isJoined, outMask[0]);

        vec2 cellCenterM = cellCenterPos(uvM, cellOffset, 1.);
        vec4 texM = texture(u_image, gridToImageUV(cellCenterM, cosM, sinM, shiftM, pad));
        colorMask(uvM, cellCenterM, getMagenta(texM), insideImageBox * texM.a, grain, u_floodM, u_gainM, generalComp, isJoined, outMask[1]);

        vec2 cellCenterY = cellCenterPos(uvY, cellOffset, 2.);
        vec4 texY = texture(u_image, gridToImageUV(cellCenterY, cosY, sinY, shiftY, pad));
        colorMask(uvY, cellCenterY, getYellow(texY), insideImageBox * texY.a, grain, u_floodY, u_gainY, generalComp, isJoined, outMask[2]);

        vec2 cellCenterK = cellCenterPos(uvK, cellOffset, 3.);
        vec4 texK = texture(u_image, gridToImageUV(cellCenterK, cosK, sinK, shiftK, pad));
        colorMask(uvK, cellCenterK, getBlack(texK), insideImageBox * texK.a, grain, u_floodK, u_gainK, generalComp, isJoined, outMask[3]);
      }
    }
  } else {
    // sharp: direct px color sampling
    vec4 tex = texture(u_image, uv);
    tex.rgb = applyContrast(tex.rgb);
    insideImageBox *= tex.a;
    vec4 cmykOriginal = RGBAtoCMYK(tex);
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 cellOffset = vec2(float(dx), float(dy));

        colorMask(uvC, cellCenterPos(uvC, cellOffset, 0.), cmykOriginal.x, insideImageBox, grain, u_floodC, u_gainC, generalComp, isJoined, outMask[0]);
        colorMask(uvM, cellCenterPos(uvM, cellOffset, 1.), cmykOriginal.y, insideImageBox, grain, u_floodM, u_gainM, generalComp, isJoined, outMask[1]);
        colorMask(uvY, cellCenterPos(uvY, cellOffset, 2.), cmykOriginal.z, insideImageBox, grain, u_floodY, u_gainY, generalComp, isJoined, outMask[2]);
        colorMask(uvK, cellCenterPos(uvK, cellOffset, 3.), cmykOriginal.w, insideImageBox, grain, u_floodK, u_gainK, generalComp, isJoined, outMask[3]);
      }
    }
  }

  float shape;

  float C = outMask[0];
  float M = outMask[1];
  float Y = outMask[2];
  float K = outMask[3];

  if (isJoined) {
    // ink or sharp: apply threshold for joined dots
    float th = .5;
    float sLeft = th * u_softness;
    float sRight = (1. - th) * u_softness + .01;
    C = smoothstep(th - sLeft - fwidth(C), th + sRight, C);
    M = smoothstep(th - sLeft - fwidth(M), th + sRight, M);
    Y = smoothstep(th - sLeft - fwidth(Y), th + sRight, Y);
    K = smoothstep(th - sLeft - fwidth(K), th + sRight, K);
  }

  C *= u_colorC.a;
  M *= u_colorM.a;
  Y *= u_colorY.a;
  K *= u_colorK.a;

  vec3 ink = vec3(1.);
  ink = applyInk(ink, u_colorK.rgb, K);
  ink = applyInk(ink, u_colorC.rgb, C);
  ink = applyInk(ink, u_colorM.rgb, M);
  ink = applyInk(ink, u_colorY.rgb, Y);

  shape = clamp(max(max(C, M), max(Y, K)), 0., 1.);

  vec3 color = u_colorBack.rgb * u_colorBack.a;

  float opacity = u_colorBack.a;
  color = mix(color, ink, shape);
  opacity += shape;
  opacity = clamp(opacity, 0., 1.);

  float grainOverlay = mix(noiseValues.g, noiseValues.b, .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .5 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
var HalftoneCmykTypes = {
	dots: 0,
	ink: 1,
	sharp: 2
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/gem-smoke.js
var gemSmokeMeta = { maxColorCount: 6 };
var gemSmokeFragmentShader = `#version 300 es
precision mediump float;

in mediump vec2 v_imageUV;
in mediump vec2 v_objectUV;
in mediump vec2 v_responsiveUV;
in mediump vec2 v_responsiveBoxGivenSize;
out vec4 fragColor;

// Image
uniform sampler2D u_image;
uniform float u_imageAspectRatio;

// Canvas
uniform vec2 u_resolution;
uniform float u_time;

// Colors
uniform vec4 u_colors[${gemSmokeMeta.maxColorCount}];
uniform float u_colorsCount;
uniform vec4 u_colorBack;
uniform vec4 u_colorInner;

// Effect controls
uniform float u_innerDistortion;
uniform float u_outerDistortion;
uniform float u_outerGlow;
uniform float u_innerGlow;
uniform float u_offset;
uniform float u_angle;
uniform float u_size;

// Shape controls
uniform float u_shape;
uniform bool u_isImage;

${declarePI}
${rotation2}

// 9x9 Gaussian blur on R and G channels
vec2 gaussBlur9x9RG(sampler2D tex, vec2 uv, vec2 dudx, vec2 dudy, float radius) {
  vec2 texel = 1.0 / vec2(textureSize(tex, 0));
  vec2 r = max(radius, 0.0) * texel;
  // Pascal's row 8: sum = 256, 2D norm = 65536
  const float k[9] = float[9](1.0, 8.0, 28.0, 56.0, 70.0, 56.0, 28.0, 8.0, 1.0);
  vec2 sum = vec2(0.0);

  for (int j = -4; j <= 4; ++j) {
    float wy = k[j + 4];
    for (int i = -4; i <= 4; ++i) {
      float w = k[i + 4] * wy;
      vec2 off = vec2(float(i) * r.x, float(j) * r.y);
      sum += w * texture(tex, uv + off).rg;
    }
  }

  return sum / 65536.0;
}

float sst(float a, float b, float x) {
  return smoothstep(a, b, x);
}

void main() {
  float time = u_time;

  float roundness = 0.;
  float imgAlpha = 0.;

  if (u_isImage == true) {
    // Image sampling (UV scaled inward to account for padding)
    vec2 imageUV = v_imageUV;
    imageUV -= .5;
    imageUV *= .95;
    imageUV += .5;

    vec2 dudx = dFdx(v_imageUV);
    vec2 dudy = dFdy(v_imageUV);

    // Blurred image: x = roundness, y = alpha
    vec2 blurred = gaussBlur9x9RG(u_image, imageUV, dudx, dudy, 10.);
    roundness = 1. - blurred.x;
    vec2 texelA = 1.0 / vec2(textureSize(u_image, 0));
    const float k3[3] = float[3](1.0, 2.0, 1.0);
    for (int j = -1; j <= 1; ++j) {
      for (int i = -1; i <= 1; ++i) {
        imgAlpha += k3[i + 1] * k3[j + 1] * texture(u_image, imageUV + vec2(float(i) * texelA.x, float(j) * texelA.y)).g;
      }
    }
    imgAlpha /= 16.0;
  } else {
    vec2 uv = v_objectUV + .5;
    uv.y = 1. - uv.y;
    float edge = 0.;

    if (u_shape < 1.) {
      // full-fill on canvas
      vec2 borderUV = v_responsiveUV + .5;
      vec2 mask = min(borderUV, 1. - borderUV);
      vec2 pixel_thickness = min(250. / v_responsiveBoxGivenSize, vec2(.5));
      float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
      float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
      maskX = pow(maskX, .25);
      maskY = pow(maskY, .25);
      edge = clamp(1. - maskX * maskY, 0., 1.);
    } else if (u_shape < 2.) {
      // circle
      vec2 shapeUV = uv - .5;
      shapeUV *= .67;
      edge = pow(clamp(3. * length(shapeUV), 0., 1.), 18.);
    } else if (u_shape < 3.) {
      // daisy
      vec2 shapeUV = uv - .5;
      shapeUV *= 1.68;

      float r = length(shapeUV) * 2.;
      float a = atan(shapeUV.y, shapeUV.x) + .2;
      r *= (1. + .05 * sin(3. * a + 2. * time));
      float f = abs(cos(a * 3.));
      edge = smoothstep(f, f + .7, r);
      edge *= edge;
    } else if (u_shape < 4.) {
      // diamond
      vec2 shapeUV = uv - .5;
      shapeUV = rotate(shapeUV, .25 * PI);
      shapeUV *= 1.42;
      shapeUV += .5;
      vec2 mask = min(shapeUV, 1. - shapeUV);
      vec2 pixel_thickness = vec2(.15);
      float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
      float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
      maskX = pow(maskX, .25);
      maskY = pow(maskY, .25);
      edge = clamp(1. - maskX * maskY, 0., 1.);
    } else if (u_shape < 5.) {
      // metaballs
      vec2 shapeUV = uv - .5;
      shapeUV *= 1.3;
      edge = 0.;
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float speed = 1.5 + 2./3. * sin(fi * 12.345);
        float angle = -fi * 1.5;
        vec2 dir1 = vec2(cos(angle), sin(angle));
        vec2 dir2 = vec2(cos(angle + 1.57), sin(angle + 1.));
        vec2 traj = .4 * (dir1 * sin(time * speed + fi * 1.23) + dir2 * cos(time * (speed * 0.7) + fi * 2.17));
        float d = length(shapeUV + traj);
        edge += pow(1.0 - clamp(d, 0.0, 1.0), 4.0);
      }
      edge = 1. - smoothstep(.65, .9, edge);
      edge = pow(edge, 4.);
    }

    imgAlpha = 1. - smoothstep(.9 - 2. * fwidth(edge), .9, edge);
    roundness = 1. - edge;
  }

// Smoke UV setup
  vec2 smokeUV = v_objectUV;
  smokeUV = rotate(smokeUV, u_angle * PI / 180.);
  smokeUV *= mix(4., 1., u_size);

  // Two swirl paths: inner (shape-masked) and outer (free), each with independent distortion
  vec2 innerUV = smokeUV;
  vec2 outerUV = smokeUV;

  // Vertical displacement \u2014 applied independently to inner and outer
  innerUV.y += u_innerDistortion * (1. - sst(0., 1., length(.4 * innerUV)));
  innerUV.y -= .4 * u_innerDistortion;
  innerUV.y += .7 * u_offset * roundness;

  outerUV.y += u_outerDistortion * (1. - sst(0., 1., length(.4 * outerUV)));
  outerUV.y -= .4 * u_outerDistortion;

  float innerSwirl = u_innerDistortion * roundness;
  float outerSwirl = u_outerDistortion;

  for (int i = 1; i < 5; i++) {
    float fi = float(i);

    float stretchIn = max(length(dFdx(innerUV)), length(dFdy(innerUV)));
    float dampenIn = 1. / (1. + stretchIn * 8.);
    float sIn = innerSwirl * dampenIn;
    innerUV.x += sIn / fi * cos(time + fi * 2.9 * innerUV.y);
    innerUV.y += sIn / fi * cos(time + fi * 1.5 * innerUV.x);

    float stretchOut = max(length(dFdx(outerUV)), length(dFdy(outerUV)));
    float dampenOut = 1. / (1. + stretchOut * 8.);
    float sOut = outerSwirl * dampenOut;
    outerUV.x += sOut / fi * cos(time + fi * 2.9 * outerUV.y);
    outerUV.y += sOut / fi * cos(time + fi * 1.5 * outerUV.x);
  }

  // Smoke shapes from swirl fields
  float innerShape = exp(-1.5 * dot(innerUV, innerUV));
  float outerShape = exp(-1.5 * dot(outerUV, outerUV));

  // Visibility masks
  float outerMask = pow(u_outerGlow, 2.) * (1. - imgAlpha);
  float innerMask = (.01 + .99 * u_innerGlow) * imgAlpha;

  innerShape *= innerMask;
  outerShape *= outerMask;

  // Color gradient
  float mixer = (innerShape + outerShape) * u_colorsCount;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;

  float smokeMask = 0.;
  for (int i = 1; i < ${gemSmokeMeta.maxColorCount + 1}; i++) {
    if (i > int(u_colorsCount)) break;

    float m = sst(0., 1., clamp(mixer - float(i - 1), 0., 1.));
    if (i == 1) smokeMask = m;

    vec4 c = u_colors[i - 1];
    c.rgb *= c.a;
    gradient = mix(gradient, c, m);
  }

  // Compositing (premultiplied alpha, front-to-back)
  vec3 color = gradient.rgb * smokeMask;
  float opacity = gradient.a * smokeMask;

  float innerOpacity = u_colorInner.a * imgAlpha;
  vec3 innerColor = u_colorInner.rgb * innerOpacity;
  color += innerColor * (1.0 - opacity);
  opacity += innerOpacity * (1.0 - opacity);

  vec3 backColor = u_colorBack.rgb * u_colorBack.a;
  color += backColor * (1.0 - opacity);
  opacity += u_colorBack.a * (1.0 - opacity);

  fragColor = vec4(color, opacity);
}
`;
var POISSON_CONFIG_OPTIMIZED = {
	measurePerformance: false,
	workingSize: 512,
	iterations: 32
};
function toProcessedGemSmoke(file) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	const isBlob = typeof file === "string" && file.startsWith("blob:");
	return new Promise((resolve, reject) => {
		if (!file || !ctx) {
			reject(/* @__PURE__ */ new Error("Invalid file or canvas context"));
			return;
		}
		const blobContentTypePromise = isBlob && fetch(file).then((res) => res.headers.get("Content-Type"));
		const img = new Image();
		img.crossOrigin = "anonymous";
		const totalStartTime = performance.now();
		img.onload = async () => {
			let isSVG;
			const blobContentType = await blobContentTypePromise;
			if (blobContentType) isSVG = blobContentType === "image/svg+xml";
			else if (typeof file === "string") isSVG = file.endsWith(".svg") || file.startsWith("data:image/svg+xml");
			else isSVG = file.type === "image/svg+xml";
			let originalWidth = img.width || img.naturalWidth;
			let originalHeight = img.height || img.naturalHeight;
			if (isSVG) {
				const svgMaxSize = 4096;
				const aspectRatio = originalWidth / originalHeight;
				if (originalWidth > originalHeight) {
					originalWidth = svgMaxSize;
					originalHeight = svgMaxSize / aspectRatio;
				} else {
					originalHeight = svgMaxSize;
					originalWidth = svgMaxSize * aspectRatio;
				}
				img.width = originalWidth;
				img.height = originalHeight;
			}
			const minDimension = Math.min(originalWidth, originalHeight);
			const scaleFactor = POISSON_CONFIG_OPTIMIZED.workingSize / minDimension;
			const width = Math.round(originalWidth * scaleFactor);
			const height = Math.round(originalHeight * scaleFactor);
			if (POISSON_CONFIG_OPTIMIZED.measurePerformance) {
				console.log(`[Processing Mode]`);
				console.log(`  Original: ${originalWidth}\xD7${originalHeight}`);
				console.log(`  Working: ${width}\xD7${height} (${(scaleFactor * 100).toFixed(1)}% scale)`);
				if (scaleFactor < 1) console.log(`  Speedup: ~${Math.round(1 / (scaleFactor * scaleFactor))}\xD7`);
			}
			canvas.width = originalWidth;
			canvas.height = originalHeight;
			const paddingSize = .025;
			const padX = Math.ceil(width * paddingSize);
			const padY = Math.ceil(height * paddingSize);
			const imgW = width - 2 * padX;
			const imgH = height - 2 * padY;
			const shapeCanvas = document.createElement("canvas");
			shapeCanvas.width = width;
			shapeCanvas.height = height;
			const shapeCtx = shapeCanvas.getContext("2d");
			shapeCtx.drawImage(img, padX, padY, imgW, imgH);
			const startMask = performance.now();
			const data = shapeCtx.getImageData(0, 0, width, height).data;
			const shapeMask = new Uint8Array(width * height);
			const boundaryMask = new Uint8Array(width * height);
			let shapePixelCount = 0;
			for (let i = 0, idx = 0; i < data.length; i += 4, idx++) {
				const isShape = data[i + 3] === 0 ? 0 : 1;
				shapeMask[idx] = isShape;
				shapePixelCount += isShape;
			}
			const boundaryIndices = [];
			const interiorIndices = [];
			for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
				const idx = y * width + x;
				if (!shapeMask[idx]) continue;
				let isBoundary = false;
				if (x === 0 || x === width - 1 || y === 0 || y === height - 1) isBoundary = true;
				else isBoundary = !shapeMask[idx - 1] || !shapeMask[idx + 1] || !shapeMask[idx - width] || !shapeMask[idx + width] || !shapeMask[idx - width - 1] || !shapeMask[idx - width + 1] || !shapeMask[idx + width - 1] || !shapeMask[idx + width + 1];
				if (isBoundary) {
					boundaryMask[idx] = 1;
					boundaryIndices.push(idx);
				} else interiorIndices.push(idx);
			}
			if (POISSON_CONFIG_OPTIMIZED.measurePerformance) {
				console.log(`[Mask Building] Time: ${(performance.now() - startMask).toFixed(2)}ms`);
				console.log(`  Shape pixels: ${shapePixelCount} / ${width * height} (${(shapePixelCount / (width * height) * 100).toFixed(1)}%)`);
				console.log(`  Interior pixels: ${interiorIndices.length}`);
				console.log(`  Boundary pixels: ${boundaryIndices.length}`);
			}
			const sparseData = buildSparseData(shapeMask, boundaryMask, new Uint32Array(interiorIndices), new Uint32Array(boundaryIndices), width, height);
			const startSolve = performance.now();
			const u = solvePoissonSparse(sparseData, shapeMask, boundaryMask, width, height);
			if (POISSON_CONFIG_OPTIMIZED.measurePerformance) console.log(`[Poisson Solve] Time: ${(performance.now() - startSolve).toFixed(2)}ms`);
			let maxVal = 0;
			let finalImageData;
			for (let i = 0; i < interiorIndices.length; i++) {
				const idx = interiorIndices[i];
				if (u[idx] > maxVal) maxVal = u[idx];
			}
			const tempCanvas = document.createElement("canvas");
			tempCanvas.width = width;
			tempCanvas.height = height;
			const tempCtx = tempCanvas.getContext("2d");
			const tempImg = tempCtx.createImageData(width, height);
			for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
				const idx = y * width + x;
				const px = idx * 4;
				if (!shapeMask[idx]) {
					tempImg.data[px] = 255;
					tempImg.data[px + 1] = 255;
					tempImg.data[px + 2] = 255;
					tempImg.data[px + 3] = 0;
				} else {
					let gray = 255 * (1 - u[idx] / maxVal);
					tempImg.data[px] = gray;
					tempImg.data[px + 1] = gray;
					tempImg.data[px + 2] = gray;
					tempImg.data[px + 3] = 255;
				}
			}
			tempCtx.putImageData(tempImg, 0, 0);
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "high";
			ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, originalWidth, originalHeight);
			const outImg = ctx.getImageData(0, 0, originalWidth, originalHeight);
			const origPadX = Math.ceil(originalWidth * paddingSize);
			const origPadY = Math.ceil(originalHeight * paddingSize);
			const originalCanvas = document.createElement("canvas");
			originalCanvas.width = originalWidth;
			originalCanvas.height = originalHeight;
			const originalCtx = originalCanvas.getContext("2d");
			originalCtx.drawImage(img, origPadX, origPadY, originalWidth - 2 * origPadX, originalHeight - 2 * origPadY);
			const originalData = originalCtx.getImageData(0, 0, originalWidth, originalHeight);
			for (let i = 0; i < outImg.data.length; i += 4) {
				const a = originalData.data[i + 3];
				const upscaledAlpha = outImg.data[i + 3];
				if (a === 0) {
					outImg.data[i] = 255;
					outImg.data[i + 1] = 0;
				} else {
					outImg.data[i] = upscaledAlpha === 0 ? 0 : outImg.data[i];
					outImg.data[i + 1] = a;
				}
				outImg.data[i + 2] = 255;
				outImg.data[i + 3] = 255;
			}
			ctx.putImageData(outImg, 0, 0);
			finalImageData = outImg;
			canvas.toBlob((blob) => {
				if (!blob) {
					reject(/* @__PURE__ */ new Error("Failed to create PNG blob"));
					return;
				}
				if (POISSON_CONFIG_OPTIMIZED.measurePerformance) {
					const totalTime = performance.now() - totalStartTime;
					console.log(`[Total Processing Time] ${totalTime.toFixed(2)}ms`);
					if (scaleFactor < 1) {
						const estimatedFullResTime = totalTime * Math.pow(originalWidth * originalHeight / (width * height), 1.5);
						console.log(`[Estimated time at full resolution] ~${estimatedFullResTime.toFixed(0)}ms`);
						console.log(`[Time saved] ~${(estimatedFullResTime - totalTime).toFixed(0)}ms (${Math.round(estimatedFullResTime / totalTime)}\xD7 faster)`);
					}
				}
				resolve({
					imageData: finalImageData,
					pngBlob: blob
				});
			}, "image/png");
		};
		img.onerror = () => reject(/* @__PURE__ */ new Error("Failed to load image"));
		img.src = typeof file === "string" ? file : URL.createObjectURL(file);
	});
}
function buildSparseData(shapeMask, boundaryMask, interiorPixels, boundaryPixels, width, height) {
	const pixelCount = interiorPixels.length;
	const neighborIndices = new Int32Array(pixelCount * 4);
	for (let i = 0; i < pixelCount; i++) {
		const idx = interiorPixels[i];
		const x = idx % width;
		const y = Math.floor(idx / width);
		neighborIndices[i * 4 + 0] = x < width - 1 && shapeMask[idx + 1] ? idx + 1 : -1;
		neighborIndices[i * 4 + 1] = x > 0 && shapeMask[idx - 1] ? idx - 1 : -1;
		neighborIndices[i * 4 + 2] = y > 0 && shapeMask[idx - width] ? idx - width : -1;
		neighborIndices[i * 4 + 3] = y < height - 1 && shapeMask[idx + width] ? idx + width : -1;
	}
	return {
		interiorPixels,
		boundaryPixels,
		pixelCount,
		neighborIndices
	};
}
function solvePoissonSparse(sparseData, shapeMask, boundaryMask, width, height) {
	const ITERATIONS = POISSON_CONFIG_OPTIMIZED.iterations;
	const C = .01;
	const u = new Float32Array(width * height);
	const { interiorPixels, neighborIndices, pixelCount } = sparseData;
	const startTime = performance.now();
	const omega = 1.9;
	const redPixels = [];
	const blackPixels = [];
	for (let i = 0; i < pixelCount; i++) {
		const idx = interiorPixels[i];
		if ((idx % width + Math.floor(idx / width)) % 2 === 0) redPixels.push(i);
		else blackPixels.push(i);
	}
	for (let iter = 0; iter < ITERATIONS; iter++) {
		for (const i of redPixels) {
			const idx = interiorPixels[i];
			const eastIdx = neighborIndices[i * 4 + 0];
			const westIdx = neighborIndices[i * 4 + 1];
			const northIdx = neighborIndices[i * 4 + 2];
			const southIdx = neighborIndices[i * 4 + 3];
			let sumN = 0;
			if (eastIdx >= 0) sumN += u[eastIdx];
			if (westIdx >= 0) sumN += u[westIdx];
			if (northIdx >= 0) sumN += u[northIdx];
			if (southIdx >= 0) sumN += u[southIdx];
			u[idx] = omega * ((C + sumN) / 4) + (1 - omega) * u[idx];
		}
		for (const i of blackPixels) {
			const idx = interiorPixels[i];
			const eastIdx = neighborIndices[i * 4 + 0];
			const westIdx = neighborIndices[i * 4 + 1];
			const northIdx = neighborIndices[i * 4 + 2];
			const southIdx = neighborIndices[i * 4 + 3];
			let sumN = 0;
			if (eastIdx >= 0) sumN += u[eastIdx];
			if (westIdx >= 0) sumN += u[westIdx];
			if (northIdx >= 0) sumN += u[northIdx];
			if (southIdx >= 0) sumN += u[southIdx];
			u[idx] = omega * ((C + sumN) / 4) + (1 - omega) * u[idx];
		}
	}
	const tmp = new Float32Array(width * height);
	for (let smooth = 0; smooth < 3; smooth++) {
		tmp.set(u);
		for (let i = 0; i < pixelCount; i++) {
			const idx = interiorPixels[i];
			const eastIdx = neighborIndices[i * 4 + 0];
			const westIdx = neighborIndices[i * 4 + 1];
			const northIdx = neighborIndices[i * 4 + 2];
			const southIdx = neighborIndices[i * 4 + 3];
			let sum = 0;
			let count = 0;
			if (eastIdx >= 0) {
				sum += tmp[eastIdx];
				count++;
			}
			if (westIdx >= 0) {
				sum += tmp[westIdx];
				count++;
			}
			if (northIdx >= 0) {
				sum += tmp[northIdx];
				count++;
			}
			if (southIdx >= 0) {
				sum += tmp[southIdx];
				count++;
			}
			u[idx] = count > 0 ? (tmp[idx] + sum / count) * .5 : tmp[idx];
		}
	}
	if (POISSON_CONFIG_OPTIMIZED.measurePerformance) {
		const elapsed = performance.now() - startTime;
		console.log(`[Optimized Poisson Solver (SOR \u03C9=${omega})]`);
		console.log(`  Working size: ${width}\xD7${height}`);
		console.log(`  Iterations: ${ITERATIONS}`);
		console.log(`  Time: ${elapsed.toFixed(2)}ms`);
		console.log(`  Interior pixels processed: ${pixelCount}`);
		console.log(`  Speed: ${(ITERATIONS * pixelCount / (elapsed * 1e3)).toFixed(2)} Mpixels/sec`);
	}
	return u;
}
var GemSmokeShapes = {
	none: 0,
	circle: 1,
	daisy: 2,
	diamond: 3,
	metaballs: 4
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/get-shader-color-from-string.js
function getShaderColorFromString(colorString) {
	if (Array.isArray(colorString)) {
		if (colorString.length === 4) return colorString;
		if (colorString.length === 3) return [...colorString, 1];
		return fallbackColor;
	}
	if (typeof colorString !== "string") return fallbackColor;
	let r, g, b, a = 1;
	if (colorString.startsWith("#")) [r, g, b, a] = hexToRgba(colorString);
	else if (colorString.startsWith("rgb")) [r, g, b, a] = parseRgba(colorString);
	else if (colorString.startsWith("hsl")) [r, g, b, a] = hslaToRgba(parseHsla(colorString));
	else {
		console.error("Unsupported color format", colorString);
		return fallbackColor;
	}
	return [
		clamp(r, 0, 1),
		clamp(g, 0, 1),
		clamp(b, 0, 1),
		clamp(a, 0, 1)
	];
}
function hexToRgba(hex) {
	hex = hex.replace(/^#/, "");
	if (hex.length === 3) hex = hex.split("").map((char) => char + char).join("");
	if (hex.length === 6) hex = hex + "ff";
	return [
		parseInt(hex.slice(0, 2), 16) / 255,
		parseInt(hex.slice(2, 4), 16) / 255,
		parseInt(hex.slice(4, 6), 16) / 255,
		parseInt(hex.slice(6, 8), 16) / 255
	];
}
function parseRgba(rgba) {
	const match = rgba.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+))?\s*\)$/i);
	if (!match) return [
		0,
		0,
		0,
		1
	];
	return [
		parseInt(match[1] ?? "0") / 255,
		parseInt(match[2] ?? "0") / 255,
		parseInt(match[3] ?? "0") / 255,
		match[4] === void 0 ? 1 : parseFloat(match[4])
	];
}
function parseHsla(hsla) {
	const match = hsla.match(/^hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*([0-9.]+))?\s*\)$/i);
	if (!match) return [
		0,
		0,
		0,
		1
	];
	return [
		parseInt(match[1] ?? "0"),
		parseInt(match[2] ?? "0"),
		parseInt(match[3] ?? "0"),
		match[4] === void 0 ? 1 : parseFloat(match[4])
	];
}
function hslaToRgba(hsla) {
	const [h, s, l, a] = hsla;
	const hDecimal = h / 360;
	const sDecimal = s / 100;
	const lDecimal = l / 100;
	let r, g, b;
	if (s === 0) r = g = b = lDecimal;
	else {
		const hue2rgb = (p2, q2, t) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p2 + (q2 - p2) * 6 * t;
			if (t < 1 / 2) return q2;
			if (t < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t) * 6;
			return p2;
		};
		const q = lDecimal < .5 ? lDecimal * (1 + sDecimal) : lDecimal + sDecimal - lDecimal * sDecimal;
		const p = 2 * lDecimal - q;
		r = hue2rgb(p, q, hDecimal + 1 / 3);
		g = hue2rgb(p, q, hDecimal);
		b = hue2rgb(p, q, hDecimal - 1 / 3);
	}
	return [
		r,
		g,
		b,
		a
	];
}
var clamp = (n, min, max) => Math.min(Math.max(n, min), max);
var fallbackColor = [
	0,
	0,
	0,
	1
];
//#endregion
//#region node_modules/@paper-design/shaders/dist/get-shader-noise-texture.js
function getShaderNoiseTexture() {
	if (typeof window === "undefined") return;
	const img = new Image();
	img.src = noiseSrc;
	return img;
}
var noiseSrc = "data:image/png;base64,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";
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/use-merge-refs.js
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
function useMergeRefs(refs) {
	const cleanupRef = import_react.useRef(void 0);
	const refEffect = import_react.useCallback((instance) => {
		const cleanups = refs.map((ref) => {
			if (ref == null) return;
			if (typeof ref === "function") {
				const refCallback = ref;
				const refCleanup = refCallback(instance);
				return typeof refCleanup === "function" ? refCleanup : () => {
					refCallback(null);
				};
			}
			ref.current = instance;
			return () => {
				ref.current = null;
			};
		});
		return () => {
			cleanups.forEach((refCleanup) => refCleanup?.());
		};
	}, refs);
	return import_react.useMemo(() => {
		if (refs.every((ref) => ref == null)) return null;
		return (value) => {
			if (cleanupRef.current) {
				cleanupRef.current();
				cleanupRef.current = void 0;
			}
			if (value != null) cleanupRef.current = refEffect(value);
		};
	}, refs);
}
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/set-min-image-size.js
function setMinImageSize(img) {
	if (img.naturalWidth < 1024 && img.naturalHeight < 1024) {
		if (img.naturalWidth < 1 || img.naturalHeight < 1) return;
		const aspect = img.naturalWidth / img.naturalHeight;
		img.width = Math.round(aspect > 1 ? 1024 * aspect : 1024);
		img.height = Math.round(aspect > 1 ? 1024 : 1024 / aspect);
	}
}
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shader-mount.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime(), 1);
async function processUniforms(uniformsProp) {
	const processedUniforms = {};
	const imageLoadPromises = [];
	const isValidUrl = (url) => {
		try {
			if (url.startsWith("/")) return true;
			new URL(url);
			return true;
		} catch {
			return false;
		}
	};
	const isExternalUrl = (url) => {
		try {
			if (url.startsWith("/")) return false;
			return new URL(url, window.location.origin).origin !== window.location.origin;
		} catch {
			return false;
		}
	};
	Object.entries(uniformsProp).forEach(([key, value]) => {
		if (typeof value === "string") {
			const url = value || "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
			if (!isValidUrl(url)) {
				console.warn(`Uniform "${key}" has invalid URL "${url}". Skipping image loading.`);
				return;
			}
			const imagePromise = new Promise((resolve, reject) => {
				const img = new Image();
				if (isExternalUrl(url)) img.crossOrigin = "anonymous";
				img.onload = () => {
					setMinImageSize(img);
					processedUniforms[key] = img;
					resolve();
				};
				img.onerror = () => {
					console.error(`Could not set uniforms. Failed to load image at ${url}`);
					reject();
				};
				img.src = url;
			});
			imageLoadPromises.push(imagePromise);
		} else if (value instanceof HTMLImageElement) {
			setMinImageSize(value);
			processedUniforms[key] = value;
		} else processedUniforms[key] = value;
	});
	await Promise.all(imageLoadPromises);
	return processedUniforms;
}
var ShaderMount = (0, import_react.forwardRef)(function ShaderMountImpl({ fragmentShader, uniforms: uniformsProp, webGlContextAttributes, speed = 0, frame = 0, width, height, minPixelRatio, maxPixelCount, mipmaps, style, ...divProps }, forwardedRef) {
	const [isInitialized, setIsInitialized] = (0, import_react.useState)(false);
	const divRef = (0, import_react.useRef)(null);
	const shaderMountRef = (0, import_react.useRef)(null);
	const webGlContextAttributesRef = (0, import_react.useRef)(webGlContextAttributes);
	(0, import_react.useEffect)(() => {
		const initShader = async () => {
			const uniforms = await processUniforms(uniformsProp);
			if (divRef.current && !shaderMountRef.current) {
				shaderMountRef.current = new ShaderMount$1(divRef.current, fragmentShader, uniforms, webGlContextAttributesRef.current, speed, frame, minPixelRatio, maxPixelCount, mipmaps);
				setIsInitialized(true);
			}
		};
		initShader();
		return () => {
			shaderMountRef.current?.dispose();
			shaderMountRef.current = null;
		};
	}, [fragmentShader]);
	(0, import_react.useEffect)(() => {
		let isStale = false;
		const updateUniforms = async () => {
			const uniforms = await processUniforms(uniformsProp);
			if (!isStale) shaderMountRef.current?.setUniforms(uniforms);
		};
		updateUniforms();
		return () => {
			isStale = true;
		};
	}, [uniformsProp, isInitialized]);
	(0, import_react.useEffect)(() => {
		shaderMountRef.current?.setSpeed(speed);
	}, [speed, isInitialized]);
	(0, import_react.useEffect)(() => {
		shaderMountRef.current?.setMaxPixelCount(maxPixelCount);
	}, [maxPixelCount, isInitialized]);
	(0, import_react.useEffect)(() => {
		shaderMountRef.current?.setMinPixelRatio(minPixelRatio);
	}, [minPixelRatio, isInitialized]);
	(0, import_react.useEffect)(() => {
		shaderMountRef.current?.setFrame(frame);
	}, [frame, isInitialized]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: useMergeRefs([divRef, forwardedRef]),
		style: width !== void 0 || height !== void 0 ? {
			width: typeof width === "string" && isNaN(+width) === false ? +width : width,
			height: typeof height === "string" && isNaN(+height) === false ? +height : height,
			...style
		} : style,
		...divProps
	});
});
ShaderMount.displayName = "ShaderMount";
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/color-props-are-equal.js
function colorPropsAreEqual(prevProps, nextProps) {
	for (const key in prevProps) {
		if (key === "colors") {
			const prevIsArray = Array.isArray(prevProps.colors);
			const nextIsArray = Array.isArray(nextProps.colors);
			if (!prevIsArray || !nextIsArray) {
				if (Object.is(prevProps.colors, nextProps.colors) === false) return false;
				continue;
			}
			if (prevProps.colors?.length !== nextProps.colors?.length) return false;
			if (!prevProps.colors?.every((color, index) => color === nextProps.colors?.[index])) return false;
			continue;
		}
		if (Object.is(prevProps[key], nextProps[key]) === false) return false;
	}
	return true;
}
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/mesh-gradient.js
var defaultPreset$28 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		colors: [
			"#e0eaff",
			"#241d9a",
			"#f75092",
			"#9f50d3"
		],
		distortion: .8,
		swirl: .1,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var purplePreset = {
	name: "Purple",
	params: {
		...defaultObjectSizing,
		speed: .6,
		frame: 0,
		colors: ["#aaa7d7", "#3c2b8e"],
		distortion: 1,
		swirl: 1,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var beachPreset = {
	name: "Beach",
	params: {
		...defaultObjectSizing,
		speed: .1,
		frame: 0,
		colors: [
			"#bcecf6",
			"#00aaff",
			"#00f7ff",
			"#ffd447"
		],
		distortion: .8,
		swirl: .35,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var meshGradientPresets = [
	defaultPreset$28,
	{
		name: "Ink",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colors: ["#ffffff", "#000000"],
			distortion: 1,
			swirl: .2,
			rotation: 90,
			grainMixer: 0,
			grainOverlay: 0
		}
	},
	purplePreset,
	beachPreset
];
var MeshGradient = (0, import_react.memo)(function MeshGradientImpl({ speed = defaultPreset$28.params.speed, frame = defaultPreset$28.params.frame, colors = defaultPreset$28.params.colors, distortion = defaultPreset$28.params.distortion, swirl = defaultPreset$28.params.swirl, grainMixer = defaultPreset$28.params.grainMixer, grainOverlay = defaultPreset$28.params.grainOverlay, fit = defaultPreset$28.params.fit, rotation = defaultPreset$28.params.rotation, scale = defaultPreset$28.params.scale, originX = defaultPreset$28.params.originX, originY = defaultPreset$28.params.originY, offsetX = defaultPreset$28.params.offsetX, offsetY = defaultPreset$28.params.offsetY, worldWidth = defaultPreset$28.params.worldWidth, worldHeight = defaultPreset$28.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_distortion: distortion,
		u_swirl: swirl,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: meshGradientFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/smoke-ring.js
var defaultPreset$27 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: .5,
		frame: 0,
		colorBack: "#000000",
		colors: ["#ffffff"],
		noiseScale: 3,
		noiseIterations: 8,
		radius: .25,
		thickness: .65,
		innerShape: .7,
		scale: .8
	}
};
var solarPreset$1 = {
	name: "Solar",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		colorBack: "#000000",
		colors: [
			"#ffffff",
			"#ffca0a",
			"#fc6203",
			"#fc620366"
		],
		noiseScale: 2,
		noiseIterations: 3,
		radius: .4,
		thickness: .8,
		innerShape: 4,
		scale: 2,
		offsetY: 1
	}
};
var smokeRingPresets = [
	defaultPreset$27,
	{
		name: "Line",
		params: {
			...defaultObjectSizing,
			frame: 0,
			colorBack: "#000000",
			colors: ["#4540a4", "#1fe8ff"],
			noiseScale: 1.1,
			noiseIterations: 2,
			radius: .38,
			thickness: .01,
			innerShape: .88,
			speed: 4
		}
	},
	solarPreset$1,
	{
		name: "Cloud",
		params: {
			...defaultObjectSizing,
			frame: 0,
			colorBack: "#81ADEC",
			colors: ["#ffffff"],
			noiseScale: 3,
			noiseIterations: 10,
			radius: .5,
			thickness: .65,
			innerShape: .85,
			speed: .5,
			scale: 2.5
		}
	}
];
var SmokeRing = (0, import_react.memo)(function SmokeRingImpl({ speed = defaultPreset$27.params.speed, frame = defaultPreset$27.params.frame, colorBack = defaultPreset$27.params.colorBack, colors = defaultPreset$27.params.colors, noiseScale = defaultPreset$27.params.noiseScale, thickness = defaultPreset$27.params.thickness, radius = defaultPreset$27.params.radius, innerShape = defaultPreset$27.params.innerShape, noiseIterations = defaultPreset$27.params.noiseIterations, fit = defaultPreset$27.params.fit, scale = defaultPreset$27.params.scale, rotation = defaultPreset$27.params.rotation, originX = defaultPreset$27.params.originX, originY = defaultPreset$27.params.originY, offsetX = defaultPreset$27.params.offsetX, offsetY = defaultPreset$27.params.offsetY, worldWidth = defaultPreset$27.params.worldWidth, worldHeight = defaultPreset$27.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_noiseScale: noiseScale,
		u_thickness: thickness,
		u_radius: radius,
		u_innerShape: innerShape,
		u_noiseIterations: noiseIterations,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: smokeRingFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/neuro-noise.js
var defaultPreset$26 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		speed: 1,
		frame: 0,
		colorFront: "#ffffff",
		colorMid: "#47a6ff",
		colorBack: "#000000",
		brightness: .05,
		contrast: .3
	}
};
var neuroNoisePresets = [
	defaultPreset$26,
	{
		name: "Sensation",
		params: {
			...defaultPatternSizing,
			speed: 1,
			frame: 0,
			colorFront: "#00c8ff",
			colorMid: "#fbff00",
			colorBack: "#8b42ff",
			brightness: .19,
			contrast: .12,
			scale: 3
		}
	},
	{
		name: "Bloodstream",
		params: {
			...defaultPatternSizing,
			speed: 1,
			frame: 0,
			colorFront: "#ff0000",
			colorMid: "#ff0000",
			colorBack: "#ffffff",
			brightness: .24,
			contrast: .17,
			scale: .7
		}
	},
	{
		name: "Ghost",
		params: {
			...defaultPatternSizing,
			speed: 1,
			frame: 0,
			colorFront: "#ffffff",
			colorMid: "#000000",
			colorBack: "#ffffff",
			brightness: 0,
			contrast: 1,
			scale: .55
		}
	}
];
var NeuroNoise = (0, import_react.memo)(function NeuroNoiseImpl({ speed = defaultPreset$26.params.speed, frame = defaultPreset$26.params.frame, colorFront = defaultPreset$26.params.colorFront, colorMid = defaultPreset$26.params.colorMid, colorBack = defaultPreset$26.params.colorBack, brightness = defaultPreset$26.params.brightness, contrast = defaultPreset$26.params.contrast, fit = defaultPreset$26.params.fit, scale = defaultPreset$26.params.scale, rotation = defaultPreset$26.params.rotation, originX = defaultPreset$26.params.originX, originY = defaultPreset$26.params.originY, offsetX = defaultPreset$26.params.offsetX, offsetY = defaultPreset$26.params.offsetY, worldWidth = defaultPreset$26.params.worldWidth, worldHeight = defaultPreset$26.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorFront: getShaderColorFromString(colorFront),
		u_colorMid: getShaderColorFromString(colorMid),
		u_colorBack: getShaderColorFromString(colorBack),
		u_brightness: brightness,
		u_contrast: contrast,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: neuroNoiseFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/dot-orbit.js
var defaultPreset$25 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		speed: 1.5,
		frame: 0,
		colorBack: "#000000",
		colors: [
			"#ffc96b",
			"#ff6200",
			"#ff2f00",
			"#421100",
			"#1a0000"
		],
		size: 1,
		sizeRange: 0,
		spreading: 1,
		stepsPerColor: 4
	}
};
var shinePreset = {
	name: "Shine",
	params: {
		...defaultPatternSizing,
		speed: .1,
		frame: 0,
		colors: [
			"#ffffff",
			"#006aff",
			"#fff675"
		],
		colorBack: "#000000",
		stepsPerColor: 4,
		size: .3,
		sizeRange: .2,
		spreading: 1,
		scale: .4
	}
};
var dotOrbitPresets = [
	defaultPreset$25,
	{
		name: "Bubbles",
		params: {
			...defaultPatternSizing,
			speed: .4,
			frame: 0,
			colors: ["#D0D2D5"],
			colorBack: "#989CA4",
			stepsPerColor: 2,
			size: .9,
			sizeRange: .7,
			spreading: 1,
			scale: 1.64
		}
	},
	shinePreset,
	{
		name: "Hallucinatory",
		params: {
			...defaultPatternSizing,
			speed: 5,
			frame: 0,
			colors: ["#000000"],
			colorBack: "#ffe500",
			stepsPerColor: 2,
			size: .65,
			sizeRange: 0,
			spreading: .3,
			scale: .5
		}
	}
];
var DotOrbit = (0, import_react.memo)(function DotOrbitImpl({ speed = defaultPreset$25.params.speed, frame = defaultPreset$25.params.frame, colorBack = defaultPreset$25.params.colorBack, colors = defaultPreset$25.params.colors, size = defaultPreset$25.params.size, sizeRange = defaultPreset$25.params.sizeRange, spreading = defaultPreset$25.params.spreading, stepsPerColor = defaultPreset$25.params.stepsPerColor, fit = defaultPreset$25.params.fit, scale = defaultPreset$25.params.scale, rotation = defaultPreset$25.params.rotation, originX = defaultPreset$25.params.originX, originY = defaultPreset$25.params.originY, offsetX = defaultPreset$25.params.offsetX, offsetY = defaultPreset$25.params.offsetY, worldWidth = defaultPreset$25.params.worldWidth, worldHeight = defaultPreset$25.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_size: size,
		u_sizeRange: sizeRange,
		u_spreading: spreading,
		u_stepsPerColor: stepsPerColor,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: dotOrbitFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/dot-grid.js
var defaultPreset$24 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		colorBack: "#000000",
		colorFill: "#ffffff",
		colorStroke: "#ffaa00",
		size: 2,
		gapX: 32,
		gapY: 32,
		strokeWidth: 0,
		sizeRange: 0,
		opacityRange: 0,
		shape: "circle"
	}
};
var dotGridPresets = [
	defaultPreset$24,
	{
		name: "Triangles",
		params: {
			...defaultPatternSizing,
			colorBack: "#ffffff",
			colorFill: "#ffffff",
			colorStroke: "#808080",
			size: 5,
			gapX: 32,
			gapY: 32,
			strokeWidth: 1,
			sizeRange: 0,
			opacityRange: 0,
			shape: "triangle"
		}
	},
	{
		name: "Tree line",
		params: {
			...defaultPatternSizing,
			colorBack: "#f4fce7",
			colorFill: "#052e19",
			colorStroke: "#000000",
			size: 8,
			gapX: 20,
			gapY: 90,
			strokeWidth: 0,
			sizeRange: 1,
			opacityRange: .6,
			shape: "circle"
		}
	},
	{
		name: "Wallpaper",
		params: {
			...defaultPatternSizing,
			colorBack: "#204030",
			colorFill: "#000000",
			colorStroke: "#bd955b",
			size: 9,
			gapX: 32,
			gapY: 32,
			strokeWidth: 1,
			sizeRange: 0,
			opacityRange: 0,
			shape: "diamond"
		}
	}
];
var DotGrid = (0, import_react.memo)(function DotGridImpl({ colorBack = defaultPreset$24.params.colorBack, colorFill = defaultPreset$24.params.colorFill, colorStroke = defaultPreset$24.params.colorStroke, size = defaultPreset$24.params.size, gapX = defaultPreset$24.params.gapX, gapY = defaultPreset$24.params.gapY, strokeWidth = defaultPreset$24.params.strokeWidth, sizeRange = defaultPreset$24.params.sizeRange, opacityRange = defaultPreset$24.params.opacityRange, shape = defaultPreset$24.params.shape, fit = defaultPreset$24.params.fit, scale = defaultPreset$24.params.scale, rotation = defaultPreset$24.params.rotation, originX = defaultPreset$24.params.originX, originY = defaultPreset$24.params.originY, offsetX = defaultPreset$24.params.offsetX, offsetY = defaultPreset$24.params.offsetY, worldWidth = defaultPreset$24.params.worldWidth, worldHeight = defaultPreset$24.params.worldHeight, maxPixelCount = 6016 * 3384, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorFill: getShaderColorFromString(colorFill),
		u_colorStroke: getShaderColorFromString(colorStroke),
		u_dotSize: size,
		u_gapX: gapX,
		u_gapY: gapY,
		u_strokeWidth: strokeWidth,
		u_sizeRange: sizeRange,
		u_opacityRange: opacityRange,
		u_shape: DotGridShapes[shape],
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		maxPixelCount,
		fragmentShader: dotGridFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/simplex-noise.js
var defaultPreset$23 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		scale: .6,
		speed: .5,
		frame: 0,
		colors: [
			"#4449CF",
			"#FFD1E0",
			"#F94446",
			"#FFD36B",
			"#FFFFFF"
		],
		stepsPerColor: 2,
		softness: 0
	}
};
var bubblegumPreset = {
	name: "Bubblegum",
	params: {
		...defaultPatternSizing,
		speed: 2,
		frame: 0,
		colors: [
			"#ffffff",
			"#ff9e9e",
			"#5f57ff",
			"#00f7ff"
		],
		stepsPerColor: 1,
		softness: 1,
		scale: 1.6
	}
};
var simplexNoisePresets = [
	defaultPreset$23,
	{
		name: "Spots",
		params: {
			...defaultPatternSizing,
			speed: .6,
			frame: 0,
			colors: [
				"#ff7b00",
				"#f9ffeb",
				"#320d82"
			],
			stepsPerColor: 1,
			softness: 0,
			scale: 1
		}
	},
	{
		name: "First contact",
		params: {
			...defaultPatternSizing,
			speed: 2,
			frame: 0,
			colors: [
				"#e8cce6",
				"#120d22",
				"#442c44",
				"#e6baba",
				"#fff5f5"
			],
			stepsPerColor: 2,
			softness: 0,
			scale: .2
		}
	},
	bubblegumPreset
];
var SimplexNoise = (0, import_react.memo)(function SimplexNoiseImpl({ speed = defaultPreset$23.params.speed, frame = defaultPreset$23.params.frame, colors = defaultPreset$23.params.colors, stepsPerColor = defaultPreset$23.params.stepsPerColor, softness = defaultPreset$23.params.softness, fit = defaultPreset$23.params.fit, scale = defaultPreset$23.params.scale, rotation = defaultPreset$23.params.rotation, originX = defaultPreset$23.params.originX, originY = defaultPreset$23.params.originY, offsetX = defaultPreset$23.params.offsetX, offsetY = defaultPreset$23.params.offsetY, worldWidth = defaultPreset$23.params.worldWidth, worldHeight = defaultPreset$23.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_stepsPerColor: stepsPerColor,
		u_softness: softness,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: simplexNoiseFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/metaballs.js
var defaultPreset$22 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: 1,
		speed: 1,
		frame: 0,
		colorBack: "#000000",
		colors: [
			"#6e33cc",
			"#ff5500",
			"#ffc105",
			"#ffc800",
			"#f585ff"
		],
		count: 10,
		size: .83
	}
};
var inkDropsPreset = {
	name: "Ink Drops",
	params: {
		...defaultObjectSizing,
		scale: 1,
		speed: 2,
		frame: 0,
		colorBack: "#ffffff00",
		colors: ["#000000"],
		count: 18,
		size: .1
	}
};
var backgroundPreset = {
	name: "Background",
	params: {
		...defaultObjectSizing,
		speed: .5,
		frame: 0,
		colors: [
			"#ae00ff",
			"#00ff95",
			"#ffc105"
		],
		colorBack: "#2a273f",
		count: 13,
		size: .81,
		scale: 4,
		rotation: 0,
		offsetX: -.3
	}
};
var metaballsPresets = [
	defaultPreset$22,
	inkDropsPreset,
	{
		name: "Solar",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colors: [
				"#ffc800",
				"#ff5500",
				"#ffc105"
			],
			colorBack: "#102f84",
			count: 7,
			size: .75,
			scale: 1
		}
	},
	backgroundPreset
];
var Metaballs = (0, import_react.memo)(function MetaballsImpl({ speed = defaultPreset$22.params.speed, frame = defaultPreset$22.params.frame, colorBack = defaultPreset$22.params.colorBack, colors = defaultPreset$22.params.colors, size = defaultPreset$22.params.size, count = defaultPreset$22.params.count, fit = defaultPreset$22.params.fit, rotation = defaultPreset$22.params.rotation, scale = defaultPreset$22.params.scale, originX = defaultPreset$22.params.originX, originY = defaultPreset$22.params.originY, offsetX = defaultPreset$22.params.offsetX, offsetY = defaultPreset$22.params.offsetY, worldWidth = defaultPreset$22.params.worldWidth, worldHeight = defaultPreset$22.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_size: size,
		u_count: count,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: metaballsFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/waves.js
var defaultPreset$21 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		scale: .6,
		colorFront: "#ffbb00",
		colorBack: "#000000",
		shape: 0,
		frequency: .5,
		amplitude: .5,
		spacing: 1.2,
		proportion: .1,
		softness: 0
	}
};
var wavesPresets = [
	defaultPreset$21,
	{
		name: "Groovy",
		params: {
			...defaultPatternSizing,
			scale: 5,
			rotation: 90,
			colorFront: "#fcfcee",
			colorBack: "#ff896b",
			shape: 3,
			frequency: .2,
			amplitude: .25,
			spacing: 1.17,
			proportion: .57,
			softness: 0
		}
	},
	{
		name: "Tangled up",
		params: {
			...defaultPatternSizing,
			scale: .5,
			rotation: 0,
			colorFront: "#133a41",
			colorBack: "#c2d8b6",
			shape: 2.07,
			frequency: .44,
			amplitude: .57,
			spacing: 1.05,
			proportion: .75,
			softness: 0
		}
	},
	{
		name: "Ride the wave",
		params: {
			...defaultPatternSizing,
			scale: 1.7,
			rotation: 0,
			colorFront: "#fdffe6",
			colorBack: "#1f1f1f",
			shape: 2.25,
			frequency: .2,
			amplitude: 1,
			spacing: 1.25,
			proportion: 1,
			softness: 0
		}
	}
];
var Waves = (0, import_react.memo)(function WavesImpl({ colorFront = defaultPreset$21.params.colorFront, colorBack = defaultPreset$21.params.colorBack, shape = defaultPreset$21.params.shape, frequency = defaultPreset$21.params.frequency, amplitude = defaultPreset$21.params.amplitude, spacing = defaultPreset$21.params.spacing, proportion = defaultPreset$21.params.proportion, softness = defaultPreset$21.params.softness, fit = defaultPreset$21.params.fit, scale = defaultPreset$21.params.scale, rotation = defaultPreset$21.params.rotation, offsetX = defaultPreset$21.params.offsetX, offsetY = defaultPreset$21.params.offsetY, originX = defaultPreset$21.params.originX, originY = defaultPreset$21.params.originY, worldWidth = defaultPreset$21.params.worldWidth, worldHeight = defaultPreset$21.params.worldHeight, maxPixelCount = 6016 * 3384, ...props }) {
	const uniforms = {
		u_colorFront: getShaderColorFromString(colorFront),
		u_colorBack: getShaderColorFromString(colorBack),
		u_shape: shape,
		u_frequency: frequency,
		u_amplitude: amplitude,
		u_spacing: spacing,
		u_proportion: proportion,
		u_softness: softness,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		fragmentShader: wavesFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/perlin-noise.js
var defaultPreset$20 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		speed: .5,
		frame: 0,
		colorBack: "#632ad5",
		colorFront: "#fccff7",
		proportion: .35,
		softness: .1,
		octaveCount: 1,
		persistence: 1,
		lacunarity: 1.5
	}
};
var perlinNoisePresets = [
	defaultPreset$20,
	{
		name: "Nintendo Water",
		params: {
			...defaultPatternSizing,
			scale: 1 / .2,
			speed: .4,
			frame: 0,
			colorBack: "#2d69d4",
			colorFront: "#d1eefc",
			proportion: .42,
			softness: 0,
			octaveCount: 2,
			persistence: .55,
			lacunarity: 1.8
		}
	},
	{
		name: "Moss",
		params: {
			...defaultPatternSizing,
			scale: 1 / .15,
			speed: .02,
			frame: 0,
			colorBack: "#05ff4a",
			colorFront: "#262626",
			proportion: .65,
			softness: .35,
			octaveCount: 6,
			persistence: 1,
			lacunarity: 2.55
		}
	},
	{
		name: "Worms",
		params: {
			...defaultPatternSizing,
			scale: .9,
			speed: 0,
			frame: 0,
			colorBack: "#ffffff00",
			colorFront: "#595959",
			proportion: .5,
			softness: 0,
			octaveCount: 1,
			persistence: 1,
			lacunarity: 1.5
		}
	}
];
var PerlinNoise = (0, import_react.memo)(function PerlinNoiseImpl({ speed = defaultPreset$20.params.speed, frame = defaultPreset$20.params.frame, colorFront = defaultPreset$20.params.colorFront, colorBack = defaultPreset$20.params.colorBack, proportion = defaultPreset$20.params.proportion, softness = defaultPreset$20.params.softness, octaveCount = defaultPreset$20.params.octaveCount, persistence = defaultPreset$20.params.persistence, lacunarity, fit = defaultPreset$20.params.fit, worldWidth = defaultPreset$20.params.worldWidth, worldHeight = defaultPreset$20.params.worldHeight, scale = defaultPreset$20.params.scale, rotation = defaultPreset$20.params.rotation, originX = defaultPreset$20.params.originX, originY = defaultPreset$20.params.originY, offsetX = defaultPreset$20.params.offsetX, offsetY = defaultPreset$20.params.offsetY, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorFront: getShaderColorFromString(colorFront),
		u_proportion: proportion,
		u_softness: softness ?? defaultPreset$20.params.softness,
		u_octaveCount: octaveCount ?? defaultPreset$20.params.octaveCount,
		u_persistence: persistence ?? defaultPreset$20.params.persistence,
		u_lacunarity: lacunarity ?? defaultPreset$20.params.lacunarity,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: perlinNoiseFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/voronoi.js
var defaultPreset$19 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		speed: .5,
		frame: 0,
		colors: ["#ff8247", "#ffe53d"],
		stepsPerColor: 3,
		colorGlow: "#ffffff",
		colorGap: "#2e0000",
		distortion: .4,
		gap: .04,
		glow: 0,
		scale: .5
	}
};
var cellsPreset = {
	name: "Cells",
	params: {
		...defaultPatternSizing,
		scale: .5,
		speed: .5,
		frame: 0,
		colors: ["#ffffff"],
		stepsPerColor: 1,
		colorGlow: "#ffffff",
		colorGap: "#000000",
		distortion: .5,
		gap: .03,
		glow: .8
	}
};
var bubblesPreset = {
	name: "Bubbles",
	params: {
		...defaultPatternSizing,
		scale: .75,
		speed: .5,
		frame: 0,
		colors: ["#83c9fb"],
		stepsPerColor: 1,
		colorGlow: "#ffffff",
		colorGap: "#ffffff",
		distortion: .4,
		gap: 0,
		glow: 1
	}
};
var voronoiPresets = [
	defaultPreset$19,
	{
		name: "Lights",
		params: {
			...defaultPatternSizing,
			scale: 3.3,
			speed: .5,
			frame: 0,
			colors: [
				"#fffffffc",
				"#bbff00",
				"#00ffff"
			],
			colorGlow: "#ff00d0",
			colorGap: "#ff00d0",
			stepsPerColor: 2,
			distortion: .38,
			gap: 0,
			glow: 1
		}
	},
	cellsPreset,
	bubblesPreset
];
var Voronoi = (0, import_react.memo)(function VoronoiImpl({ speed = defaultPreset$19.params.speed, frame = defaultPreset$19.params.frame, colors = defaultPreset$19.params.colors, stepsPerColor = defaultPreset$19.params.stepsPerColor, colorGlow = defaultPreset$19.params.colorGlow, colorGap = defaultPreset$19.params.colorGap, distortion = defaultPreset$19.params.distortion, gap = defaultPreset$19.params.gap, glow = defaultPreset$19.params.glow, fit = defaultPreset$19.params.fit, scale = defaultPreset$19.params.scale, rotation = defaultPreset$19.params.rotation, originX = defaultPreset$19.params.originX, originY = defaultPreset$19.params.originY, offsetX = defaultPreset$19.params.offsetX, offsetY = defaultPreset$19.params.offsetY, worldWidth = defaultPreset$19.params.worldWidth, worldHeight = defaultPreset$19.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_stepsPerColor: stepsPerColor,
		u_colorGlow: getShaderColorFromString(colorGlow),
		u_colorGap: getShaderColorFromString(colorGap),
		u_distortion: distortion,
		u_gap: gap,
		u_glow: glow,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: voronoiFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/warp.js
var defaultPreset$18 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		rotation: 0,
		speed: 1,
		frame: 0,
		colors: [
			"#121212",
			"#9470ff",
			"#121212",
			"#8838ff"
		],
		proportion: .45,
		softness: 1,
		distortion: .25,
		swirl: .8,
		swirlIterations: 10,
		shapeScale: .1,
		shape: "checks"
	}
};
var warpPresets = [
	defaultPreset$18,
	{
		name: "Cauldron Pot",
		params: {
			...defaultPatternSizing,
			scale: .9,
			rotation: 160,
			speed: 10,
			frame: 0,
			colors: [
				"#a7e58b",
				"#324472",
				"#0a180d"
			],
			proportion: .64,
			softness: 1.5,
			distortion: .2,
			swirl: .86,
			swirlIterations: 7,
			shapeScale: .6,
			shape: "edge"
		}
	},
	{
		name: "Live Ink",
		params: {
			...defaultPatternSizing,
			scale: 1.2,
			rotation: 44,
			offsetY: -.3,
			speed: 2.5,
			frame: 0,
			colors: [
				"#111314",
				"#9faeab",
				"#f3fee7",
				"#f3fee7"
			],
			proportion: .05,
			softness: 0,
			distortion: .25,
			swirl: .8,
			swirlIterations: 10,
			shapeScale: .28,
			shape: "checks"
		}
	},
	{
		name: "Kelp",
		params: {
			...defaultPatternSizing,
			scale: .8,
			rotation: 50,
			speed: 20,
			frame: 0,
			colors: [
				"#dbff8f",
				"#404f3e",
				"#091316"
			],
			proportion: .67,
			softness: 0,
			distortion: 0,
			swirl: .2,
			swirlIterations: 3,
			shapeScale: 1,
			shape: "stripes"
		}
	},
	{
		name: "Nectar",
		params: {
			...defaultPatternSizing,
			scale: 2,
			offsetY: .6,
			rotation: 0,
			speed: 4.2,
			frame: 0,
			colors: [
				"#151310",
				"#d3a86b",
				"#f0edea"
			],
			proportion: .24,
			softness: 1,
			distortion: .21,
			swirl: .57,
			swirlIterations: 10,
			shapeScale: .75,
			shape: "edge"
		}
	},
	{
		name: "Passion",
		params: {
			...defaultPatternSizing,
			scale: 2.5,
			rotation: 1.35,
			speed: 3,
			frame: 0,
			colors: [
				"#3b1515",
				"#954751",
				"#ffc085"
			],
			proportion: .5,
			softness: 1,
			distortion: .09,
			swirl: .9,
			swirlIterations: 6,
			shapeScale: .25,
			shape: "checks"
		}
	}
];
var Warp = (0, import_react.memo)(function WarpImpl({ speed = defaultPreset$18.params.speed, frame = defaultPreset$18.params.frame, colors = defaultPreset$18.params.colors, proportion = defaultPreset$18.params.proportion, softness = defaultPreset$18.params.softness, distortion = defaultPreset$18.params.distortion, swirl = defaultPreset$18.params.swirl, swirlIterations = defaultPreset$18.params.swirlIterations, shapeScale = defaultPreset$18.params.shapeScale, shape = defaultPreset$18.params.shape, fit = defaultPreset$18.params.fit, scale = defaultPreset$18.params.scale, rotation = defaultPreset$18.params.rotation, originX = defaultPreset$18.params.originX, originY = defaultPreset$18.params.originY, offsetX = defaultPreset$18.params.offsetX, offsetY = defaultPreset$18.params.offsetY, worldWidth = defaultPreset$18.params.worldWidth, worldHeight = defaultPreset$18.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_proportion: proportion,
		u_softness: softness,
		u_distortion: distortion,
		u_swirl: swirl,
		u_swirlIterations: swirlIterations,
		u_shapeScale: shapeScale,
		u_shape: WarpPatterns[shape],
		u_noiseTexture: getShaderNoiseTexture(),
		u_scale: scale,
		u_rotation: rotation,
		u_fit: ShaderFitOptions[fit],
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: warpFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/god-rays.js
var defaultPreset$17 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		offsetX: 0,
		offsetY: -.55,
		colorBack: "#000000",
		colorBloom: "#0000ff",
		colors: [
			"#a600ff6e",
			"#6200fff0",
			"#ffffff",
			"#33fff5"
		],
		density: .3,
		spotty: .3,
		midIntensity: .4,
		midSize: .2,
		intensity: .8,
		bloom: .4,
		speed: .75,
		frame: 0
	}
};
var godRaysPresets = [
	defaultPreset$17,
	{
		name: "Warp",
		params: {
			...defaultObjectSizing,
			colorBack: "#000000",
			colorBloom: "#222288",
			colors: [
				"#ff47d4",
				"#ff8c00",
				"#ffffff"
			],
			density: .45,
			spotty: .15,
			midIntensity: .4,
			midSize: .33,
			intensity: .79,
			bloom: .4,
			speed: 2,
			frame: 0
		}
	},
	{
		name: "Linear",
		params: {
			...defaultObjectSizing,
			offsetX: .2,
			offsetY: -.8,
			colorBack: "#000000",
			colorBloom: "#eeeeee",
			colors: [
				"#ffffff1f",
				"#ffffff3d",
				"#ffffff29"
			],
			density: .41,
			spotty: .25,
			midSize: .1,
			midIntensity: .75,
			intensity: .79,
			bloom: 1,
			speed: .5,
			frame: 0
		}
	},
	{
		name: "Ether",
		params: {
			...defaultObjectSizing,
			offsetX: -.6,
			colorBack: "#090f1d",
			colorBloom: "#ffffff",
			colors: [
				"#148effa6",
				"#c4dffebe",
				"#232a47"
			],
			density: .03,
			spotty: .77,
			midSize: .1,
			midIntensity: .6,
			intensity: .6,
			bloom: .6,
			speed: 1,
			frame: 0
		}
	}
];
var GodRays = (0, import_react.memo)(function GodRaysImpl({ speed = defaultPreset$17.params.speed, frame = defaultPreset$17.params.frame, colorBloom = defaultPreset$17.params.colorBloom, colorBack = defaultPreset$17.params.colorBack, colors = defaultPreset$17.params.colors, density = defaultPreset$17.params.density, spotty = defaultPreset$17.params.spotty, midIntensity = defaultPreset$17.params.midIntensity, midSize = defaultPreset$17.params.midSize, intensity = defaultPreset$17.params.intensity, bloom = defaultPreset$17.params.bloom, fit = defaultPreset$17.params.fit, scale = defaultPreset$17.params.scale, rotation = defaultPreset$17.params.rotation, originX = defaultPreset$17.params.originX, originY = defaultPreset$17.params.originY, offsetX = defaultPreset$17.params.offsetX, offsetY = defaultPreset$17.params.offsetY, worldWidth = defaultPreset$17.params.worldWidth, worldHeight = defaultPreset$17.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBloom: getShaderColorFromString(colorBloom),
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_density: density,
		u_spotty: spotty,
		u_midIntensity: midIntensity,
		u_midSize: midSize,
		u_intensity: intensity,
		u_bloom: bloom,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: godRaysFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/spiral.js
var defaultPreset$16 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		scale: 1,
		colorBack: "#001429",
		colorFront: "#79D1FF",
		density: 1,
		distortion: 0,
		strokeWidth: .5,
		strokeTaper: 0,
		strokeCap: 0,
		noise: 0,
		noiseFrequency: 0,
		softness: 0,
		speed: 1,
		frame: 0
	}
};
var dropletPreset = {
	name: "Droplet",
	params: {
		...defaultPatternSizing,
		colorBack: "#effafe",
		colorFront: "#bf40a0",
		density: .9,
		distortion: 0,
		strokeWidth: .75,
		strokeTaper: .18,
		strokeCap: 1,
		noise: .74,
		noiseFrequency: .33,
		softness: .02,
		speed: 1,
		frame: 0
	}
};
var spiralPresets = [
	defaultPreset$16,
	{
		name: "Jungle",
		params: {
			...defaultPatternSizing,
			scale: 1.3,
			density: .5,
			colorBack: "#a0ef2a",
			colorFront: "#288b18",
			distortion: 0,
			strokeWidth: .5,
			strokeTaper: 0,
			strokeCap: 0,
			noise: 1,
			noiseFrequency: .25,
			softness: 0,
			speed: .75,
			frame: 0
		}
	},
	dropletPreset,
	{
		name: "Swirl",
		params: {
			...defaultPatternSizing,
			scale: .45,
			colorBack: "#b3e6d9",
			colorFront: "#1a2b4d",
			density: .2,
			distortion: 0,
			strokeWidth: .5,
			strokeTaper: 0,
			strokeCap: 0,
			noise: 0,
			noiseFrequency: .3,
			softness: .5,
			speed: 1,
			frame: 0
		}
	}
];
var Spiral = (0, import_react.memo)(function SpiralImpl({ speed = defaultPreset$16.params.speed, frame = defaultPreset$16.params.frame, colorBack = defaultPreset$16.params.colorBack, colorFront = defaultPreset$16.params.colorFront, density = defaultPreset$16.params.density, distortion = defaultPreset$16.params.distortion, strokeWidth = defaultPreset$16.params.strokeWidth, strokeTaper = defaultPreset$16.params.strokeTaper, strokeCap = defaultPreset$16.params.strokeCap, noiseFrequency = defaultPreset$16.params.noiseFrequency, noise = defaultPreset$16.params.noise, softness = defaultPreset$16.params.softness, fit = defaultPreset$16.params.fit, rotation = defaultPreset$16.params.rotation, scale = defaultPreset$16.params.scale, originX = defaultPreset$16.params.originX, originY = defaultPreset$16.params.originY, offsetX = defaultPreset$16.params.offsetX, offsetY = defaultPreset$16.params.offsetY, worldWidth = defaultPreset$16.params.worldWidth, worldHeight = defaultPreset$16.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorFront: getShaderColorFromString(colorFront),
		u_density: density,
		u_distortion: distortion,
		u_strokeWidth: strokeWidth,
		u_strokeTaper: strokeTaper,
		u_strokeCap: strokeCap,
		u_noiseFrequency: noiseFrequency,
		u_noise: noise,
		u_softness: softness,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: spiralFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/swirl.js
var defaultPreset$15 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: .32,
		frame: 0,
		colorBack: "#330000",
		colors: [
			"#ffd1d1",
			"#ff8a8a",
			"#660000"
		],
		bandCount: 4,
		twist: .1,
		center: .2,
		proportion: .5,
		softness: 0,
		noiseFrequency: .4,
		noise: .2
	}
};
var openingPreset$1 = {
	name: "Opening",
	params: {
		...defaultObjectSizing,
		offsetX: -.4,
		offsetY: 1,
		speed: .5,
		frame: 0,
		colorBack: "#ff8b61",
		colors: [
			"#fefff0",
			"#ffd8bd",
			"#ff8b61"
		],
		bandCount: 2,
		twist: .3,
		center: .2,
		proportion: .5,
		softness: 0,
		noiseFrequency: 0,
		noise: 0,
		scale: 1
	}
};
var swirlPresets = [
	defaultPreset$15,
	{
		name: "007",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colorBack: "#E9E7DA",
			colors: ["#000000"],
			bandCount: 5,
			twist: .3,
			center: 0,
			proportion: 0,
			softness: 0,
			noiseFrequency: .5,
			noise: 0
		}
	},
	openingPreset$1,
	{
		name: "Candy",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colorBack: "#ffcd66",
			colors: [
				"#6bbceb",
				"#d7b3ff",
				"#ff9fff"
			],
			bandCount: 2,
			twist: .15,
			center: .2,
			proportion: .5,
			softness: 1,
			noiseFrequency: .5,
			noise: 0
		}
	}
];
var Swirl = (0, import_react.memo)(function SwirlImpl({ speed = defaultPreset$15.params.speed, frame = defaultPreset$15.params.frame, colorBack = defaultPreset$15.params.colorBack, colors = defaultPreset$15.params.colors, bandCount = defaultPreset$15.params.bandCount, twist = defaultPreset$15.params.twist, center = defaultPreset$15.params.center, proportion = defaultPreset$15.params.proportion, softness = defaultPreset$15.params.softness, noiseFrequency = defaultPreset$15.params.noiseFrequency, noise = defaultPreset$15.params.noise, fit = defaultPreset$15.params.fit, rotation = defaultPreset$15.params.rotation, scale = defaultPreset$15.params.scale, originX = defaultPreset$15.params.originX, originY = defaultPreset$15.params.originY, offsetX = defaultPreset$15.params.offsetX, offsetY = defaultPreset$15.params.offsetY, worldWidth = defaultPreset$15.params.worldWidth, worldHeight = defaultPreset$15.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_bandCount: bandCount,
		u_twist: twist,
		u_center: center,
		u_proportion: proportion,
		u_softness: softness,
		u_noiseFrequency: noiseFrequency,
		u_noise: noise,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: swirlFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/dithering.js
var defaultPreset$14 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		speed: 1,
		frame: 0,
		scale: .6,
		colorBack: "#000000",
		colorFront: "#00b2ff",
		shape: "sphere",
		type: "4x4",
		size: 2
	}
};
var sinePreset = {
	name: "Sine Wave",
	params: {
		...defaultPatternSizing,
		speed: 1,
		frame: 0,
		colorBack: "#730d54",
		colorFront: "#00becc",
		shape: "wave",
		type: "4x4",
		size: 11,
		scale: 1.2
	}
};
var bugsPreset = {
	name: "Bugs",
	params: {
		...defaultPatternSizing,
		speed: 1,
		frame: 0,
		colorBack: "#000000",
		colorFront: "#008000",
		shape: "dots",
		type: "random",
		size: 9
	}
};
var ripplePreset$1 = {
	name: "Ripple",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		colorBack: "#603520",
		colorFront: "#c67953",
		shape: "ripple",
		type: "2x2",
		size: 3
	}
};
var swirlPreset = {
	name: "Swirl",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		colorBack: "#00000000",
		colorFront: "#47a8e1",
		shape: "swirl",
		type: "8x8",
		size: 2
	}
};
var ditheringPresets = [
	defaultPreset$14,
	{
		name: "Warp",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colorBack: "#301c2a",
			colorFront: "#56ae6c",
			shape: "warp",
			type: "4x4",
			size: 2.5
		}
	},
	sinePreset,
	ripplePreset$1,
	bugsPreset,
	swirlPreset
];
var Dithering = (0, import_react.memo)(function DitheringImpl({ speed = defaultPreset$14.params.speed, frame = defaultPreset$14.params.frame, colorBack = defaultPreset$14.params.colorBack, colorFront = defaultPreset$14.params.colorFront, shape = defaultPreset$14.params.shape, type = defaultPreset$14.params.type, pxSize, size = pxSize === void 0 ? defaultPreset$14.params.size : pxSize, fit = defaultPreset$14.params.fit, scale = defaultPreset$14.params.scale, rotation = defaultPreset$14.params.rotation, originX = defaultPreset$14.params.originX, originY = defaultPreset$14.params.originY, offsetX = defaultPreset$14.params.offsetX, offsetY = defaultPreset$14.params.offsetY, worldWidth = defaultPreset$14.params.worldWidth, worldHeight = defaultPreset$14.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorFront: getShaderColorFromString(colorFront),
		u_shape: DitheringShapes[shape],
		u_type: DitheringTypes[type],
		u_pxSize: size,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: ditheringFragmentShader,
		uniforms
	});
});
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/grain-gradient.js
var defaultPreset$13 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		colorBack: "#000000",
		colors: [
			"#7300ff",
			"#eba8ff",
			"#00bfff",
			"#2a00ff"
		],
		softness: .5,
		intensity: .5,
		noise: .25,
		shape: "corners"
	}
};
var grainGradientPresets = [
	defaultPreset$13,
	{
		name: "Wave",
		params: {
			...defaultPatternSizing,
			speed: 1,
			frame: 0,
			colorBack: "#000a0f",
			colors: [
				"#c4730b",
				"#bdad5f",
				"#d8ccc7"
			],
			softness: .7,
			intensity: .15,
			noise: .5,
			shape: "wave"
		}
	},
	{
		name: "Dots",
		params: {
			...defaultPatternSizing,
			scale: .6,
			speed: 1,
			frame: 0,
			colorBack: "#0a0000",
			colors: [
				"#6f0000",
				"#0080ff",
				"#f2ebc9",
				"#33cc33"
			],
			softness: 1,
			intensity: 1,
			noise: .7,
			shape: "dots"
		}
	},
	{
		name: "Truchet",
		params: {
			...defaultPatternSizing,
			speed: 1,
			frame: 0,
			colorBack: "#0a0000",
			colors: [
				"#6f2200",
				"#eabb7c",
				"#39b523"
			],
			softness: 0,
			intensity: .2,
			noise: 1,
			shape: "truchet"
		}
	},
	{
		name: "Ripple",
		params: {
			...defaultObjectSizing,
			scale: .5,
			speed: 1,
			frame: 0,
			colorBack: "#140a00",
			colors: [
				"#6f2d00",
				"#88ddae",
				"#2c0b1d"
			],
			softness: .5,
			intensity: .5,
			noise: .5,
			shape: "ripple"
		}
	},
	{
		name: "Blob",
		params: {
			...defaultObjectSizing,
			scale: 1.3,
			speed: 1,
			frame: 0,
			colorBack: "#0f0e18",
			colors: [
				"#3e6172",
				"#a49b74",
				"#568c50"
			],
			softness: 0,
			intensity: .15,
			noise: .5,
			shape: "blob"
		}
	}
];
var GrainGradient = (0, import_react.memo)(function GrainGradientImpl({ speed = defaultPreset$13.params.speed, frame = defaultPreset$13.params.frame, colorBack = defaultPreset$13.params.colorBack, colors = defaultPreset$13.params.colors, softness = defaultPreset$13.params.softness, intensity = defaultPreset$13.params.intensity, noise = defaultPreset$13.params.noise, shape = defaultPreset$13.params.shape, fit = defaultPreset$13.params.fit, scale = defaultPreset$13.params.scale, rotation = defaultPreset$13.params.rotation, originX = defaultPreset$13.params.originX, originY = defaultPreset$13.params.originY, offsetX = defaultPreset$13.params.offsetX, offsetY = defaultPreset$13.params.offsetY, worldWidth = defaultPreset$13.params.worldWidth, worldHeight = defaultPreset$13.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_softness: softness,
		u_intensity: intensity,
		u_noise: noise,
		u_shape: GrainGradientShapes[shape],
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: grainGradientFragmentShader,
		uniforms
	});
});
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/pulsing-border.js
var defaultPreset$12 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		scale: .6,
		colorBack: "#000000",
		colors: [
			"#0dc1fd",
			"#d915ef",
			"#ff3f2ecc"
		],
		roundness: .25,
		thickness: .1,
		margin: 0,
		marginLeft: 0,
		marginRight: 0,
		marginTop: 0,
		marginBottom: 0,
		aspectRatio: "auto",
		softness: .75,
		intensity: .2,
		bloom: .25,
		spots: 5,
		spotSize: .5,
		pulse: .25,
		smoke: .3,
		smokeSize: .6
	}
};
var pulsingBorderPresets = [
	defaultPreset$12,
	{
		name: "Circle",
		params: {
			...defaultObjectSizing,
			aspectRatio: "square",
			scale: .6,
			speed: 1,
			frame: 0,
			colorBack: "#000000",
			colors: [
				"#0dc1fd",
				"#d915ef",
				"#ff3f2ecc"
			],
			roundness: 1,
			margin: 0,
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
			thickness: 0,
			softness: .75,
			intensity: .2,
			bloom: .45,
			spots: 3,
			spotSize: .4,
			pulse: .5,
			smoke: 1,
			smokeSize: 0
		}
	},
	{
		name: "Northern lights",
		params: {
			...defaultObjectSizing,
			speed: .18,
			scale: 1.1,
			frame: 0,
			colors: [
				"#4c4794",
				"#774a7d",
				"#12694a",
				"#0aff78",
				"#4733cc"
			],
			colorBack: "#0c182c",
			roundness: 0,
			thickness: 1,
			softness: 1,
			margin: 0,
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
			aspectRatio: "auto",
			intensity: .1,
			bloom: .2,
			spots: 4,
			spotSize: .25,
			pulse: 0,
			smoke: .32,
			smokeSize: .5
		}
	},
	{
		name: "Solid line",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colors: ["#81ADEC"],
			colorBack: "#00000000",
			roundness: 0,
			thickness: .05,
			margin: 0,
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
			aspectRatio: "auto",
			softness: 0,
			intensity: 0,
			bloom: .15,
			spots: 4,
			spotSize: 1,
			pulse: 0,
			smoke: 0,
			smokeSize: 0
		}
	}
];
var PulsingBorder = (0, import_react.memo)(function PulsingBorderImpl({ speed = defaultPreset$12.params.speed, frame = defaultPreset$12.params.frame, colors = defaultPreset$12.params.colors, colorBack = defaultPreset$12.params.colorBack, roundness = defaultPreset$12.params.roundness, thickness = defaultPreset$12.params.thickness, aspectRatio = defaultPreset$12.params.aspectRatio, softness = defaultPreset$12.params.softness, bloom = defaultPreset$12.params.bloom, intensity = defaultPreset$12.params.intensity, spots = defaultPreset$12.params.spots, spotSize = defaultPreset$12.params.spotSize, pulse = defaultPreset$12.params.pulse, smoke = defaultPreset$12.params.smoke, smokeSize = defaultPreset$12.params.smokeSize, margin, marginLeft = margin ?? defaultPreset$12.params.marginLeft, marginRight = margin ?? defaultPreset$12.params.marginRight, marginTop = margin ?? defaultPreset$12.params.marginTop, marginBottom = margin ?? defaultPreset$12.params.marginBottom, fit = defaultPreset$12.params.fit, rotation = defaultPreset$12.params.rotation, scale = defaultPreset$12.params.scale, originX = defaultPreset$12.params.originX, originY = defaultPreset$12.params.originY, offsetX = defaultPreset$12.params.offsetX, offsetY = defaultPreset$12.params.offsetY, worldWidth = defaultPreset$12.params.worldWidth, worldHeight = defaultPreset$12.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_roundness: roundness,
		u_thickness: thickness,
		u_marginLeft: marginLeft,
		u_marginRight: marginRight,
		u_marginTop: marginTop,
		u_marginBottom: marginBottom,
		u_aspectRatio: PulsingBorderAspectRatios[aspectRatio],
		u_softness: softness,
		u_intensity: intensity,
		u_bloom: bloom,
		u_spots: spots,
		u_spotSize: spotSize,
		u_pulse: pulse,
		u_smoke: smoke,
		u_smokeSize: smokeSize,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: pulsingBorderFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/color-panels.js
var defaultPreset$11 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: .5,
		frame: 0,
		colors: [
			"#ff9d00",
			"#fd4f30",
			"#809bff",
			"#6d2eff",
			"#333aff",
			"#f15cff",
			"#ffd557"
		],
		colorBack: "#000000",
		angle1: 0,
		angle2: 0,
		length: 1.1,
		edges: false,
		blur: 0,
		fadeIn: 1,
		fadeOut: .3,
		gradient: 0,
		density: 3,
		scale: .8
	}
};
var colorPanelsPresets = [
	defaultPreset$11,
	{
		name: "Glass",
		params: {
			...defaultObjectSizing,
			rotation: 112,
			speed: 1,
			frame: 0,
			colors: [
				"#00cfff",
				"#ff2d55",
				"#34c759",
				"#af52de"
			],
			colorBack: "#ffffff00",
			angle1: .3,
			angle2: .3,
			length: 1,
			edges: true,
			blur: .25,
			fadeIn: .85,
			fadeOut: .3,
			gradient: 0,
			density: 1.6
		}
	},
	{
		name: "Gradient",
		params: {
			...defaultObjectSizing,
			speed: .5,
			frame: 0,
			colors: [
				"#f2ff00",
				"#00000000",
				"#00000000",
				"#5a0283",
				"#005eff"
			],
			colorBack: "#8ffff2",
			angle1: .4,
			angle2: .4,
			length: 3,
			edges: false,
			blur: .5,
			fadeIn: 1,
			fadeOut: .39,
			gradient: .78,
			density: 1.65,
			scale: 1.72,
			rotation: 270,
			offsetX: .18
		}
	},
	{
		name: "Opening",
		params: {
			...defaultObjectSizing,
			speed: 2,
			frame: 0,
			colors: ["#00ffff"],
			colorBack: "#570044",
			angle1: -1,
			angle2: -1,
			length: .52,
			edges: false,
			blur: 0,
			fadeIn: 0,
			fadeOut: 1,
			gradient: 0,
			density: 2.21,
			scale: 2.32,
			rotation: 360,
			offsetX: -.3,
			offsetY: .6
		}
	}
];
var ColorPanels = (0, import_react.memo)(function ColorPanelsImpl({ speed = defaultPreset$11.params.speed, frame = defaultPreset$11.params.frame, colors = defaultPreset$11.params.colors, colorBack = defaultPreset$11.params.colorBack, angle1 = defaultPreset$11.params.angle1, angle2 = defaultPreset$11.params.angle2, length = defaultPreset$11.params.length, edges = defaultPreset$11.params.edges, blur = defaultPreset$11.params.blur, fadeIn = defaultPreset$11.params.fadeIn, fadeOut = defaultPreset$11.params.fadeOut, density = defaultPreset$11.params.density, gradient = defaultPreset$11.params.gradient, fit = defaultPreset$11.params.fit, scale = defaultPreset$11.params.scale, rotation = defaultPreset$11.params.rotation, originX = defaultPreset$11.params.originX, originY = defaultPreset$11.params.originY, offsetX = defaultPreset$11.params.offsetX, offsetY = defaultPreset$11.params.offsetY, worldWidth = defaultPreset$11.params.worldWidth, worldHeight = defaultPreset$11.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_colorBack: getShaderColorFromString(colorBack),
		u_angle1: angle1,
		u_angle2: angle2,
		u_length: length,
		u_edges: edges,
		u_blur: blur,
		u_fadeIn: fadeIn,
		u_fadeOut: fadeOut,
		u_density: density,
		u_gradient: gradient,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: colorPanelsFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/static-mesh-gradient.js
var defaultPreset$10 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		rotation: 270,
		speed: 0,
		frame: 0,
		colors: [
			"#ffad0a",
			"#6200ff",
			"#e2a3ff",
			"#ff99fd"
		],
		positions: 2,
		waveX: 1,
		waveXShift: .6,
		waveY: 1,
		waveYShift: .21,
		mixing: .93,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var seaPreset = {
	name: "Sea",
	params: {
		...defaultObjectSizing,
		speed: 0,
		frame: 0,
		colors: [
			"#013b65",
			"#03738c",
			"#a3d3ff",
			"#f2faef"
		],
		positions: 0,
		waveX: .53,
		waveXShift: 0,
		waveY: .95,
		waveYShift: .64,
		mixing: .5,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var staticMeshGradientPresets = [
	defaultPreset$10,
	{
		name: "1960s",
		params: {
			...defaultObjectSizing,
			speed: 0,
			frame: 0,
			colors: [
				"#000000",
				"#082400",
				"#b1aa91",
				"#8e8c15"
			],
			positions: 42,
			waveX: .45,
			waveXShift: 0,
			waveY: 1,
			waveYShift: 0,
			mixing: 0,
			grainMixer: .37,
			grainOverlay: .78
		}
	},
	{
		name: "Sunset",
		params: {
			...defaultObjectSizing,
			speed: 0,
			frame: 0,
			colors: [
				"#264653",
				"#9c2b2b",
				"#f4a261",
				"#ffffff"
			],
			positions: 0,
			waveX: .6,
			waveXShift: .7,
			waveY: .7,
			waveYShift: .7,
			mixing: .5,
			grainMixer: 0,
			grainOverlay: 0
		}
	},
	seaPreset
];
var StaticMeshGradient = (0, import_react.memo)(function StaticMeshGradientImpl({ speed = defaultPreset$10.params.speed, frame = defaultPreset$10.params.frame, colors = defaultPreset$10.params.colors, positions = defaultPreset$10.params.positions, waveX = defaultPreset$10.params.waveX, waveXShift = defaultPreset$10.params.waveXShift, waveY = defaultPreset$10.params.waveY, waveYShift = defaultPreset$10.params.waveYShift, mixing = defaultPreset$10.params.mixing, grainMixer = defaultPreset$10.params.grainMixer, grainOverlay = defaultPreset$10.params.grainOverlay, fit = defaultPreset$10.params.fit, rotation = defaultPreset$10.params.rotation, scale = defaultPreset$10.params.scale, originX = defaultPreset$10.params.originX, originY = defaultPreset$10.params.originY, offsetX = defaultPreset$10.params.offsetX, offsetY = defaultPreset$10.params.offsetY, worldWidth = defaultPreset$10.params.worldWidth, worldHeight = defaultPreset$10.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_positions: positions,
		u_waveX: waveX,
		u_waveXShift: waveXShift,
		u_waveY: waveY,
		u_waveYShift: waveYShift,
		u_mixing: mixing,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: staticMeshGradientFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/static-radial-gradient.js
var defaultPreset$9 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: 1,
		speed: 0,
		frame: 0,
		colorBack: "#000000",
		colors: [
			"#00bbff",
			"#00ffe1",
			"#ffffff"
		],
		radius: .8,
		focalDistance: .99,
		focalAngle: 0,
		falloff: .24,
		mixing: .5,
		distortion: 0,
		distortionShift: 0,
		distortionFreq: 12,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var crossSectionPreset = {
	name: "Cross Section",
	params: {
		...defaultObjectSizing,
		scale: 1,
		speed: 0,
		frame: 0,
		colorBack: "#3d348b",
		colors: [
			"#7678ed",
			"#f7b801",
			"#f18701",
			"#37a066"
		],
		radius: 1,
		focalDistance: 0,
		focalAngle: 0,
		falloff: 0,
		mixing: 0,
		distortion: 1,
		distortionShift: 0,
		distortionFreq: 12,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var radialPreset = {
	name: "Radial",
	params: {
		...defaultObjectSizing,
		scale: 1,
		speed: 0,
		frame: 0,
		colorBack: "#264653",
		colors: [
			"#9c2b2b",
			"#f4a261",
			"#ffffff"
		],
		radius: 1,
		focalDistance: 0,
		focalAngle: 0,
		falloff: 0,
		mixing: 1,
		distortion: 0,
		distortionShift: 0,
		distortionFreq: 12,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var staticRadialGradientPresets = [
	defaultPreset$9,
	{
		name: "Lo-Fi",
		params: {
			...defaultObjectSizing,
			speed: 0,
			frame: 0,
			colorBack: "#2e1f27",
			colors: [
				"#d72638",
				"#3f88c5",
				"#f49d37"
			],
			radius: 1,
			focalDistance: 0,
			focalAngle: 0,
			falloff: .9,
			mixing: .7,
			distortion: 0,
			distortionShift: 0,
			distortionFreq: 12,
			grainMixer: 1,
			grainOverlay: .5
		}
	},
	crossSectionPreset,
	radialPreset
];
var StaticRadialGradient = (0, import_react.memo)(function StaticRadialGradientImpl({ speed = defaultPreset$9.params.speed, frame = defaultPreset$9.params.frame, colorBack = defaultPreset$9.params.colorBack, colors = defaultPreset$9.params.colors, radius = defaultPreset$9.params.radius, focalDistance = defaultPreset$9.params.focalDistance, focalAngle = defaultPreset$9.params.focalAngle, falloff = defaultPreset$9.params.falloff, grainMixer = defaultPreset$9.params.grainMixer, mixing = defaultPreset$9.params.mixing, distortion = defaultPreset$9.params.distortion, distortionShift = defaultPreset$9.params.distortionShift, distortionFreq = defaultPreset$9.params.distortionFreq, grainOverlay = defaultPreset$9.params.grainOverlay, fit = defaultPreset$9.params.fit, rotation = defaultPreset$9.params.rotation, scale = defaultPreset$9.params.scale, originX = defaultPreset$9.params.originX, originY = defaultPreset$9.params.originY, offsetX = defaultPreset$9.params.offsetX, offsetY = defaultPreset$9.params.offsetY, worldWidth = defaultPreset$9.params.worldWidth, worldHeight = defaultPreset$9.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_radius: radius,
		u_focalDistance: focalDistance,
		u_focalAngle: focalAngle,
		u_falloff: falloff,
		u_mixing: mixing,
		u_distortion: distortion,
		u_distortionShift: distortionShift,
		u_distortionFreq: distortionFreq,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: staticRadialGradientFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/paper-texture.js
var defaultPreset$8 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		scale: .6,
		speed: 0,
		frame: 0,
		colorFront: "#9fadbc",
		colorBack: "#ffffff",
		contrast: .3,
		roughness: .4,
		fiber: .3,
		fiberSize: .2,
		crumples: .3,
		crumpleSize: .35,
		folds: .65,
		foldCount: 5,
		fade: 0,
		drops: .2,
		seed: 5.8
	}
};
var abstractPreset$2 = {
	name: "Abstract",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		speed: 0,
		frame: 0,
		scale: .6,
		colorFront: "#00eeff",
		colorBack: "#ff0a81",
		contrast: .85,
		roughness: 0,
		fiber: .1,
		fiberSize: .2,
		crumples: 0,
		crumpleSize: .3,
		folds: 1,
		foldCount: 3,
		fade: 0,
		drops: .2,
		seed: 2.2
	}
};
var paperTexturePresets = [
	defaultPreset$8,
	{
		name: "Cardboard",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			scale: .6,
			colorFront: "#c7b89e",
			colorBack: "#999180",
			contrast: .4,
			roughness: 0,
			fiber: .35,
			fiberSize: .14,
			crumples: .7,
			crumpleSize: .1,
			folds: 0,
			foldCount: 1,
			fade: 0,
			drops: .1,
			seed: 1.6
		}
	},
	abstractPreset$2,
	{
		name: "Details",
		params: {
			...defaultObjectSizing,
			speed: 0,
			frame: 0,
			fit: "cover",
			scale: 3,
			colorFront: "#00000000",
			colorBack: "#00000000",
			contrast: 0,
			roughness: 1,
			fiber: .27,
			fiberSize: .22,
			crumples: 1,
			crumpleSize: .5,
			folds: 1,
			foldCount: 15,
			fade: 0,
			drops: 0,
			seed: 6
		}
	}
];
var PaperTexture = (0, import_react.memo)(function PaperTextureImpl({ speed = defaultPreset$8.params.speed, frame = defaultPreset$8.params.frame, colorFront = defaultPreset$8.params.colorFront, colorBack = defaultPreset$8.params.colorBack, image = "", contrast = defaultPreset$8.params.contrast, roughness = defaultPreset$8.params.roughness, fiber = defaultPreset$8.params.fiber, crumples = defaultPreset$8.params.crumples, folds = defaultPreset$8.params.folds, drops = defaultPreset$8.params.drops, seed = defaultPreset$8.params.seed, fiberScale, fiberSize = fiberScale === void 0 ? defaultPreset$8.params.fiberSize : .2 / fiberScale, crumplesScale, crumpleSize = crumplesScale === void 0 ? defaultPreset$8.params.crumpleSize : .2 / crumplesScale, blur, fade = blur === void 0 ? defaultPreset$8.params.fade : blur, foldsNumber, foldCount = foldsNumber === void 0 ? defaultPreset$8.params.foldCount : foldsNumber, fit = defaultPreset$8.params.fit, scale = defaultPreset$8.params.scale, rotation = defaultPreset$8.params.rotation, originX = defaultPreset$8.params.originX, originY = defaultPreset$8.params.originY, offsetX = defaultPreset$8.params.offsetX, offsetY = defaultPreset$8.params.offsetY, worldWidth = defaultPreset$8.params.worldWidth, worldHeight = defaultPreset$8.params.worldHeight, ...props }) {
	const noiseTexture = typeof window !== "undefined" && { u_noiseTexture: getShaderNoiseTexture() };
	const uniforms = {
		u_image: image,
		u_colorFront: getShaderColorFromString(colorFront),
		u_colorBack: getShaderColorFromString(colorBack),
		u_contrast: contrast,
		u_roughness: roughness,
		u_fiber: fiber,
		u_fiberSize: fiberSize,
		u_crumples: crumples,
		u_crumpleSize: crumpleSize,
		u_foldCount: foldCount,
		u_folds: folds,
		u_fade: fade,
		u_drops: drops,
		u_seed: seed,
		...noiseTexture,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: paperTextureFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/fluted-glass.js
var defaultPreset$7 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		speed: 0,
		frame: 0,
		colorBack: "#00000000",
		colorShadow: "#000000",
		colorHighlight: "#ffffff",
		shadows: .25,
		size: .5,
		angle: 0,
		distortionShape: "prism",
		highlights: .1,
		shape: "lines",
		distortion: .5,
		shift: 0,
		blur: 0,
		edges: .25,
		stretch: 0,
		margin: 0,
		marginLeft: 0,
		marginRight: 0,
		marginTop: 0,
		marginBottom: 0,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var wavesPreset = {
	name: "Waves",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		scale: 1.2,
		speed: 0,
		frame: 0,
		colorBack: "#00000000",
		colorShadow: "#000000",
		colorHighlight: "#ffffff",
		shadows: 0,
		size: .9,
		angle: 0,
		distortionShape: "contour",
		highlights: 0,
		shape: "wave",
		distortion: .5,
		shift: 0,
		blur: .1,
		edges: .5,
		stretch: 1,
		margin: 0,
		marginLeft: 0,
		marginRight: 0,
		marginTop: 0,
		marginBottom: 0,
		grainMixer: 0,
		grainOverlay: .05
	}
};
var flutedGlassPresets = [
	defaultPreset$7,
	{
		name: "Abstract",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			scale: 4,
			speed: 0,
			frame: 0,
			colorBack: "#00000000",
			colorShadow: "#000000",
			colorHighlight: "#ffffff",
			shadows: 0,
			size: .7,
			angle: 30,
			distortionShape: "flat",
			highlights: 0,
			shape: "linesIrregular",
			distortion: 1,
			shift: 0,
			blur: 1,
			edges: .5,
			stretch: 1,
			margin: 0,
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
			grainMixer: .1,
			grainOverlay: .1
		}
	},
	wavesPreset,
	{
		name: "Folds",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#00000000",
			colorShadow: "#000000",
			colorHighlight: "#ffffff",
			shadows: .4,
			size: .4,
			angle: 0,
			distortionShape: "cascade",
			highlights: 0,
			shape: "lines",
			distortion: .75,
			shift: 0,
			blur: .25,
			edges: .5,
			stretch: 0,
			margin: .1,
			marginLeft: .1,
			marginRight: .1,
			marginTop: .1,
			marginBottom: .1,
			grainMixer: 0,
			grainOverlay: 0
		}
	}
];
var FlutedGlass = (0, import_react.memo)(function FlutedGlassImpl({ speed = defaultPreset$7.params.speed, frame = defaultPreset$7.params.frame, colorBack = defaultPreset$7.params.colorBack, colorShadow = defaultPreset$7.params.colorShadow, colorHighlight = defaultPreset$7.params.colorHighlight, image = "", shadows = defaultPreset$7.params.shadows, angle = defaultPreset$7.params.angle, distortion = defaultPreset$7.params.distortion, distortionShape = defaultPreset$7.params.distortionShape, highlights = defaultPreset$7.params.highlights, shape = defaultPreset$7.params.shape, shift = defaultPreset$7.params.shift, blur = defaultPreset$7.params.blur, edges = defaultPreset$7.params.edges, margin, marginLeft = margin ?? defaultPreset$7.params.marginLeft, marginRight = margin ?? defaultPreset$7.params.marginRight, marginTop = margin ?? defaultPreset$7.params.marginTop, marginBottom = margin ?? defaultPreset$7.params.marginBottom, grainMixer = defaultPreset$7.params.grainMixer, grainOverlay = defaultPreset$7.params.grainOverlay, stretch = defaultPreset$7.params.stretch, count, size = count === void 0 ? defaultPreset$7.params.size : Math.pow(1 / (count * 1.6), 1 / 6) / .7 - .5, fit = defaultPreset$7.params.fit, scale = defaultPreset$7.params.scale, rotation = defaultPreset$7.params.rotation, originX = defaultPreset$7.params.originX, originY = defaultPreset$7.params.originY, offsetX = defaultPreset$7.params.offsetX, offsetY = defaultPreset$7.params.offsetY, worldWidth = defaultPreset$7.params.worldWidth, worldHeight = defaultPreset$7.params.worldHeight, ...props }) {
	const uniforms = {
		u_image: image,
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorShadow: getShaderColorFromString(colorShadow),
		u_colorHighlight: getShaderColorFromString(colorHighlight),
		u_shadows: shadows,
		u_size: size,
		u_angle: angle,
		u_distortion: distortion,
		u_shift: shift,
		u_blur: blur,
		u_edges: edges,
		u_stretch: stretch,
		u_distortionShape: GlassDistortionShapes[distortionShape],
		u_highlights: highlights,
		u_shape: GlassGridShapes[shape],
		u_marginLeft: marginLeft,
		u_marginRight: marginRight,
		u_marginTop: marginTop,
		u_marginBottom: marginBottom,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: flutedGlassFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
});
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/water.js
var defaultPreset$6 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: .8,
		speed: 1,
		frame: 0,
		colorBack: "#909090",
		colorHighlight: "#ffffff",
		highlights: .07,
		layering: .5,
		edges: .8,
		waves: .3,
		caustic: .1,
		size: 1
	}
};
var abstractPreset = {
	name: "Abstract",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		scale: 3,
		speed: 1,
		frame: 0,
		colorBack: "#909090",
		colorHighlight: "#ffffff",
		highlights: 0,
		layering: 0,
		edges: 1,
		waves: 1,
		caustic: .4,
		size: .15
	}
};
var streamingPreset = {
	name: "Streaming",
	params: {
		...defaultObjectSizing,
		fit: "contain",
		scale: .4,
		speed: 2,
		frame: 0,
		colorBack: "#909090",
		colorHighlight: "#ffffff",
		highlights: 0,
		layering: 0,
		edges: 0,
		waves: .5,
		caustic: 0,
		size: .5
	}
};
var waterPresets = [
	defaultPreset$6,
	{
		name: "Slow-mo",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			scale: 1,
			speed: .1,
			frame: 0,
			colorBack: "#909090",
			colorHighlight: "#ffffff",
			highlights: .4,
			layering: 0,
			edges: 0,
			waves: 0,
			caustic: .2,
			size: .7
		}
	},
	abstractPreset,
	streamingPreset
];
var Water = (0, import_react.memo)(function WaterImpl({ speed = defaultPreset$6.params.speed, frame = defaultPreset$6.params.frame, colorBack = defaultPreset$6.params.colorBack, colorHighlight = defaultPreset$6.params.colorHighlight, image = "", highlights = defaultPreset$6.params.highlights, layering = defaultPreset$6.params.layering, waves = defaultPreset$6.params.waves, edges = defaultPreset$6.params.edges, caustic = defaultPreset$6.params.caustic, effectScale, size = effectScale === void 0 ? defaultPreset$6.params.size : 10 / 9 / effectScale - 1 / 9, fit = defaultPreset$6.params.fit, scale = defaultPreset$6.params.scale, rotation = defaultPreset$6.params.rotation, originX = defaultPreset$6.params.originX, originY = defaultPreset$6.params.originY, offsetX = defaultPreset$6.params.offsetX, offsetY = defaultPreset$6.params.offsetY, worldWidth = defaultPreset$6.params.worldWidth, worldHeight = defaultPreset$6.params.worldHeight, ...props }) {
	const uniforms = {
		u_image: image,
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorHighlight: getShaderColorFromString(colorHighlight),
		u_highlights: highlights,
		u_layering: layering,
		u_waves: waves,
		u_edges: edges,
		u_caustic: caustic,
		u_size: size,
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: waterFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/image-dithering.js
var defaultPreset$5 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		speed: 0,
		frame: 0,
		colorFront: "#94ffaf",
		colorBack: "#000c38",
		colorHighlight: "#eaff94",
		type: "8x8",
		size: 2,
		colorSteps: 2,
		originalColors: false,
		inverted: false
	}
};
var retroPreset = {
	name: "Retro",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		speed: 0,
		frame: 0,
		colorFront: "#eeeeee",
		colorBack: "#5452ff",
		colorHighlight: "#eeeeee",
		type: "2x2",
		size: 3,
		colorSteps: 1,
		originalColors: true,
		inverted: false
	}
};
var imageDitheringPresets = [
	defaultPreset$5,
	{
		name: "Noise",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorFront: "#a2997c",
			colorBack: "#000000",
			colorHighlight: "#ededed",
			type: "random",
			size: 1,
			colorSteps: 1,
			originalColors: false,
			inverted: false
		}
	},
	retroPreset,
	{
		name: "Natural",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorFront: "#ffffff",
			colorBack: "#000000",
			colorHighlight: "#ffffff",
			type: "8x8",
			size: 2,
			colorSteps: 5,
			originalColors: true,
			inverted: false
		}
	}
];
var ImageDithering = (0, import_react.memo)(function ImageDitheringImpl({ speed = defaultPreset$5.params.speed, frame = defaultPreset$5.params.frame, colorFront = defaultPreset$5.params.colorFront, colorBack = defaultPreset$5.params.colorBack, colorHighlight = defaultPreset$5.params.colorHighlight, image = "", type = defaultPreset$5.params.type, colorSteps = defaultPreset$5.params.colorSteps, originalColors = defaultPreset$5.params.originalColors, inverted = defaultPreset$5.params.inverted, pxSize, size = pxSize === void 0 ? defaultPreset$5.params.size : pxSize, fit = defaultPreset$5.params.fit, scale = defaultPreset$5.params.scale, rotation = defaultPreset$5.params.rotation, originX = defaultPreset$5.params.originX, originY = defaultPreset$5.params.originY, offsetX = defaultPreset$5.params.offsetX, offsetY = defaultPreset$5.params.offsetY, worldWidth = defaultPreset$5.params.worldWidth, worldHeight = defaultPreset$5.params.worldHeight, ...props }) {
	const uniforms = {
		u_image: image,
		u_colorFront: getShaderColorFromString(colorFront),
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorHighlight: getShaderColorFromString(colorHighlight),
		u_type: DitheringTypes[type],
		u_pxSize: size,
		u_colorSteps: colorSteps,
		u_originalColors: originalColors,
		u_inverted: inverted,
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: imageDitheringFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/transparent-pixel.js
var transparentPixel = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/suspend.js
var isPromise = (promise) => typeof promise === "object" && typeof promise.then === "function";
var globalCache = [];
function shallowEqualArrays(arrA, arrB) {
	if (arrA === arrB) return true;
	if (!arrA || !arrB) return false;
	const len = arrA.length;
	if (arrB.length !== len) return false;
	for (let i = 0; i < len; i++) if (arrA[i] !== arrB[i]) return false;
	return true;
}
function query(fn, keys = null) {
	if (keys === null) keys = [fn];
	for (const entry2 of globalCache) if (shallowEqualArrays(keys, entry2.keys)) {
		if (Object.prototype.hasOwnProperty.call(entry2, "error")) throw entry2.error;
		if (Object.prototype.hasOwnProperty.call(entry2, "response")) return entry2.response;
		throw entry2.promise;
	}
	const entry = {
		keys,
		promise: (isPromise(fn) ? fn : fn(...keys)).then((response) => {
			entry.response = response;
		}).catch((error) => entry.error = error)
	};
	globalCache.push(entry);
	throw entry.promise;
}
var suspend = (fn, keys) => query(fn, keys);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/heatmap.js
var defaultPreset$4 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: .75,
		speed: 1,
		frame: 0,
		contour: .5,
		angle: 0,
		noise: 0,
		innerGlow: .5,
		outerGlow: .5,
		colorBack: "#000000",
		colors: [
			"#11206a",
			"#1f3ba2",
			"#2f63e7",
			"#6bd7ff",
			"#ffe679",
			"#ff991e",
			"#ff4c00"
		]
	}
};
var heatmapPresets = [defaultPreset$4, {
	name: "Sepia",
	params: {
		...defaultObjectSizing,
		scale: .75,
		speed: .5,
		frame: 0,
		contour: .5,
		angle: 0,
		noise: .75,
		innerGlow: .5,
		outerGlow: .5,
		colorBack: "#000000",
		colors: ["#997F45", "#ffffff"]
	}
}];
var Heatmap = (0, import_react.memo)(function HeatmapImpl({ speed = defaultPreset$4.params.speed, frame = defaultPreset$4.params.frame, image = "", contour = defaultPreset$4.params.contour, angle = defaultPreset$4.params.angle, noise = defaultPreset$4.params.noise, innerGlow = defaultPreset$4.params.innerGlow, outerGlow = defaultPreset$4.params.outerGlow, colorBack = defaultPreset$4.params.colorBack, colors = defaultPreset$4.params.colors, suspendWhenProcessingImage = false, fit = defaultPreset$4.params.fit, offsetX = defaultPreset$4.params.offsetX, offsetY = defaultPreset$4.params.offsetY, originX = defaultPreset$4.params.originX, originY = defaultPreset$4.params.originY, rotation = defaultPreset$4.params.rotation, scale = defaultPreset$4.params.scale, worldHeight = defaultPreset$4.params.worldHeight, worldWidth = defaultPreset$4.params.worldWidth, ...props }) {
	const imageUrl = typeof image === "string" ? image : image.src;
	const [processedStateImage, setProcessedStateImage] = (0, import_react.useState)(transparentPixel);
	let processedImage;
	if (suspendWhenProcessingImage && typeof window !== "undefined") processedImage = suspend(() => toProcessedHeatmap(imageUrl).then((result) => URL.createObjectURL(result.blob)), [imageUrl, "heatmap"]);
	else processedImage = processedStateImage;
	(0, import_react.useLayoutEffect)(() => {
		if (suspendWhenProcessingImage) return;
		if (!imageUrl) {
			setProcessedStateImage(transparentPixel);
			return;
		}
		let url;
		let current = true;
		toProcessedHeatmap(imageUrl).then((result) => {
			if (current) {
				url = URL.createObjectURL(result.blob);
				setProcessedStateImage(url);
			}
		});
		return () => {
			current = false;
		};
	}, [imageUrl, suspendWhenProcessingImage]);
	const uniforms = (0, import_react.useMemo)(() => ({
		u_image: processedImage,
		u_contour: contour,
		u_angle: angle,
		u_noise: noise,
		u_innerGlow: innerGlow,
		u_outerGlow: outerGlow,
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_fit: ShaderFitOptions[fit],
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_rotation: rotation,
		u_scale: scale,
		u_worldHeight: worldHeight,
		u_worldWidth: worldWidth
	}), [
		speed,
		frame,
		contour,
		angle,
		noise,
		innerGlow,
		outerGlow,
		colors,
		colorBack,
		processedImage,
		fit,
		offsetX,
		offsetY,
		originX,
		originY,
		rotation,
		scale,
		worldHeight,
		worldWidth
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: heatmapFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/liquid-metal.js
var defaultPreset$3 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: .6,
		speed: 1,
		frame: 0,
		colorBack: "#AAAAAC",
		colorTint: "#ffffff",
		distortion: .07,
		repetition: 2,
		shiftRed: .3,
		shiftBlue: .3,
		contour: .4,
		softness: .1,
		angle: 70,
		shape: "diamond"
	}
};
var liquidMetalPresets = [
	defaultPreset$3,
	{
		name: "Noir",
		params: {
			...defaultObjectSizing,
			scale: .6,
			speed: 1,
			frame: 0,
			colorBack: "#000000",
			colorTint: "#606060",
			softness: .45,
			repetition: 1.5,
			shiftRed: 0,
			shiftBlue: 0,
			distortion: 0,
			contour: 0,
			angle: 90,
			shape: "diamond"
		}
	},
	{
		name: "Backdrop",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			scale: 1,
			colorBack: "#AAAAAC",
			colorTint: "#ffffff",
			softness: .05,
			repetition: 1.5,
			shiftRed: .3,
			shiftBlue: .3,
			distortion: .1,
			contour: .4,
			shape: "none",
			angle: 90,
			worldWidth: 0,
			worldHeight: 0
		}
	},
	{
		name: "Stripes",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			scale: .6,
			colorBack: "#000000",
			colorTint: "#2c5d72",
			softness: .8,
			repetition: 6,
			shiftRed: 1,
			shiftBlue: -1,
			distortion: .4,
			contour: .4,
			shape: "circle",
			angle: 0
		}
	}
];
var LiquidMetal = (0, import_react.memo)(function LiquidMetalImpl({ colorBack = defaultPreset$3.params.colorBack, colorTint = defaultPreset$3.params.colorTint, speed = defaultPreset$3.params.speed, frame = defaultPreset$3.params.frame, image = "", contour = defaultPreset$3.params.contour, distortion = defaultPreset$3.params.distortion, softness = defaultPreset$3.params.softness, repetition = defaultPreset$3.params.repetition, shiftRed = defaultPreset$3.params.shiftRed, shiftBlue = defaultPreset$3.params.shiftBlue, angle = defaultPreset$3.params.angle, shape = defaultPreset$3.params.shape, suspendWhenProcessingImage = false, fit = defaultPreset$3.params.fit, scale = defaultPreset$3.params.scale, rotation = defaultPreset$3.params.rotation, originX = defaultPreset$3.params.originX, originY = defaultPreset$3.params.originY, offsetX = defaultPreset$3.params.offsetX, offsetY = defaultPreset$3.params.offsetY, worldWidth = defaultPreset$3.params.worldWidth, worldHeight = defaultPreset$3.params.worldHeight, ...props }) {
	const imageUrl = typeof image === "string" ? image : image.src;
	const [processedStateImage, setProcessedStateImage] = (0, import_react.useState)(transparentPixel);
	let processedImage;
	if (suspendWhenProcessingImage && typeof window !== "undefined" && imageUrl) processedImage = suspend(() => toProcessedLiquidMetal(imageUrl).then((result) => URL.createObjectURL(result.pngBlob)), [imageUrl, "liquid-metal"]);
	else processedImage = processedStateImage;
	(0, import_react.useLayoutEffect)(() => {
		if (suspendWhenProcessingImage) return;
		if (!imageUrl) {
			setProcessedStateImage(transparentPixel);
			return;
		}
		let url;
		let current = true;
		toProcessedLiquidMetal(imageUrl).then((result) => {
			if (current) {
				url = URL.createObjectURL(result.pngBlob);
				setProcessedStateImage(url);
			}
		});
		return () => {
			current = false;
		};
	}, [imageUrl, suspendWhenProcessingImage]);
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorTint: getShaderColorFromString(colorTint),
		u_image: processedImage,
		u_contour: contour,
		u_distortion: distortion,
		u_softness: softness,
		u_repetition: repetition,
		u_shiftRed: shiftRed,
		u_shiftBlue: shiftBlue,
		u_angle: angle,
		u_isImage: Boolean(image),
		u_shape: LiquidMetalShapes[shape],
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: liquidMetalFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
});
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/halftone-dots.js
var defaultPreset$2 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		speed: 0,
		frame: 0,
		colorBack: "#f2f1e8",
		colorFront: "#2b2b2b",
		size: .5,
		radius: 1.25,
		contrast: .4,
		originalColors: false,
		inverted: false,
		grainMixer: .2,
		grainOverlay: .2,
		grainSize: .5,
		grid: "hex",
		type: "gooey"
	}
};
var halftoneDotsPresets = [
	defaultPreset$2,
	{
		name: "LED screen",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#000000",
			colorFront: "#29ff7b",
			size: .5,
			radius: 1.5,
			contrast: .3,
			originalColors: false,
			inverted: false,
			grainMixer: 0,
			grainOverlay: 0,
			grainSize: .5,
			grid: "square",
			type: "soft"
		}
	},
	{
		name: "Mosaic",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#000000",
			colorFront: "#b2aeae",
			size: .6,
			radius: 2,
			contrast: .01,
			originalColors: true,
			inverted: false,
			grainMixer: 0,
			grainOverlay: 0,
			grainSize: .5,
			grid: "hex",
			type: "classic"
		}
	},
	{
		name: "Round and square",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#141414",
			colorFront: "#ff8000",
			size: .8,
			radius: 1,
			contrast: 1,
			originalColors: false,
			inverted: true,
			grainMixer: .05,
			grainOverlay: .3,
			grainSize: .5,
			grid: "square",
			type: "holes"
		}
	}
];
var HalftoneDots = (0, import_react.memo)(function HalftoneDotsImpl({ speed = defaultPreset$2.params.speed, frame = defaultPreset$2.params.frame, colorFront = defaultPreset$2.params.colorFront, colorBack = defaultPreset$2.params.colorBack, image = "", size = defaultPreset$2.params.size, radius = defaultPreset$2.params.radius, contrast = defaultPreset$2.params.contrast, originalColors = defaultPreset$2.params.originalColors, inverted = defaultPreset$2.params.inverted, grainMixer = defaultPreset$2.params.grainMixer, grainOverlay = defaultPreset$2.params.grainOverlay, grainSize = defaultPreset$2.params.grainSize, grid = defaultPreset$2.params.grid, type = defaultPreset$2.params.type, fit = defaultPreset$2.params.fit, scale = defaultPreset$2.params.scale, rotation = defaultPreset$2.params.rotation, originX = defaultPreset$2.params.originX, originY = defaultPreset$2.params.originY, offsetX = defaultPreset$2.params.offsetX, offsetY = defaultPreset$2.params.offsetY, worldWidth = defaultPreset$2.params.worldWidth, worldHeight = defaultPreset$2.params.worldHeight, ...props }) {
	const uniforms = {
		u_image: image,
		u_colorFront: getShaderColorFromString(colorFront),
		u_colorBack: getShaderColorFromString(colorBack),
		u_size: size,
		u_radius: radius,
		u_contrast: contrast,
		u_originalColors: originalColors,
		u_inverted: inverted,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_grainSize: grainSize,
		u_grid: HalftoneDotsGrids[grid],
		u_type: HalftoneDotsTypes[type],
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: halftoneDotsFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/halftone-cmyk.js
var defaultPreset$1 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: 1,
		fit: "cover",
		speed: 0,
		frame: 0,
		colorBack: "#fbfaf5",
		colorC: "#00b4ff",
		colorM: "#fc519f",
		colorY: "#ffd800",
		colorK: "#231f20",
		size: .2,
		contrast: 1,
		softness: 1,
		grainSize: .5,
		grainMixer: 0,
		grainOverlay: 0,
		gridNoise: .2,
		floodC: .15,
		floodM: 0,
		floodY: 0,
		floodK: 0,
		gainC: .3,
		gainM: 0,
		gainY: .2,
		gainK: 0,
		type: "ink"
	}
};
var halftoneCmykPresets = [
	defaultPreset$1,
	{
		name: "Drops",
		params: {
			...defaultObjectSizing,
			scale: 1,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#eeefd7",
			colorC: "#00b2ff",
			colorM: "#fc4f4f",
			colorY: "#ffd900",
			colorK: "#231f20",
			size: .88,
			contrast: 1.15,
			softness: 0,
			grainSize: .01,
			grainMixer: .05,
			grainOverlay: .25,
			gridNoise: .5,
			floodC: .15,
			floodM: 0,
			floodY: 0,
			floodK: 0,
			gainC: 1,
			gainM: .44,
			gainY: -1,
			gainK: 0,
			type: "ink"
		}
	},
	{
		name: "Newspaper",
		params: {
			...defaultObjectSizing,
			scale: 1,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#f2f1e8",
			colorC: "#7a7a75",
			colorM: "#7a7a75",
			colorY: "#7a7a75",
			colorK: "#231f20",
			size: .01,
			contrast: 2,
			softness: .2,
			grainSize: 0,
			grainMixer: 0,
			grainOverlay: .2,
			gridNoise: .6,
			floodC: 0,
			floodM: 0,
			floodY: 0,
			floodK: .1,
			gainC: -.17,
			gainM: -.45,
			gainY: -.45,
			gainK: 0,
			type: "dots"
		}
	},
	{
		name: "Vintage",
		params: {
			...defaultObjectSizing,
			scale: 1,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#fffaf0",
			colorC: "#59afc5",
			colorM: "#d8697c",
			colorY: "#fad85c",
			colorK: "#2d2824",
			size: .2,
			contrast: 1.25,
			softness: .4,
			grainSize: .5,
			grainMixer: .15,
			grainOverlay: .1,
			gridNoise: .45,
			floodC: .15,
			floodM: 0,
			floodY: 0,
			floodK: 0,
			gainC: .3,
			gainM: 0,
			gainY: .2,
			gainK: 0,
			type: "sharp"
		}
	}
];
var HalftoneCmyk = (0, import_react.memo)(function HalftoneCmykImpl({ speed = defaultPreset$1.params.speed, frame = defaultPreset$1.params.frame, colorBack = defaultPreset$1.params.colorBack, colorC = defaultPreset$1.params.colorC, colorM = defaultPreset$1.params.colorM, colorY = defaultPreset$1.params.colorY, colorK = defaultPreset$1.params.colorK, image = "", size = defaultPreset$1.params.size, contrast = defaultPreset$1.params.contrast, softness = defaultPreset$1.params.softness, grainSize = defaultPreset$1.params.grainSize, grainMixer = defaultPreset$1.params.grainMixer, grainOverlay = defaultPreset$1.params.grainOverlay, gridNoise = defaultPreset$1.params.gridNoise, floodC = defaultPreset$1.params.floodC, floodM = defaultPreset$1.params.floodM, floodY = defaultPreset$1.params.floodY, floodK = defaultPreset$1.params.floodK, gainC = defaultPreset$1.params.gainC, gainM = defaultPreset$1.params.gainM, gainY = defaultPreset$1.params.gainY, gainK = defaultPreset$1.params.gainK, type = defaultPreset$1.params.type, fit = defaultPreset$1.params.fit, scale = defaultPreset$1.params.scale, rotation = defaultPreset$1.params.rotation, originX = defaultPreset$1.params.originX, originY = defaultPreset$1.params.originY, offsetX = defaultPreset$1.params.offsetX, offsetY = defaultPreset$1.params.offsetY, worldWidth = defaultPreset$1.params.worldWidth, worldHeight = defaultPreset$1.params.worldHeight, ...props }) {
	const uniforms = {
		u_image: image,
		u_noiseTexture: getShaderNoiseTexture(),
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorC: getShaderColorFromString(colorC),
		u_colorM: getShaderColorFromString(colorM),
		u_colorY: getShaderColorFromString(colorY),
		u_colorK: getShaderColorFromString(colorK),
		u_size: size,
		u_contrast: contrast,
		u_softness: softness,
		u_grainSize: grainSize,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_gridNoise: gridNoise,
		u_floodC: floodC,
		u_floodM: floodM,
		u_floodY: floodY,
		u_floodK: floodK,
		u_gainC: gainC,
		u_gainM: gainM,
		u_gainY: gainY,
		u_gainK: gainK,
		u_type: HalftoneCmykTypes[type],
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: halftoneCmykFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/gem-smoke.js
var defaultPreset = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: .6,
		speed: 1,
		frame: 0,
		colorBack: "#f0efea",
		colorInner: "#fafaf5",
		colors: ["#333333", "#e7e6df"],
		outerGlow: .55,
		innerGlow: 1,
		innerDistortion: .8,
		outerDistortion: .6,
		offset: 0,
		angle: 0,
		size: .8,
		shape: "diamond"
	}
};
var fluorescentPreset = {
	name: "Fluorescent",
	params: {
		...defaultObjectSizing,
		scale: .6,
		speed: 1,
		frame: 0,
		colorBack: "#000000",
		colorInner: "#000000",
		colors: [
			"#2fb64c",
			"#cdff61",
			"#ffffff"
		],
		outerGlow: 0,
		innerGlow: 1,
		innerDistortion: 1,
		outerDistortion: .8,
		offset: 0,
		angle: 0,
		size: .8,
		shape: "diamond"
	}
};
var gemSmokePresets = [
	defaultPreset,
	{
		name: "Fire",
		params: {
			...defaultObjectSizing,
			scale: .6,
			speed: 1,
			frame: 0,
			colorBack: "#000000",
			colorInner: "#000000",
			colors: [
				"#fe5b16",
				"#f7ff61",
				"#ffffff"
			],
			outerGlow: 1,
			innerGlow: .65,
			innerDistortion: .6,
			outerDistortion: .8,
			offset: 0,
			angle: 0,
			size: .8,
			shape: "diamond"
		}
	},
	fluorescentPreset,
	{
		name: "Infrared",
		params: {
			...defaultObjectSizing,
			scale: .6,
			speed: .5,
			frame: 0,
			colorBack: "#cd28dc",
			colorInner: "#00000000",
			colors: [
				"#ff9900",
				"#fff67a",
				"#dcff52",
				"#00ffbb",
				"#0077ff"
			],
			outerGlow: 1,
			innerGlow: 1,
			innerDistortion: 1,
			outerDistortion: 1,
			offset: .2,
			angle: 0,
			size: 1,
			shape: "diamond"
		}
	}
];
var GemSmoke = (0, import_react.memo)(function GemSmokeImpl({ colorBack = defaultPreset.params.colorBack, colors = defaultPreset.params.colors, speed = defaultPreset.params.speed, frame = defaultPreset.params.frame, image = "", innerDistortion = defaultPreset.params.innerDistortion, outerDistortion = defaultPreset.params.outerDistortion, outerGlow = defaultPreset.params.outerGlow, innerGlow = defaultPreset.params.innerGlow, colorInner = defaultPreset.params.colorInner, offset = defaultPreset.params.offset, angle = defaultPreset.params.angle, size = defaultPreset.params.size, shape = defaultPreset.params.shape, suspendWhenProcessingImage = false, fit = defaultPreset.params.fit, scale = defaultPreset.params.scale, rotation = defaultPreset.params.rotation, originX = defaultPreset.params.originX, originY = defaultPreset.params.originY, offsetX = defaultPreset.params.offsetX, offsetY = defaultPreset.params.offsetY, worldWidth = defaultPreset.params.worldWidth, worldHeight = defaultPreset.params.worldHeight, ...props }) {
	const imageUrl = typeof image === "string" ? image : image.src;
	const [processedStateImage, setProcessedStateImage] = (0, import_react.useState)(transparentPixel);
	let processedImage;
	if (suspendWhenProcessingImage && typeof window !== "undefined" && imageUrl) processedImage = suspend(() => toProcessedGemSmoke(imageUrl).then((result) => URL.createObjectURL(result.pngBlob)), [imageUrl, "gemSmoke"]);
	else processedImage = processedStateImage;
	(0, import_react.useLayoutEffect)(() => {
		if (suspendWhenProcessingImage) return;
		if (!imageUrl) {
			setProcessedStateImage(transparentPixel);
			return;
		}
		let url;
		let current = true;
		toProcessedGemSmoke(imageUrl).then((result) => {
			if (current) {
				url = URL.createObjectURL(result.pngBlob);
				setProcessedStateImage(url);
			}
		});
		return () => {
			current = false;
		};
	}, [imageUrl, suspendWhenProcessingImage]);
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_colorBack: getShaderColorFromString(colorBack),
		u_image: processedImage,
		u_innerDistortion: innerDistortion,
		u_outerDistortion: outerDistortion,
		u_outerGlow: outerGlow,
		u_innerGlow: innerGlow,
		u_colorInner: getShaderColorFromString(colorInner),
		u_offset: offset,
		u_angle: angle,
		u_size: size,
		u_isImage: Boolean(image),
		u_shape: GemSmokeShapes[shape],
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: gemSmokeFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
export { ColorPanels, Dithering, DotGrid, DotOrbit, FlutedGlass, GemSmoke, GodRays, GrainGradient, HalftoneCmyk, HalftoneDots, Heatmap, ImageDithering, LiquidMetal, MeshGradient, Metaballs, NeuroNoise, PaperTexture, PerlinNoise, PulsingBorder, ShaderMount, SimplexNoise, SmokeRing, Spiral, StaticMeshGradient, StaticRadialGradient, Swirl, Voronoi, Warp, Water, Waves, colorPanelsMeta, colorPanelsPresets, ditheringPresets, dotGridPresets, dotOrbitMeta, dotOrbitPresets, flutedGlassPresets, gemSmokePresets, getShaderColorFromString, godRaysMeta, godRaysPresets, grainGradientMeta, grainGradientPresets, halftoneCmykPresets, halftoneDotsPresets, heatmapMeta, heatmapPresets, imageDitheringPresets, isPaperShaderElement, liquidMetalPresets, meshGradientMeta, meshGradientPresets, metaballsMeta, metaballsPresets, neuroNoisePresets, paperTexturePresets, perlinNoisePresets, pulsingBorderMeta, pulsingBorderPresets, simplexNoiseMeta, simplexNoisePresets, smokeRingMeta, smokeRingPresets, spiralPresets, staticMeshGradientMeta, staticMeshGradientPresets, staticRadialGradientMeta, staticRadialGradientPresets, swirlMeta, swirlPresets, voronoiMeta, voronoiPresets, warpMeta, warpPresets, waterPresets, wavesPresets };

//# sourceMappingURL=@paper-design_shaders-react.js.map