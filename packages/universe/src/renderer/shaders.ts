/**
 * GLSL ES 3.00 sources. The anti-flicker rules live here:
 *  - a point smaller than `uMinPx` is drawn at `uMinPx` with its light scaled down by area,
 *    so nothing pops or crawls as it shrinks below a pixel;
 *  - no star twinkles;
 *  - the first bloom downsample averages 4×4 source pixels, so one star cannot strobe the glow;
 *  - point sizes are clamped to what the device can draw.
 */

export const HEADER = "#version 300 es\nprecision highp float;\n";

/**
 * Stars, haze, knots, dust and the far sky share this program. Positions come from each
 * point's orbit and the scene time, so the galaxy turns with no CPU work.
 */
export const STAR_VS = `
layout(location=0) in vec4 aO; layout(location=1) in vec4 aP;
uniform mat4 uV, uPr; uniform vec2 uShift;
uniform float uT, uPx, uMinPx, uMaxPx, uBright, uKind;
uniform vec3 uYoung, uDisk, uBulge, uTint;
out vec3 vC; out float vA;
void main(){
  bool ell = aO.y < 1.0; float turn = aP.x*uT;
  float th = aO.w + (ell ? 0.0 : turn), tl = aO.z + (ell ? turn : 0.0), a = aO.x, b = a*aO.y;
  vec2 q = vec2(a*cos(th), b*sin(th)); float c = cos(tl), s = sin(tl);
  vec3 p = vec3(q.x*c - q.y*s, aP.y, q.x*s + q.y*c);
  vec4 v = uV*vec4(p,1.0); gl_Position = uPr*v; gl_Position.xy += uShift*gl_Position.w;
  float want = aP.w*uPx/max(.05,-v.z), px = clamp(want, uMinPx, uMaxPx), e = want/px;
  gl_PointSize = px; vA = uBright*min(1.0, e*e);
  vC = uKind > .5 ? uTint : (aP.z < .5 ? mix(uYoung, uDisk, aP.z*2.0) : mix(uDisk, uBulge, aP.z*2.0-1.0));
}`;

export const STAR_FS = `
in vec3 vC; in float vA; uniform float uDust; out vec4 o;
void main(){ vec2 d = gl_PointCoord*2.0-1.0; float r2 = dot(d,d); if (r2 > 1.0) discard;
  float f = exp(-r2*4.5)*(1.0-r2);
  o = uDust > .5 ? vec4(0.0,0.0,0.0,f*vA) : vec4(vC*f*vA, 1.0); }`;

/**
 * Event particles: world position, colour × intensity, size. A particle the device cannot
 * draw as large as asked (Apple GPUs stop at 64 px) keeps its light, up to a point.
 */
export const FX_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in float aSize;
uniform mat4 uV, uPr; uniform vec2 uShift; uniform float uPx, uMinPx, uMaxPx; out vec3 vC;
void main(){ vec4 v = uV*vec4(aPos,1.0); gl_Position = uPr*v; gl_Position.xy += uShift*gl_Position.w;
  float want = aSize*uPx/max(.05,-v.z), px = clamp(want, uMinPx, uMaxPx), e = want/px;
  gl_PointSize = px; vC = aCol.rgb*aCol.a*min(4.0, e*e); }`;

export const FX_FS = `
in vec3 vC; out vec4 o;
void main(){ vec2 d = gl_PointCoord*2.0-1.0; float r2 = dot(d,d); if (r2 > 1.0) discard;
  o = vec4(vC*(exp(-r2*5.0)*(1.0-r2) + .6*exp(-r2*40.0)), 1.0); }`;

/**
 * One triangle that covers the screen. Its corners come from attribute 0, not gl_VertexID:
 * a program that leaves attribute 0 unused makes desktop OpenGL emulate it on every draw.
 */
export const QUAD_VS = `
layout(location=0) in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*.5+.5; gl_Position = vec4(aPos,0.0,1.0); }`;

/** Four bilinear taps = a 4×4 box. With a threshold it is also the bloom's bright pass. */
export const DOWN_FS = `
in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uTx; uniform float uThr; out vec4 o;
void main(){ vec3 c = .25*(texture(uSrc,vUv+uTx*vec2(-1,-1)).rgb+texture(uSrc,vUv+uTx*vec2(1,-1)).rgb+texture(uSrc,vUv+uTx*vec2(-1,1)).rgb+texture(uSrc,vUv+uTx*vec2(1,1)).rgb);
  float l = max(c.r,max(c.g,c.b)); o = vec4(c*max(0.0,l-uThr)/max(l,1e-4),1.0); }`;

export const BLUR_FS = `
in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uDir; out vec4 o;
void main(){ vec3 c = texture(uSrc,vUv).rgb*.2270;
  c += (texture(uSrc,vUv+uDir*1.3846).rgb+texture(uSrc,vUv-uDir*1.3846).rgb)*.3162;
  c += (texture(uSrc,vUv+uDir*3.2308).rgb+texture(uSrc,vUv-uDir*3.2308).rgb)*.0703; o = vec4(c,1.0); }`;

/**
 * Scene + bloom + the analytic core glow → ACES tone mapping, vignette, gamma, dither.
 * `uFx` and `uFxBloom` carry the event particles on a frozen page, where the galaxy itself
 * is a cached frame; they are black textures otherwise.
 */
export const COMPOSITE_FS = `
in vec2 vUv; uniform sampler2D uScene, uBloom, uFx, uFxBloom;
uniform vec2 uCore, uRes; uniform float uCoreR, uCoreB, uExp, uBl;
uniform vec3 uCoreC, uBg; out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0); }
void main(){
  vec3 c = texture(uScene,vUv).rgb + texture(uFx,vUv).rgb + (texture(uBloom,vUv).rgb + texture(uFxBloom,vUv).rgb)*uBl;
  vec2 d = (vUv-uCore)*uRes; float r2 = dot(d,d)/(uCoreR*uCoreR);
  c += uCoreC*uCoreB*(.9*exp(-r2*9.0) + .35*exp(-r2*1.6) + .08*exp(-r2*.25));
  c = aces(c*uExp + uBg); vec2 q = vUv-.5; c *= 1.0 - .35*dot(q,q);
  c = pow(c, vec3(1.0/2.2)); c += (fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.0;
  o = vec4(c,1.0); }`;

/** A finished frame drawn as it is, with an opacity: the outgoing side of a cross-fade. */
export const COPY_FS = `
in vec2 vUv; uniform sampler2D uSrc; uniform float uAlpha; out vec4 o;
void main(){ o = vec4(texture(uSrc,vUv).rgb, uAlpha); }`;
