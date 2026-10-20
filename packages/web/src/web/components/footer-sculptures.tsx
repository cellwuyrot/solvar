import { useEffect, useRef } from "react";
import * as THREE from "three";
export default function Sculptures() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
    camera.position.z = 12;
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffefcf, 4);
    light.position.set(4, 6, 8);
    scene.add(light);
    const meshes: THREE.Mesh[] = [];
    const colors = [0xb79a54, 0xb8ccbf, 0x263e5c, 0xacafb4, 0x645078];
    for (let i = 0; i < 9; i++) {
      const geo =
        i % 3 === 0
          ? new THREE.BoxGeometry(1.1, 1.1, 1.1)
          : i % 3 === 1
            ? new THREE.TorusGeometry(0.6, 0.18, 12, 36)
            : new THREE.IcosahedronGeometry(0.7);
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: colors[i % 5], metalness: 0.55, roughness: 0.35 }),
      );
      m.position.set(((i % 3) - 1) * 5 + (i % 2), Math.floor(i / 3) * 3 - 3, -2 - (i % 2));
      m.rotation.set(i, 0.4 * i, 0.2 * i);
      scene.add(m);
      meshes.push(m);
    }
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / r.width - 0.5;
      mouse.ty = (e.clientY - r.top) / r.height - 0.5;
    };
    window.addEventListener("mousemove", move);
    const resize = () => {
      if (!el.clientHeight) return;
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    let frame = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      if (!visible) return;
      mouse.x += (mouse.tx - mouse.x) * 0.035;
      mouse.y += (mouse.ty - mouse.y) * 0.035;
      meshes.forEach((m, i) => {
        if (!reduced) {
          m.rotation.y += 0.0015;
          m.rotation.x += 0.001;
          m.position.y = Math.floor(i / 3) * 3 - 3 + Math.sin(t * 0.0006 + i) * 0.2;
        }
      });
      camera.position.x = mouse.x * 1.4;
      camera.position.y = -mouse.y * 0.9;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("mousemove", move);
      meshes.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);
  return <div ref={ref} className="pointer-events-none absolute inset-0 opacity-30" aria-hidden />;
}
