#pragma mapbox: define highp vec4 color
#pragma mapbox: define lowp float opacity

uniform float u_specular_intensity;
uniform vec3 u_specular_lightcolor;
varying vec3 v_position;
#define saturate(_x) clamp(_x, 0., 1.)
void main() {
    #pragma mapbox: initialize highp vec4 color
    #pragma mapbox: initialize lowp float opacity

  //  vec4 out_color = color;

    highp vec3 n = normalize(vec3(0.0, 0.0, 1.0));
    highp vec3 v = normalize(-v_position);
    // Adjust the light to match the shadows direction. Use a lower angle
    // to increase the specular effect when tilted
    highp vec3 l = normalize(vec3(-1., -1., 0.2));
    highp vec3 h = normalize(v + l);
    highp float NdotH = saturate(dot(n, h));
    highp vec3 specularTerm = pow(NdotH, 32.) * u_specular_lightcolor;
    // Just adding a bit of specular to the base color is enough to get the expected effect.
    vec4 out_color = vec4(specularTerm * u_specular_intensity + color.rgb, 1.0);

#ifdef FOG
    out_color = fog_dither(fog_apply_premultiplied(out_color, v_fog_pos));
#endif

    gl_FragColor = out_color * opacity;

#ifdef OVERDRAW_INSPECTOR
    gl_FragColor = vec4(1.0);
#endif
}
