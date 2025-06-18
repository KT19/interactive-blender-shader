uniform float uTime;

varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vPosition;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    vPosition = position;

    vec3 pos = position;
    pos.z += sin(pos.x * 2.0 + uTime) * 0.1; //Add some wave

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}