uniform sampler2D u_image0;
uniform float u_particle_opacity;
uniform vec3 u_particle_color;

varying vec3 v_data;
varying float v_visibility;

#pragma mapbox: define highp vec4 color
#pragma mapbox: define mediump float radius
#pragma mapbox: define lowp float blur
#pragma mapbox: define lowp float opacity
#pragma mapbox: define highp vec4 stroke_color
#pragma mapbox: define mediump float stroke_width
#pragma mapbox: define lowp float stroke_opacity

void main() {
    #pragma mapbox: initialize highp vec4 color
    #pragma mapbox: initialize mediump float radius
    #pragma mapbox: initialize lowp float blur
    #pragma mapbox: initialize lowp float opacity
    #pragma mapbox: initialize highp vec4 stroke_color
    #pragma mapbox: initialize mediump float stroke_width
    #pragma mapbox: initialize lowp float stroke_opacity

    vec2 extrude = v_data.xy;
    float extrude_length = length(extrude);

    lowp float antialiasblur = v_data.z;
    float antialiased_blur = -max(blur, antialiasblur);

    float opacity_t = smoothstep(0.0, antialiased_blur, extrude_length - 1.0);

    float color_t = stroke_width < 0.01 ? 0.0 : smoothstep(
        antialiased_blur,
        0.0,
        extrude_length - radius / (radius + stroke_width)
    );

    vec4 out_color = mix(color * opacity, stroke_color * stroke_opacity, color_t);

#ifdef FOG
    out_color = fog_apply_premultiplied(out_color, v_fog_pos);
#endif

#ifdef PARTICLE_GRADIENT
    float alpha = 1.0 - extrude_length;
    out_color = vec4(u_particle_color * vec3(alpha), alpha);
#else
    float brightness = 1.0 - (extrude.y + 1.0) / 8.0;
    float alpha = 1.0 - extrude_length;

    vec4 tex_color = texture2D(u_image0, extrude * 0.5 + 0.5);
    out_color = vec4(vec3(brightness * tex_color) * u_particle_color, tex_color.a);
#endif

    gl_FragColor = out_color * u_particle_opacity; // * (v_visibility * opacity_t);

#ifdef OVERDRAW_INSPECTOR
    gl_FragColor = vec4(1.0);
#endif
}
