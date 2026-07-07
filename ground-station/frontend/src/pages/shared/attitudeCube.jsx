import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { useSelector } from 'react-redux';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 3D attitude widget: the CubeSat model (converted from "Structure externe.STEP"
// to public/cubesat.glb) oriented live by the IMU quaternion (Quat_w/x/y/z).
//
// Rendering is ON-DEMAND: we only call renderer.render() while the model is
// actually moving (or just loaded/resized). Cesium already renders the globe
// continuously on the same page, so keeping a second always-on WebGL loop here
// starves the GPU — gating it keeps this widget near-idle when the attitude is
// steady.
//
// Convention: THREE.Quaternion is (x, y, z, w); the IMU sends (w, x, y, z).
// STEP/CAD models are usually Z-up while three.js is Y-up, so the model is
// stood upright with MODEL_ROT_X (tweak if it still looks lying down / rolled).

const MODEL_URL = '/cubesat.glb';
// Rest orientation applied to the model before the IMU quaternion (Euler radians,
// XYZ order). Rz(-90°) brings the CubeSat "head" onto -Y (down / opposite the
// green Y axis, i.e. nadir-facing). If the head ends up the wrong way, tweak this.
const MODEL_EULER = [0, 0, -Math.PI / 2];
const HEADER = '#5cc8ff';
const BORDER = '#1d2430';
const BG = '#050a0f';
const mono = { fontFamily: 'Consolas, "Courier New", monospace' };

function lastQuat(state) {
    const d = state.telemetry?.telemetryData;
    return d && d.length ? d[d.length - 1] : null;
}

export function AttitudeCube() {
    // Primitive selectors → re-render only when a quaternion component changes.
    const qw = useSelector((s) => Number(lastQuat(s)?.Quat_w ?? 1));
    const qx = useSelector((s) => Number(lastQuat(s)?.Quat_x ?? 0));
    const qy = useSelector((s) => Number(lastQuat(s)?.Quat_y ?? 0));
    const qz = useSelector((s) => Number(lastQuat(s)?.Quat_z ?? 0));
    const hasData = useSelector((s) => (s.telemetry?.telemetryData?.length ?? 0) > 0);

    const mountRef = useRef(null);
    const targetQ = useRef(new THREE.Quaternion());
    const invalidate = useRef(true); // request at least one render

    // Build the Three.js scene once and load the CubeSat model.
    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return undefined;
        let disposed = false;
        const disposables = [];

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
        camera.position.set(2.6, 1.9, 2.6);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        const canvas = renderer.domElement;
        mount.appendChild(canvas);
        // Don't let a GPU context loss (e.g. Cesium + this sharing the GPU) spam
        // uncaught errors — swallow it and re-request a render on restore.
        const onLost = (e) => { e.preventDefault(); };
        const onRestored = () => { invalidate.current = true; };
        canvas.addEventListener('webglcontextlost', onLost, false);
        canvas.addEventListener('webglcontextrestored', onRestored, false);

        scene.add(new THREE.AmbientLight(0xffffff, 0.85));
        const key = new THREE.DirectionalLight(0xffffff, 0.9);
        key.position.set(3, 5, 4);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
        fill.position.set(-4, -2, -3);
        scene.add(fill);

        const grid = new THREE.GridHelper(5, 10, 0x2a3a4a, 0x16202c);
        grid.position.y = -1.4;
        scene.add(grid);
        disposables.push(grid.geometry, grid.material);

        // Pivot rotated by the IMU quaternion; the upright + centred + scaled model
        // lives inside so the quaternion rotates it about its own centre.
        const pivot = new THREE.Group();
        scene.add(pivot);
        const axes = new THREE.AxesHelper(1.1);
        pivot.add(axes);
        disposables.push(axes.geometry, axes.material);

        new GLTFLoader().load(
            MODEL_URL,
            (gltf) => {
                if (disposed) return;
                const model = gltf.scene;
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());
                model.position.sub(center);
                const holder = new THREE.Group();
                holder.scale.setScalar(1.5 / (Math.max(size.x, size.y, size.z) || 1));
                holder.rotation.set(MODEL_EULER[0], MODEL_EULER[1], MODEL_EULER[2]);
                holder.add(model);
                pivot.add(holder);
                model.traverse((o) => {
                    if (o.isMesh) {
                        disposables.push(o.geometry);
                        if (Array.isArray(o.material)) disposables.push(...o.material);
                        else if (o.material) disposables.push(o.material);
                    }
                });
                invalidate.current = true; // draw the freshly loaded model
            },
            undefined,
            (err) => console.warn('CubeSat model load failed', err),
        );

        const resize = () => {
            const w = mount.clientWidth || 1;
            const h = mount.clientHeight || 1;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            invalidate.current = true;
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(mount);

        let raf = 0;
        const animate = () => {
            raf = requestAnimationFrame(animate);
            const cur = pivot.quaternion;
            // 1 - |dot| is the angular distance to the target (0 when aligned).
            const moving = 1 - Math.abs(cur.dot(targetQ.current)) > 1e-6;
            if (invalidate.current || moving) {
                cur.slerp(targetQ.current, 0.2);
                renderer.render(scene, camera);
                if (!moving) invalidate.current = false;
            }
        };
        animate();

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            ro.disconnect();
            canvas.removeEventListener('webglcontextlost', onLost);
            canvas.removeEventListener('webglcontextrestored', onRestored);
            disposables.forEach((d) => d?.dispose?.());
            renderer.dispose();
            if (canvas.parentNode === mount) mount.removeChild(canvas);
        };
    }, []);

    // Feed the latest quaternion to the animation loop (guard a zero-norm quat).
    useEffect(() => {
        const q = new THREE.Quaternion(qx, qy, qz, qw);
        if (q.lengthSq() < 1e-6) q.set(0, 0, 0, 1);
        q.normalize();
        targetQ.current.copy(q);
        invalidate.current = true;
    }, [qw, qx, qy, qz]);

    return (
        <Paper sx={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            borderRadius: 1, overflow: 'hidden', bgcolor: BG, border: `1px solid ${BORDER}`,
        }}>
            <Box sx={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1, py: 0.25, borderBottom: `1px solid ${BORDER}`,
            }}>
                <Typography sx={{ ...mono, fontSize: 10, fontWeight: 700, color: HEADER, lineHeight: 1 }}>
                    ATTITUDE — IMU
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Box sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: hasData ? '#59d98b' : '#ffcc66',
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                }} />
            </Box>

            <Box ref={mountRef} sx={{ flex: 1, minHeight: 0, position: 'relative' }} />

            <Box sx={{ flexShrink: 0, px: 1, py: 0.25, borderTop: `1px solid ${BORDER}` }}>
                <Typography sx={{ ...mono, fontSize: 9, color: '#8a97a8', lineHeight: 1.4 }}>
                    q = [{qw.toFixed(3)}, {qx.toFixed(3)}, {qy.toFixed(3)}, {qz.toFixed(3)}]
                </Typography>
            </Box>
        </Paper>
    );
}
