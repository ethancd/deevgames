// Shared three.js viewer for the Muju physical-set gallery and render script.
// Loads the exported GLB meshes (actual model geometry) and places them with
// the 4x4 matrices from assemblies/assemblies.json. Model frame is Z-up mm.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/addons/GLTFLoader.js';
import { OrbitControls } from './vendor/addons/OrbitControls.js';
import { RoomEnvironment } from './vendor/addons/RoomEnvironment.js';

export const ROOT = '../'; // gallery/ lives beside models/, assemblies/, manifest.json

const loader = new GLTFLoader();
const geomCache = new Map();

export function loadMesh(url) {
  if (!geomCache.has(url)) {
    geomCache.set(url, loader.loadAsync(ROOT + url).then(g => {
      let mesh = null;
      g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
      const m = mesh.material;
      let material = m;
      if (url.includes('@crystal')) {
        material = new THREE.MeshPhysicalMaterial({ color: m.color, roughness: 0.12, metalness: 0,
          transmission: 0.72, thickness: 4, ior: 1.52, transparent: true, opacity: 0.95, attenuationColor: new THREE.Color('#3fb7b0'), attenuationDistance: 9 });
      } else if (url.includes('@metal')) {
        material = new THREE.MeshStandardMaterial({ color: m.color, metalness: 0.7, roughness: 0.34 });
      } else {
        material = new THREE.MeshStandardMaterial({ color: m.color, metalness: m.metalness ?? 0, roughness: m.roughness ?? 0.6 });
      }
      mesh.geometry.computeVertexNormals();
      return { geometry: mesh.geometry, material };
    }));
  }
  return geomCache.get(url);
}

export function mat4(list) {
  const m = new THREE.Matrix4();
  m.set(...list); // row-major, as written by assemblies.py
  return m;
}

export class Viewer {
  constructor(canvas, { background = '#eceae6', preserve = false, still = false } = {}) {
    this.still = still;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: preserve });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 8000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !still;
    if (!still) this.controls.addEventListener('change', () => this.requestRender());
    const hemi = new THREE.HemisphereLight('#ffffff', '#8a8578', 0.45);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffffff', 1.5);
    key.position.set(-300, 700, 450);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    this.key = key;
    this.scene.add(key, key.target);
    const fill = new THREE.DirectionalLight('#fff4e8', 0.35);
    fill.position.set(400, 300, -300);
    this.scene.add(fill);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.18 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    // Model frame (Z-up) -> three (Y-up)
    this.root = new THREE.Group();
    this.root.rotation.x = -Math.PI / 2;
    this.scene.add(this.root);
    this.labels = [];
    this.clipPlane = null;
    this._pending = false;
    if (!still) new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  requestRender() {
    if (this._pending || this.still) return;
    this._pending = true;
    requestAnimationFrame(() => { this._pending = false; this.controls.update(); this.renderer.render(this.scene, this.camera); this.onRender?.(); });
  }

  renderNow() { this.controls.update(); this.renderer.render(this.scene, this.camera); this.onRender?.(); }

  clear() {
    this.root.clear();
    this.labels = [];
  }

  setClip(on, y = 0) {
    this.clipPlane = on ? new THREE.Plane(new THREE.Vector3(0, 0, -1), y) : null; // world: three z = -model y
    this.root.traverse(o => { if (o.isMesh || o.isInstancedMesh) { o.material.clippingPlanes = this.clipPlane ? [this.clipPlane] : []; o.material.clipShadows = true; o.material.side = this.clipPlane ? THREE.DoubleSide : THREE.FrontSide; o.material.needsUpdate = true; } });
    this.requestRender();
  }

  /** items: [{glb, matrix(list16), label?, explode_dz?}] ; repeated glbs are instanced. */
  async add(items, { explode = 0, group = this.root } = {}) {
    const byUrl = new Map();
    for (const it of items) {
      if (!byUrl.has(it.glb)) byUrl.set(it.glb, []);
      byUrl.get(it.glb).push(it);
    }
    const out = [];
    for (const [url, list] of byUrl) {
      const { geometry, material } = await loadMesh(url);
      const mat = material.clone();
      if (list.length > 6) {
        const im = new THREE.InstancedMesh(geometry, mat, list.length);
        list.forEach((it, i) => im.setMatrixAt(i, mat4(it.matrix)));
        im.castShadow = im.receiveShadow = true;
        group.add(im);
        out.push(im);
      } else {
        for (const it of list) {
          const mesh = new THREE.Mesh(geometry, mat);
          const m = mat4(it.matrix);
          if (explode && it.explode_dz) m.premultiply(new THREE.Matrix4().makeTranslation(0, 0, it.explode_dz * explode));
          mesh.applyMatrix4(m);
          mesh.castShadow = mesh.receiveShadow = true;
          mesh.userData = { label: it.label, part: it.part };
          group.add(mesh);
          if (it.label) this.labels.push(mesh);
          out.push(mesh);
        }
      }
    }
    this.setClip(!!this.clipPlane);
    return out;
  }

  /** Frame the loaded content. dir: camera direction in three coords. */
  frame({ dir = [0.9, 0.75, 1.25], pad = 1.15, fov = 30, target = null } = {}) {
    const box = new THREE.Box3().setFromObject(this.root);
    const size = box.getSize(new THREE.Vector3());
    const center = target ? new THREE.Vector3(...target) : box.getCenter(new THREE.Vector3());
    const radius = size.length() / 2;
    this.camera.fov = fov;
    const dist = radius * pad / Math.sin(THREE.MathUtils.degToRad(fov / 2)) * (this.camera.aspect < 1 ? 1 / this.camera.aspect : 1);
    const d = new THREE.Vector3(...dir).normalize();
    this.camera.position.copy(center).addScaledVector(d, dist);
    this.camera.near = Math.max(0.5, dist / 100);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.home = { pos: this.camera.position.clone(), target: center.clone() };
    const g = Math.max(size.x, size.z) * 4 + 200;
    this.ground.scale.set(g, g, 1);
    this.ground.position.set(center.x, box.min.y - 0.02, center.z);
    this.key.position.set(center.x - radius * 1.2, center.y + radius * 3, center.z + radius * 1.8);
    this.key.target.position.copy(center);
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -radius * 1.6; sc.right = sc.top = radius * 1.6; sc.near = 1; sc.far = radius * 8;
    sc.updateProjectionMatrix();
    this.requestRender();
  }

  resetCamera() {
    if (!this.home) return;
    this.camera.position.copy(this.home.pos);
    this.controls.target.copy(this.home.target);
    this.requestRender();
  }

  /** Screen positions of labelled meshes (for HTML overlays). */
  labelPositions() {
    const r = this.canvas.getBoundingClientRect();
    return this.labels.map(m => {
      const b = new THREE.Box3().setFromObject(m);
      const c = b.getCenter(new THREE.Vector3());
      c.x = b.max.x;
      const p = c.project(this.camera);
      return { label: m.userData.label, x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height };
    });
  }
}
