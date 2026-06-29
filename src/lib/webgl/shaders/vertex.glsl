#version 300 es
/* filepath: src/lib/webgl/shaders/vertex.glsl */

// Vertex attributes
in vec2 a_position;      // Vertex position in screen coordinates
in vec2 a_texCoord;      // Texture coordinates for character atlas
in vec3 a_foreground;    // Foreground (dark glyph pixel) color
in vec3 a_background;    // Background (transparent pixel) color
in vec3 a_detail;        // Detail/highlight (bright glyph pixel) color
in vec3 a_outline;       // Outline color (vec3(0) = no outline)
in vec4 a_uvBounds;      // Glyph UV bounds: (uMin, vMin, uMax, vMax)
in vec3 a_light;         // Per-corner ADDITIVE point-light contribution (0 = none)
in float a_fullColor;    // 1 = sample atlas RGBA directly (MShock full-colour), 0 = luminance tint

// Uniforms (constant for all vertices in a draw call)
uniform mat4 u_projection;  // Orthographic projection matrix
uniform vec2 u_viewOffset;  // Camera top-left in BASE-tile pixels; applied here so
                            // panning never rebuilds the vertex buffer.
uniform vec2 u_zoom;        // actualTileSize / BASE_TILE_PX; applied here so zoom
                            // never rebuilds the vertex buffer either.

// Varying outputs (passed to fragment shader)
out vec2 v_texCoord;     // Pass texture coordinates to fragment
out vec3 v_foreground;   // Pass foreground color to fragment
out vec3 v_background;   // Pass background color to fragment
out vec3 v_detail;       // Pass detail color to fragment
out vec3 v_outline;      // Pass outline color to fragment
out vec4 v_uvBounds;     // Pass glyph UV bounds to fragment
out vec3 v_light;        // Interpolated per-tile light across the quad
out float v_fullColor;   // Pass full-colour flag to fragment

void main() {
    // a_position holds world coordinates baked at a FIXED base tile size. Pan
    // (u_viewOffset) and zoom (u_zoom) are applied here as uniforms, so neither
    // scrolling nor zooming ever requires rebuilding the vertex buffer.
    vec2 pos = (a_position - u_viewOffset) * u_zoom;
    gl_Position = u_projection * vec4(pos, 0.0, 1.0);
    
    // Pass through texture coordinates and colors to fragment shader
    v_texCoord = a_texCoord;
    v_foreground = a_foreground;
    v_background = a_background;
    v_detail = a_detail;
    v_outline = a_outline;
    v_uvBounds = a_uvBounds;
    v_light = a_light;
    v_fullColor = a_fullColor;
}