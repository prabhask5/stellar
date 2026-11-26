/** Tiny WebGL2 helpers: programs with their uniform locations, point buffers, render targets. */
import { HEADER } from "./shaders.ts";

export type GL = WebGL2RenderingContext;

export interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export function createProgram(gl: GL, vertex: string, fragment: string): Program {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("universe: no shader");
    gl.shaderSource(shader, HEADER + source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    // The shader lives on in the program; flag it so it goes when the program does.
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost())
    throw new Error(`universe: ${gl.getProgramInfoLog(program) ?? "program did not link"}`);
  const uniforms: Program["uniforms"] = {};
  const count = Number(gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) ?? 0);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(program, i)?.name;
    if (name) uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
}

export interface PointBuffer {
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
}

/** A vertex array of float attributes, one buffer each: [data, components]. */
export function createPoints(
  gl: GL,
  attributes: readonly (readonly [Float32Array, number])[],
  usage: number = gl.STATIC_DRAW,
): PointBuffer {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffers = attributes.map(([data, size], location) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    return buffer;
  });
  gl.bindVertexArray(null);
  return { vao, buffers };
}

export function deletePoints(gl: GL, points: PointBuffer | null): void {
  if (!points) return;
  for (const b of points.buffers) gl.deleteBuffer(b);
  gl.deleteVertexArray(points.vao);
}

export interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

/**
 * A colour render target. `hdr` asks for half-float; the caller learns from the return value
 * whether the device really gave one (the framebuffer can still be incomplete).
 */
export function createTarget(gl: GL, width: number, height: number, hdr: boolean): Target | null {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  if (hdr)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete =
    gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE || gl.isContextLost();
  if (!complete) {
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(framebuffer);
    return null;
  }
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return { texture, framebuffer, width, height };
}

export function deleteTarget(gl: GL, target: Target | null): void {
  if (!target) return;
  gl.deleteTexture(target.texture);
  gl.deleteFramebuffer(target.framebuffer);
}
