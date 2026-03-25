/**
 * EcoTrack 3D Engine (Three.js)
 * Implements interactive 3D Earth and background effects.
 */

const ThreeEngine = (() => {
    let scene, camera, renderer, earth, particles;
    let isInitialized = false;

    function init() {
        if (isInitialized) return;
        
        const container = document.body;
        scene = new THREE.Scene();
        
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 5;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.domElement.style.position = 'fixed';
        renderer.domElement.style.top = '0';
        renderer.domElement.style.left = '0';
        renderer.domElement.style.zIndex = '-1';
        renderer.domElement.style.pointerEvents = 'none';
        container.appendChild(renderer.domElement);

        // 1. LIGHTING
        const ambientLight = new THREE.AmbientLight(0xffffffff, 0.6);
        scene.add(ambientLight);
        const pointLight = new THREE.PointLight(0x22c55e, 1.5);
        pointLight.position.set(5, 5, 5);
        scene.add(pointLight);

        // 2. EARTH (Stylized Low-poly or Glowing)
        const earthGroup = new THREE.Group();
        const geometry = new THREE.IcosahedronGeometry(1.5, 2);
        const material = new THREE.MeshPhongMaterial({
            color: 0x16a34a,
            wireframe: true,
            transparent: true,
            opacity: 0.3,
        });
        const oceanGeom = new THREE.SphereGeometry(1.45, 32, 32);
        const oceanMat = new THREE.MeshPhongMaterial({
            color: 0x1e3a8a,
            transparent: true,
            opacity: 0.1,
        });
        
        earth = new THREE.Mesh(geometry, material);
        const ocean = new THREE.Mesh(oceanGeom, oceanMat);
        
        earthGroup.add(earth);
        earthGroup.add(ocean);
        scene.add(earthGroup);
        
        // Glow effect
        const glowGeom = new THREE.SphereGeometry(1.6, 32, 32);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x22c55e,
            transparent: true,
            opacity: 0.05,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        earthGroup.add(glow);

        // 3. PARTICLES
        const pGeom = new THREE.BufferGeometry();
        const pCount = 200;
        const coords = [];
        for (let i = 0; i < pCount; i++) {
            coords.push((Math.random() - 0.5) * 20);
            coords.push((Math.random() - 0.5) * 20);
            coords.push((Math.random() - 0.5) * 20);
        }
        pGeom.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
        const pMat = new THREE.PointsMaterial({ color: 0x22c55e, size: 0.05, transparent: true, opacity: 0.4 });
        particles = new THREE.Points(pGeom, pMat);
        scene.add(particles);

        // Handle Resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Mouse Parallax
        let mouseX = 0, mouseY = 0;
        window.addEventListener('mousemove', (e) => {
            mouseX = (e.clientX / window.innerWidth) - 0.5;
            mouseY = (e.clientY / window.innerHeight) - 0.5;
        });

        function animate() {
            requestAnimationFrame(animate);
            
            earth.rotation.y += 0.005;
            earth.rotation.x += 0.002;
            
            particles.rotation.y += 0.001;
            
            // Subtle parallax
            const targetX = mouseX * 2;
            const targetY = -mouseY * 2;
            earthGroup.position.x += (targetX - earthGroup.position.x) * 0.05;
            earthGroup.position.y += (targetY - earthGroup.position.y) * 0.05;
            
            // Adjust visibility based on section
            const activeSection = document.querySelector('.tab-pane.active')?.id;
            if (activeSection === 'dashboard') {
                earthGroup.scale.set(1.2, 1.2, 1.2);
                earthGroup.visible = true;
            } else if (activeSection === 'auth' || !activeSection) {
                 earthGroup.visible = true;
                 earthGroup.scale.set(0.8, 0.8, 0.8);
            } else {
                earthGroup.visible = false;
            }

            renderer.render(scene, camera);
        }
        
        animate();
        isInitialized = true;
    }

    // Avatar 3D Logic
    const avatarHeads = new Map(); // Store avatar scenes per container

    function updateAvatar(state, containerId) {
        let entry = avatarHeads.get(containerId);
        
        if (!entry) {
            const container = document.getElementById(containerId);
            if (!container) return;
            
            const aScene = new THREE.Scene();
            const aCam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
            aCam.position.z = 3.5;
            aCam.position.y = 0.5;

            const aRen = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            aRen.setSize(container.clientWidth || 120, container.clientHeight || 120);
            container.innerHTML = '';
            container.appendChild(aRen.domElement);

            const light = new THREE.DirectionalLight(0xffffff, 1);
            light.position.set(2, 2, 5);
            aScene.add(light);
            aScene.add(new THREE.AmbientLight(0xffffff, 0.5));

            const group = new THREE.Group();
            
            // Body (Capsule)
            const bodyGeom = new THREE.CapsuleGeometry(0.4, 0.8, 4, 16);
            const bodyMat = new THREE.MeshPhongMaterial({ color: state.color || 0x16a34a });
            const body = new THREE.Mesh(bodyGeom, bodyMat);
            body.position.y = -0.5;
            group.add(body);

            // Head (Sphere)
            const headGeom = new THREE.SphereGeometry(0.5, 32, 32);
            const headMat = new THREE.MeshPhongMaterial({ color: state.skin || 0xfde68a });
            const head = new THREE.Mesh(headGeom, headMat);
            head.position.y = 0.6;
            group.add(head);

            aScene.add(group);
            entry = { scene: aScene, camera: aCam, renderer: aRen, group, head, body };
            avatarHeads.set(containerId, entry);
        }

        // Update Materials
        entry.body.material.color.set(state.color || '#16a34a');
        entry.head.material.color.set(state.skin || '#fde68a');

        // Animation Loop for Avatar
        function aAnimate() {
            if (!avatarHeads.has(containerId)) return;
            requestAnimationFrame(aAnimate);
            entry.group.rotation.y += 0.01;
            entry.renderer.render(entry.scene, entry.camera);
        }
        
        if (!entry.animating) {
            entry.animating = true;
            aAnimate();
        }
    }

    return { init, updateAvatar };
})();

document.addEventListener('DOMContentLoaded', () => {
    ThreeEngine.init();
});
