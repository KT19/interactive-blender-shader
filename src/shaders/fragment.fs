uniform float uTime;
uniform vec3 uColor;

varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vPosition;

void main() {
    vec3 baseColor = uColor;
    float wave = cos(vPosition.x * 3.0 + uTime) * 0.5 + 0.5;

    //Lighting
    vec3 light = normalize(vec3(0.0, 1.0, 0.0));
    float NdotL = max(dot(vNormal, light), 0.0);

    vec3 finalColor = baseColor * (NdotL * 0.7 + 0.3) * wave;
    gl_FragColor = vec4(finalColor, 1.0);
}
