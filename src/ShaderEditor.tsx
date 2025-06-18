import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import vertex_shader_raw from "./shaders/vertex.vs?raw";
import fragment_shader_raw from "./shaders/fragment.fs?raw";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import "./ShaderEditor.css";

const ShaderEditorApp = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const meshRef = useRef<THREE.Mesh>();
  const materialRef = useRef<THREE.ShaderMaterial>();
  const animationIdRef = useRef<number>();

  const [vertexShader, setVertexShader] = useState(vertex_shader_raw);
  const [fragmentShader, setFragmentShader] = useState(fragment_shader_raw);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"vertex" | "fragment">("vertex");

  //Initialize threeJS
  useEffect(() => {
    if (!mountRef.current) return;

    //Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    mountRef.current.appendChild(renderer.domElement);

    //Lighting
    const ambientLight = new THREE.AmbientLight(0xf0f0f0, 10);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xff0000, 100);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    //Create default geometry
    const geometry = new THREE.TorusKnotGeometry(1, 0.3, 100, 16);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xffffff) },
      },
    });
    materialRef.current = material;
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;

    const animate = () => {
      if (sceneRef.current) {
        const currentTime = Date.now() * 0.001;
        sceneRef.current.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            child.material instanceof THREE.ShaderMaterial
          ) {
            if (child.material.uniforms && child.material.uniforms.uTime) {
              child.material.uniforms.uTime.value = currentTime;
            }
          }
        });
      }

      if (meshRef.current) {
        meshRef.current.rotation.x += 0.01;
        meshRef.current.rotation.y += 0.01;
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      animationIdRef.current = requestAnimationFrame(animate);
    };
    animate();

    //Resize
    const handleResize = () => {
      if (mountRef.current && renderer && camera) {
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    };
    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  //Load blender file
  const handleFileLoad = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsLoading(true);
      setError("");

      const cleanupExistingModel = () => {
        if (sceneRef.current && meshRef.current) {
          sceneRef.current.remove(meshRef.current);

          if (meshRef.current.geometry) {
            meshRef.current.geometry.dispose();
          }
          if (meshRef.current.material) {
            if (Array.isArray(meshRef.current.material)) {
              meshRef.current.material.forEach((material) =>
                material.dispose()
              );
            } else {
              meshRef.current.material.dispose();
            }
          }
        }
      };

      const applyCustomShader = (object: THREE.Object3D) => {
        const meshes: THREE.Mesh[] = [];
        try {
          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach((mat) => mat.dispose());
                } else {
                  child.material.dispose();
                }
              }
              const material = new THREE.ShaderMaterial({
                vertexShader,
                fragmentShader,
                uniforms: {
                  uTime: { value: 0 },
                  uColor: { value: new THREE.Color(0x00ff00) },
                },
                side: THREE.DoubleSide,
                transparent: false,
                depthTest: true,
                depthWrite: true,
              });
              child.material = material;
              meshes.push(child);
            }
          });

          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);

            const gl = rendererRef.current.getContext();
            if (gl) {
              const error = gl.getError();
              if (error !== gl.NO_ERROR) {
                throw new Error(
                  `Shader compilation failed (WEBGL Error): ${error}`
                );
              }
            }
          }

          if (meshes.length > 0) {
            meshRef.current = meshes[0];
          }
        } catch (err) {
          setError(
            "Failed to apply shader to loaded model: " + (err as Error).message
          );

          //Fall back
          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshPhongMaterial({
                color: 0x00ffff,
                side: THREE.DoubleSide,
              });
              meshes.push(child);
            }
          });

          if (meshes.length > 0) {
            meshRef.current = meshes[0];
          }
        }
      };

      const loader = new GLTFLoader();
      const fileUrl = URL.createObjectURL(file);
      loader.load(
        fileUrl,
        (gltf) => {
          cleanupExistingModel();
          sceneRef.current?.add(gltf.scene);

          if (sceneRef.current) {
            //Center and scale the model
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 2 / maxDim;

            gltf.scene.scale.setScalar(scale);
            gltf.scene.position.sub(center.multiplyScalar(scale));

            sceneRef.current.add(gltf.scene);
            applyCustomShader(gltf.scene);
          }

          URL.revokeObjectURL(fileUrl);
          setIsLoading(false);
          console.log("Model loaded and processed successfully");
        },
        (xhr) => {
          console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
        },
        function () {
          setError("Failed to load object file");
        }
      );
    },
    [vertexShader, fragmentShader]
  );

  //Update shaders
  const updateShaders = useCallback(() => {
    if (!meshRef.current || !sceneRef.current) return;
    try {
      setError(""); //Clear previous error

      const testMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: Date.now() * 0.001 },
          uColor: { value: new THREE.Color(0x00ff00) },
        },
      });

      //Create a test mesh to trigger shader compilation
      const testGeometry = new THREE.PlaneGeometry(1, 1);
      const testMesh = new THREE.Mesh(testGeometry, testMaterial);

      sceneRef.current.add(testMesh); // Add temporarily to trigger compilation error
      if (rendererRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      const gl = rendererRef.current?.getContext();
      if (gl) {
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
          sceneRef.current.remove(testMesh);
          testGeometry.dispose();
          testMaterial.dispose();
          throw new Error(`WebGL Error: ${error}`);
        }
      }
      sceneRef.current.remove(testMesh);
      testGeometry.dispose();
      testMaterial.dispose();

      const meshes: THREE.Mesh[] = [];
      sceneRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      });

      //Update all meshes with new shader material
      meshes.forEach((mesh) => {
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => mat.dispose());
          } else {
            mesh.material.dispose();
          }
        }

        const material = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: {
            uTime: { value: Date.now() * 0.001 },
            uColor: { value: new THREE.Color(0x00ff00) },
          },
        });

        mesh.material = material;
      });
    } catch (err) {
      setError("Shader compilation error: " + (err as Error).message);
    }
  }, [vertexShader, fragmentShader]);

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Left Panel - 3D Viewport */}
      <div className="w-1/2 flex flex-col border-r border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold mb-3">3D Viewport</h2>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".gltf,.glb,.obj,.fbx"
              onChange={handleFileLoad}
              className="block text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
            {isLoading && <span className="text-blue-400">Loading...</span>}
          </div>
        </div>
        <div className="flex-1 relative">
          <div
            ref={mountRef}
            className="w-full h-full"
            style={{ minHeight: "400px" }}
          />
        </div>
      </div>

      {/* Right Panel - Shader Editor */}
      <div className="w-1/2 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Shader Editor</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab("vertex")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "vertex"
                ? "bg-gray-800 text-green-400 border-b-2 border-green-400"
                : "text-gray-400 hover:text-green-300"
            }`}
          >
            Vertex Shader
          </button>
          <button
            onClick={() => setActiveTab("fragment")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "fragment"
                ? "bg-gray-800 text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-blue-300"
            }`}
          >
            Fragment Shader
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Shader Editor */}
          <textarea
            value={activeTab === "vertex" ? vertexShader : fragmentShader}
            onChange={(e) =>
              activeTab === "vertex"
                ? setVertexShader(e.target.value)
                : setFragmentShader(e.target.value)
            }
            className={`flex-1 p-3 bg-gray-800 font-mono text-sm resize-none border-none outline-none ${
              activeTab === "vertex" ? "text-green-300" : "text-blue-300"
            }`}
            style={{ fontFamily: "Consolas, Monaco, monospace" }}
            placeholder={`Enter ${activeTab} shader code here...`}
            spellCheck="false"
          />
        </div>

        {/* Bottom Panel */}
        <div className="p-4 bg-gray-800 border-t border-gray-700">
          <div className="flex justify-between items-start">
            <div className="flex-1 mr-4">
              {error && (
                <div className="p-2 bg-red-900 border border-red-600 rounded text-red-200 text-sm">
                  {error}
                </div>
              )}
            </div>
            <button
              onClick={updateShaders}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition-colors flex-shrink-0"
            >
              Update Shaders
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShaderEditorApp;
