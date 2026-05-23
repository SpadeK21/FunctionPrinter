import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('canvas3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b12);
scene.fog = new THREE.FogExp2(0x050b12, 0.012);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
camera.position.set(5, 4, 6);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 1.2;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;

const axesHelper = new THREE.AxesHelper(4);
scene.add(axesHelper);

const gridHelper = new THREE.GridHelper(10, 30, 0x88aaff, 0x335588);
gridHelper.position.y = -0.01;
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.3;
scene.add(gridHelper);

const ambient = new THREE.AmbientLight(0x404060);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(2, 5, 3);
dirLight.castShadow = true;
scene.add(dirLight);

const fillLight = new THREE.PointLight(0x4466cc, 0.4);
fillLight.position.set(-2, 2, 3);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0xffaa66, 0.3);
rimLight.position.set(1, 2, -3);
scene.add(rimLight);

const starGeo = new THREE.BufferGeometry();
const starCount = 1200;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
    starPos[i*3] = (Math.random() - 0.5) * 300;
    starPos[i*3+1] = (Math.random() - 0.5) * 150;
    starPos[i*3+2] = (Math.random() - 0.5) * 100 - 50;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.6 }));
scene.add(stars);

let currentObject = null;
let currentMode = 'implicit';



function compileExpr(expr, params) {
    let formula = expr.replace(/\^/g, '**');
    // 添加 Math. 前缀
    formula = formula.replace(/sin\(/g, 'Math.sin(');
    formula = formula.replace(/cos\(/g, 'Math.cos(');
    formula = formula.replace(/tan\(/g, 'Math.tan(');
    formula = formula.replace(/exp\(/g, 'Math.exp(');
    formula = formula.replace(/log\(/g, 'Math.log(');
    formula = formula.replace(/sqrt\(/g, 'Math.sqrt(');
    formula = formula.replace(/abs\(/g, 'Math.abs(');
    // 处理常数 pi
    formula = formula.replace(/pi/g, 'Math.PI');
    try {
        const fn = new Function(...params, 'return ' + formula);
        return fn;
    } catch(e) {
        console.warn("编译错误:", expr, e);
        return null;
    }
}

// ========== 隐函数 ==========
function evaluateImplicit(expr, x, y, z) {
    let formula = expr.replace(/\^/g, '**');
    if (formula.includes('=')) {
        let parts = formula.split('=');
        formula = `(${parts[0]}) - (${parts[1]})`;
    }
    try {
        const fn = new Function('x', 'y', 'z', 'return ' + formula);
        return fn(x, y, z);
    } catch(e) {
        return NaN;
    }
}

function generateImplicit(equation) {
    const range = 3.5;
    const step = 0.12;
    const threshold = 0.1;
    const points = [];
    const colors = [];
    
    for (let x = -range; x <= range; x += step) {
        for (let y = -range; y <= range; y += step) {
            for (let z = -range; z <= range; z += step) {
                let formula = equation.replace(/\^/g, '**');
                if (formula.includes('=')) {
                    let parts = formula.split('=');
                    formula = `(${parts[0]}) - (${parts[1]})`;
                }
                let val;
                try {
                    const fn = new Function('x', 'y', 'z', 'return ' + formula);
                    val = fn(x, y, z);
                } catch(e) {
                    val = NaN;
                }
                if (Math.abs(val) < threshold && isFinite(val)) {
                    points.push(new THREE.Vector3(x, y, z));
                    const r = 0.3 + Math.sin(x * 1.5) * 0.3;
                    const g = 0.4 + Math.cos(z * 1.5) * 0.3;
                    const b = 0.6 + Math.sin(y * 1.5) * 0.3;
                    colors.push(new THREE.Color(r, g, b));
                }
            }
        }
    }
    
    if (points.length === 0) {
        console.log('No points found');
        return null;
    }
    
    const geometry = new THREE.BufferGeometry();
    const vertices = points.flatMap(v => [v.x, v.y, v.z]);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    const colorArray = colors.flatMap(c => [c.r, c.g, c.b]);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colorArray), 3));
    const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
    return new THREE.Points(geometry, material);
}

// ========== 参数曲线 ==========
function generateCurve(xExpr, yExpr, zExpr) {
    const tMin = -4, tMax = 4;
    const step = 0.08;
    const fnX = compileExpr(xExpr, ['t']);
    const fnY = compileExpr(yExpr, ['t']);
    const fnZ = compileExpr(zExpr, ['t']);
    if (!fnX || !fnY || !fnZ) return null;
    
    const points = [];
    for (let t = tMin; t <= tMax; t += step) {
        try {
            const x = fnX(t), y = fnY(t), z = fnZ(t);
            if (isFinite(x) && isFinite(y) && isFinite(z) && Math.abs(x) < 10 && Math.abs(y) < 10 && Math.abs(z) < 10) {
                points.push(new THREE.Vector3(x, y, z));
            }
        } catch(e) {}
    }
    if (points.length < 2) return null;
    
    const geometry = new THREE.BufferGeometry();
    const vertices = points.flatMap(v => [v.x, v.y, v.z]);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    
    const colors = points.map((v, i) => {
        const t = i / points.length;
        return new THREE.Color(t, 0.3 + t * 0.5, 1 - t);
    });
    const colorArray = colors.flatMap(c => [c.r, c.g, c.b]);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colorArray), 3));
    
    const material = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 });
    const line = new THREE.Line(geometry, material);
    
    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    const pointMat = new THREE.PointsMaterial({ color: 0xffaa44, size: 0.06 });
    const pointsObj = new THREE.Points(pointGeo, pointMat);
    
    const group = new THREE.Group();
    group.add(line);
    group.add(pointsObj);
    return group;
}

// ========== 参数曲面 ==========
function generateSurface(xExpr, yExpr, zExpr) {
    const uMin = -2.5, uMax = 2.5;
    const vMin = 0, vMax = 2 * Math.PI;
    const uStep = 0.12, vStep = 0.1;
    const fnX = compileExpr(xExpr, ['u', 'v']);
    const fnY = compileExpr(yExpr, ['u', 'v']);
    const fnZ = compileExpr(zExpr, ['u', 'v']);
    if (!fnX || !fnY || !fnZ) return null;
    
    const points = [];
    const colors = [];
    for (let u = uMin; u <= uMax; u += uStep) {
        for (let v = vMin; v <= vMax; v += vStep) {
            try {
                const x = fnX(u, v), y = fnY(u, v), z = fnZ(u, v);
                if (isFinite(x) && isFinite(y) && isFinite(z) && Math.abs(x) < 8 && Math.abs(y) < 8 && Math.abs(z) < 8) {
                    points.push(new THREE.Vector3(x, y, z));
                    const r = 0.4 + Math.sin(u * 1.5) * 0.3;
                    const g = 0.5 + Math.cos(v * 1.5) * 0.3;
                    const b = 0.6 + Math.sin((u + v) * 1.5) * 0.3;
                    colors.push(new THREE.Color(r, g, b));
                }
            } catch(e) {}
        }
    }
    if (points.length === 0) return null;
    
    const geometry = new THREE.BufferGeometry();
    const vertices = points.flatMap(v => [v.x, v.y, v.z]);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    const colorArray = colors.flatMap(c => [c.r, c.g, c.b]);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colorArray), 3));
    const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
    return new THREE.Points(geometry, material);
}

// ========== UI 事件 ==========
function clearCurrent() {
    if (currentObject) {
        scene.remove(currentObject);
        if (currentObject.geometry) currentObject.geometry.dispose();
        if (currentObject.material) currentObject.material.dispose();
        currentObject = null;
    }
}


function updateImplicit() {
    const eq = document.getElementById('equationInput').value.trim();
    if (!eq) return;
    clearCurrent();
    const obj = generateImplicit(eq);
    if (obj) {
        currentObject = obj;
        scene.add(currentObject);
    } else {
        alert('未检测到曲面，请尝试其他方程');
    }
}

function updateCurve() {
    const xEq = document.getElementById('curveX').value.trim();
    const yEq = document.getElementById('curveY').value.trim();
    const zEq = document.getElementById('curveZ').value.trim();
    if (!xEq || !yEq || !zEq) return;
    clearCurrent();
    const obj = generateCurve(xEq, yEq, zEq);
    if (obj) {
        currentObject = obj;
        scene.add(currentObject);
    } else {
        alert('曲线生成失败');
    }
}

function updateSurfaceParam() {
    const xEq = document.getElementById('surfaceX').value.trim();
    const yEq = document.getElementById('surfaceY').value.trim();
    const zEq = document.getElementById('surfaceZ').value.trim();
    if (!xEq || !yEq || !zEq) return;
    clearCurrent();
    const obj = generateSurface(xEq, yEq, zEq);
    if (obj) {
        currentObject = obj;
        scene.add(currentObject);
    } else {
        alert('曲面生成失败');
    }
}

document.getElementById('generateImplicitBtn').addEventListener('click', updateImplicit);
document.getElementById('generateCurveBtn').addEventListener('click', updateCurve);
document.getElementById('generateSurfaceBtn').addEventListener('click', updateSurfaceParam);

const implicitArea = document.getElementById('implicitArea');
const curveArea = document.getElementById('curveArea');
const surfaceArea = document.getElementById('surfaceArea');
const modeBtns = document.querySelectorAll('.mode-btn');

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.getAttribute('data-mode');
        
        implicitArea.classList.add('hidden');
        curveArea.classList.add('hidden');
        surfaceArea.classList.add('hidden');
        
        if (currentMode === 'implicit') implicitArea.classList.remove('hidden');
        else if (currentMode === 'curve') curveArea.classList.remove('hidden');
        else if (currentMode === 'surface') surfaceArea.classList.remove('hidden');
    });
});

const panel = document.getElementById('viewerPanel');
const fullBtn = document.getElementById('fullscreenBtn');

fullBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        panel.requestFullscreen();
        panel.classList.add('fullscreen');
        fullBtn.textContent = 'EXIT';
        setTimeout(() => {
            renderer.setSize(window.innerWidth, window.innerHeight);
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }, 100);
    } else {
        document.exitFullscreen();
        panel.classList.remove('fullscreen');
        fullBtn.textContent = 'FULL';
        setTimeout(() => {
            const canvas = document.getElementById('canvas3d');
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }, 100);
    }
});

document.addEventListener('fullscreenchange', () => {
    const canvas = document.getElementById('canvas3d');
    if (!document.fullscreenElement) {
        panel.classList.remove('fullscreen');
        fullBtn.textContent = 'FULL';
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    } else {
        panel.classList.add('fullscreen');
        fullBtn.textContent = 'EXIT';
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
});

document.getElementById('resetViewBtn').addEventListener('click', () => {
    camera.position.set(5, 4, 6);
    controls.target.set(0, 0, 0);
    controls.update();
});

const symbols = ['x^', 'y^', 'z^', 't', 'u', 'v', '+', '-', '*', '/', '^', '=', 'sqrt()', 'sin()', 'cos()', 'tan()', 'log()', 'exp()', 'abs()', 'pi'];
const container = document.getElementById('mathButtons');
symbols.forEach(sym => {
    const btn = document.createElement('button');
    btn.className = 'math-btn';
    btn.textContent = sym;
    btn.addEventListener('click', () => {
        let input;
        if (currentMode === 'implicit') input = document.getElementById('equationInput');
        else if (currentMode === 'curve') input = document.activeElement;
        else input = document.activeElement;
        
        if (!input || !input.classList || (!input.classList.contains('param-input') && !input.classList.contains('equation-input'))) {
            if (currentMode === 'implicit') input = document.getElementById('equationInput');
            else if (currentMode === 'curve') input = document.getElementById('curveX');
            else input = document.getElementById('surfaceX');
        }
        const start = input.selectionStart;
        const val = input.value;
        input.value = val.slice(0, start) + sym + val.slice(start);
        input.focus();
        input.setSelectionRange(start + sym.length, start + sym.length);
    });
    container.appendChild(btn);
});

const toggleBtn = document.getElementById('helperToggle');
const helperCont = document.getElementById('helperContent');
let helperOpen = false;
toggleBtn.addEventListener('click', () => {
    helperOpen = !helperOpen;
    helperCont.classList.toggle('open');
    toggleBtn.innerHTML = helperOpen ? 'MATH SYMBOLS ▲' : 'MATH SYMBOLS ▼';
});

function resizeRenderer() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => resizeRenderer());
setTimeout(() => resizeRenderer(), 100);

setTimeout(() => {
    updateImplicit();
    resizeRenderer();
}, 200);

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    stars.rotation.y += 0.0003;
    stars.rotation.x += 0.0002;
    renderer.render(scene, camera);
}
animate();