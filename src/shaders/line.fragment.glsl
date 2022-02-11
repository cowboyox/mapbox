#ifdef GL_ES
precision highp float;
#endif

uniform lowp float u_device_pixel_ratio;
uniform float u_alpha_discard_threshold;


varying vec2 v_width2;
varying vec2 v_normal;
varying float v_gamma_scale;
varying vec3 v_position;

#ifdef RENDER_LINE_DASH
uniform sampler2D u_dash_image;
uniform float u_mix;
uniform vec3 u_scale;
varying vec2 v_tex_a;
varying vec2 v_tex_b;
#endif

#ifdef RENDER_LINE_GRADIENT
uniform sampler2D u_gradient_image;
varying highp vec2 v_uv;
#endif

#pragma mapbox: define highp vec4 color
#pragma mapbox: define lowp float floorwidth
#pragma mapbox: define lowp vec4 dash_from
#pragma mapbox: define lowp vec4 dash_to
#pragma mapbox: define lowp float blur
#pragma mapbox: define lowp float opacity


#define saturate(_x) clamp(_x, 0., 1.)


void main() {
    #pragma mapbox: initialize highp vec4 color
    #pragma mapbox: initialize lowp float floorwidth
    #pragma mapbox: initialize lowp vec4 dash_from
    #pragma mapbox: initialize lowp vec4 dash_to
    #pragma mapbox: initialize lowp float blur
    #pragma mapbox: initialize lowp float opacity

    // Calculate the distance of the pixel from the line in pixels.
    float dist = length(v_normal) * v_width2.s;

    // Calculate the antialiasing fade factor. This is either when fading in
    // the line in case of an offset line (v_width2.t) or when fading out
    // (v_width2.s)
    float blur2 = (blur + 1.0 / u_device_pixel_ratio) * v_gamma_scale;
    float alpha = clamp(min(dist - (v_width2.t - blur2), v_width2.s - dist) / blur2, 0.0, 1.0);

#ifdef RENDER_LINE_DASH
    float sdfdist_a = texture2D(u_dash_image, v_tex_a).a;
    float sdfdist_b = texture2D(u_dash_image, v_tex_b).a;
    float sdfdist = mix(sdfdist_a, sdfdist_b, u_mix);
    float sdfwidth = min(dash_from.z * u_scale.y, dash_to.z * u_scale.z);
    float sdfgamma = 1.0 / (2.0 * u_device_pixel_ratio) / sdfwidth;
    alpha *= smoothstep(0.5 - sdfgamma / floorwidth, 0.5 + sdfgamma / floorwidth, sdfdist);
#endif

#ifdef RENDER_LINE_GRADIENT
    // For gradient lines, v_lineprogress is the ratio along the
    // entire line, the gradient ramp is stored in a texture.
    vec4 out_color = texture2D(u_gradient_image, v_uv);
#else

    vec4 out_color = color;
    if (blur == 0.0)
    {
        highp vec3 n = normalize(vec3(0.0, 0.0, 1.0));
        highp vec3 v = normalize(-v_position);
        // Adjust the light to match the shadows direction. Use a lower angle
        // to increase the specular effect when tilted
        highp vec3 l = normalize(vec3(-1., -1., 0.2));
        highp vec3 h = normalize(v + l);
        highp float NdotH = saturate(dot(n, h));
        highp vec3 specularTerm = pow(NdotH, 32.) * vec3(1.);
        // Just adding specular to the base color is enough to get the expected effect.
        out_color = vec4(specularTerm * 0.4 + color.rgb, 1.0);
    }
#endif

#ifdef FOG
    out_color = fog_dither(fog_apply_premultiplied(out_color, v_fog_pos));
#endif

#ifdef RENDER_LINE_ALPHA_DISCARD
    if (alpha < u_alpha_discard_threshold) {
        discard;
    }
#endif

    gl_FragColor = out_color * (alpha * opacity);

#ifdef OVERDRAW_INSPECTOR
    gl_FragColor = vec4(1.0);
#endif
}
