uniform lowp float u_device_pixel_ratio;
uniform float u_alpha_discard_threshold;
uniform highp vec2 u_trim_offset;

uniform vec3 u_ambient_color;
uniform vec3 u_sun_color;
uniform vec3 u_sun_dir;
uniform vec3 u_cam_fwd;

varying vec2 v_width2;
varying vec2 v_normal;
varying float v_gamma_scale;
varying highp vec4 v_uv;

#ifdef RENDER_LINE_DASH
uniform sampler2D u_dash_image;

uniform float u_mix;
uniform vec3 u_scale;
varying vec2 v_tex_a;
varying vec2 v_tex_b;
#endif

#ifdef RENDER_LINE_GRADIENT
uniform sampler2D u_gradient_image;
#endif

#ifdef DEPTH_OCCLUSION
uniform sampler2D u_depth;
uniform float u_depth_occlusion_factor;

varying vec4 v_projected_pos;

float depth_occlusion_visibility(vec4 frag) {
    vec3 coord = frag.xyz / frag.w;
    vec2 uv = 0.5 * coord.xy + 0.5;
    float buffer_depth = unpack_depth(texture2D(u_depth, uv));
    float occlusion = step(buffer_depth, coord.z);
    return 1.0 - occlusion * u_depth_occlusion_factor;
}
#endif

uniform float u_border_width;
uniform vec4 u_border_color;
float luminance(vec3 c) {
    // Digital ITU BT.601 (Y = 0.299 R + 0.587 G + 0.114 B) approximation
    return (c.r + c.r + c.b + c.g + c.g + c.g) * 0.1667;
}

#pragma mapbox: define highp vec4 color
#pragma mapbox: define lowp float floorwidth
#pragma mapbox: define lowp vec4 dash_from
#pragma mapbox: define lowp vec4 dash_to
#pragma mapbox: define lowp float blur
#pragma mapbox: define lowp float opacity
#pragma mapbox: define lowp float emissive_strength
#pragma mapbox: define highp vec4 emissive_color

void main() {
    #pragma mapbox: initialize highp vec4 color
    #pragma mapbox: initialize lowp float floorwidth
    #pragma mapbox: initialize lowp vec4 dash_from
    #pragma mapbox: initialize lowp vec4 dash_to
    #pragma mapbox: initialize lowp float blur
    #pragma mapbox: initialize lowp float opacity
    #pragma mapbox: initialize lowp float emissive_strength
    #pragma mapbox: initialize highp vec4 emissive_color

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
    // For gradient lines, v_uv.xy are the coord specify where the texture will be simpled.
    highp vec4 out_color = texture2D(u_gradient_image, v_uv.xy);
#else
    vec4 out_color = color;
#endif

#ifdef RENDER_LINE_TRIM_OFFSET
    // v_uv[2] and v_uv[3] are specifying the original clip range that the vertex is located in.
    highp float start = v_uv[2];
    highp float end = v_uv[3];
    highp float trim_start = u_trim_offset[0];
    highp float trim_end = u_trim_offset[1];
    // v_uv.x is the relative prorgress based on each clip. Calculate the absolute progress based on
    // the whole line by combining the clip start and end value.
    highp float line_progress = (start + (v_uv.x) * (end - start));
    // Mark the pixel to be transparent when:
    // 1. trim_offset range is valid
    // 2. line_progress is within trim_offset range

    // Nested conditionals fixes the issue
    // https://github.com/mapbox/mapbox-gl-js/issues/12013
    if (trim_end > trim_start) {
        if (line_progress <= trim_end && line_progress >= trim_start) {
            out_color = vec4(0, 0, 0, 0);
        }
    }
#endif
    out_color = mix(lighting_model(out_color, u_ambient_color, u_sun_color, u_sun_dir, u_cam_fwd), out_color * emissive_color, emissive_strength);
#ifdef FOG
    out_color = fog_dither(fog_apply_premultiplied(out_color, v_fog_pos));
#endif

#ifdef RENDER_LINE_ALPHA_DISCARD
    if (alpha < u_alpha_discard_threshold) {
        discard;
    }
#endif

#ifdef RENDER_LINE_BORDER
    float edgeBlur = (u_border_width + 1.0 / u_device_pixel_ratio);
    float alpha2 = clamp(min(dist - (v_width2.t - edgeBlur), v_width2.s - dist) / edgeBlur, 0.0, 1.0);
    if (alpha2 < 1.) {
        float smoothAlpha = smoothstep(0.6, 1.0, alpha2);
#ifdef RENDER_LINE_BORDER_AUTO
        float Y = (out_color.a > 0.01) ? luminance(out_color.rgb / out_color.a) : 1.; // out_color is premultiplied
        float adjustment = (Y > 0.) ? 0.5 / Y : 0.45;
        if (out_color.a > 0.25 && Y < 0.25) {
            vec3 borderColor = (Y > 0.) ? out_color.rgb : vec3(1, 1, 1) * out_color.a;
            out_color.rgb = out_color.rgb + borderColor * (adjustment * (1.0 - smoothAlpha));
        } else {
            out_color.rgb *= (0.6  + 0.4 * smoothAlpha);
        }
#else  // use user-provided border color
        out_color.rgb = mix(u_border_color.rgb, out_color.rgb, smoothAlpha);
#endif // RENDER_LINE_BORDER_AUTO
    }
#endif

#ifdef DEPTH_OCCLUSION
    alpha *= depth_occlusion_visibility(v_projected_pos);
#endif

    gl_FragColor = out_color * (alpha * opacity);

#ifdef OVERDRAW_INSPECTOR
    gl_FragColor = vec4(1.0);
#endif
}
