'use client';
/**
 * Factory functions for creating 3D scene objects (corn field, forest, quarry, sundial, shelters).
 * Extracted from simulation/page.tsx to reduce component size.
 * Refactored: 2026-02-19 @ added 'use client' for Turbopack Three.js resolution
 */

import * as THREE from 'three';

// ─── Types ──────────────────────────────────────────────────────

interface SpotConfig {
    x: number;
    z: number;
    radius: number;
}

interface ShelterConfig {
    id: string;
    type: string;
    x: number;
    z: number;
    built: boolean;
    buildProgress: number;
    ownerId: string | null;
    ownerName?: string;
    ownerColor?: string;
    isOccupied?: boolean;
}

// ─── Water Spot ─────────────────────────────────────────────────

export function createWaterSpot(spot: SpotConfig): THREE.Mesh {
    const geo = new THREE.CircleGeometry(spot.radius, 32);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x2196f3,
        metalness: 0.8,
        roughness: 0.2,
        transparent: true,
        opacity: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(spot.x, 0.02, spot.z);
    return mesh;
}

// ─── Corn Field ─────────────────────────────────────────────────

export function createCornField(spot: SpotConfig): THREE.Group {
    const group = new THREE.Group();
    group.position.set(spot.x, 0, spot.z);
    group.scale.set(0, 0, 0); // Start at scale 0 for grow animation
    group.userData = { spotX: spot.x, spotZ: spot.z, radius: spot.radius };

    const stalkCount = Math.floor(spot.radius * 8);

    for (let i = 0; i < stalkCount; i++) {
        const gridAngle = (i / stalkCount) * Math.PI * 2;
        const ringIndex = Math.floor(i / 6);
        const dist = (0.3 + ringIndex * 0.35) * Math.min(spot.radius * 0.9, 1.2);
        const sx = Math.cos(gridAngle + ringIndex * 0.3) * dist;
        const sz = Math.sin(gridAngle + ringIndex * 0.3) * dist;
        const stalkHeight = 0.9 + (i % 3) * 0.25;

        // Green stalk
        const stalkGeo = new THREE.CylinderGeometry(0.03, 0.04, stalkHeight, 6);
        const stalkMat = new THREE.MeshStandardMaterial({ color: 0x228b22, metalness: 0.1, roughness: 0.8 });
        const stalk = new THREE.Mesh(stalkGeo, stalkMat);
        stalk.position.set(sx, stalkHeight / 2, sz);
        stalk.rotation.x = Math.sin(i * 1.3) * 0.1;
        stalk.rotation.z = Math.cos(i * 1.7) * 0.1;
        stalk.castShadow = true;
        group.add(stalk);

        // Yellow corn cob
        const cobGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.2, 8);
        const cobMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.2, roughness: 0.6 });
        const cob = new THREE.Mesh(cobGeo, cobMat);
        cob.position.set(sx, stalkHeight - 0.05, sz);
        cob.rotation.x = stalk.rotation.x;
        cob.rotation.z = stalk.rotation.z;
        group.add(cob);

        // Green leaf/husk
        const leafGeo = new THREE.ConeGeometry(0.08, 0.15, 4);
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x32cd32, metalness: 0.1, roughness: 0.9, side: THREE.DoubleSide });
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(sx, stalkHeight + 0.05, sz);
        leaf.rotation.x = Math.PI + stalk.rotation.x;
        group.add(leaf);
    }

    // Dirt patch underneath
    const dirtGeo = new THREE.CircleGeometry(spot.radius, 16);
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, metalness: 0.0, roughness: 1.0 });
    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.01;
    group.add(dirt);

    return group;
}

// ─── Forest (Wood) ──────────────────────────────────────────────

export function createForest(spot: SpotConfig): THREE.Group {
    const group = new THREE.Group();
    group.position.set(spot.x, 0, spot.z);

    const treeCount = Math.floor(spot.radius * 4);
    for (let i = 0; i < treeCount; i++) {
        const treeGroup = new THREE.Group();
        const angle = (i / treeCount) * Math.PI * 2;
        const ring = Math.floor(i / 5);
        const dist = 0.4 + ring * 0.6;
        const tx = Math.cos(angle + ring * 0.5) * dist * Math.min(spot.radius * 0.8, 2);
        const tz = Math.sin(angle + ring * 0.5) * dist * Math.min(spot.radius * 0.8, 2);
        treeGroup.position.set(tx, 0, tz);

        // Trunk
        const trunkHeight = 1.2 + (i % 3) * 0.3;
        const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, trunkHeight, 8);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, metalness: 0.0, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkHeight / 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        // Foliage
        const foliageHeight = 1.0 + (i % 2) * 0.4;
        const foliageGeo = new THREE.ConeGeometry(0.5, foliageHeight, 8);
        const foliageMat = new THREE.MeshStandardMaterial({ color: 0x228b22, metalness: 0.0, roughness: 0.8 });
        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.y = trunkHeight + foliageHeight / 2 - 0.2;
        foliage.castShadow = true;
        treeGroup.add(foliage);

        group.add(treeGroup);
    }

    // Dirt patch
    const dirtGeo = new THREE.CircleGeometry(spot.radius, 16);
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x654321, metalness: 0.0, roughness: 1.0 });
    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.01;
    group.add(dirt);

    return group;
}

// ─── Quarry (Stone) ─────────────────────────────────────────────

export function createQuarry(spot: SpotConfig): THREE.Group {
    const group = new THREE.Group();
    group.position.set(spot.x, 0, spot.z);

    const rockCount = Math.floor(spot.radius * 5);
    for (let i = 0; i < rockCount; i++) {
        const angle = (i / rockCount) * Math.PI * 2 + (i % 2) * 0.3;
        const dist = 0.3 + (i % 3) * 0.4;
        const rx = Math.cos(angle) * dist * Math.min(spot.radius * 0.7, 1.5);
        const rz = Math.sin(angle) * dist * Math.min(spot.radius * 0.7, 1.5);
        const rockSize = 0.2 + (i % 3) * 0.15;

        const rockGeo = new THREE.DodecahedronGeometry(rockSize, 0);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0.1, roughness: 0.9 });
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(rx, rockSize * 0.5, rz);
        rock.rotation.x = i * 0.5;
        rock.rotation.z = i * 0.3;
        rock.castShadow = true;
        group.add(rock);
    }

    // Gravel patch
    const gravelGeo = new THREE.CircleGeometry(spot.radius, 16);
    const gravelMat = new THREE.MeshStandardMaterial({ color: 0x696969, metalness: 0.0, roughness: 1.0 });
    const gravel = new THREE.Mesh(gravelGeo, gravelMat);
    gravel.rotation.x = -Math.PI / 2;
    gravel.position.y = 0.01;
    group.add(gravel);

    return group;
}

// ─── Sundial ────────────────────────────────────────────────────

export function createSundial(config: { x: number; z: number; radius: number }): THREE.Group {
    const group = new THREE.Group();
    group.position.set(config.x, 0, config.z);
    group.rotation.y = Math.PI; // Face north

    const baseRadius = config.radius;

    // Circular base platform
    const baseGeo = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.1, 0.15, 32);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x8b8b83, metalness: 0.1, roughness: 0.9 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.075;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Dial face
    const dialGeo = new THREE.CircleGeometry(baseRadius * 0.9, 32);
    const dialMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, metalness: 0.0, roughness: 0.7 });
    const dial = new THREE.Mesh(dialGeo, dialMat);
    dial.rotation.x = -Math.PI / 2;
    dial.position.y = 0.16;
    group.add(dial);

    // Hour markings
    for (let h = 0; h < 12; h++) {
        const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
        const lineGeo = new THREE.BoxGeometry(0.02, 0.01, baseRadius * 0.3);
        const lineMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.0, roughness: 0.8 });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.x = Math.cos(angle) * baseRadius * 0.65;
        line.position.z = Math.sin(angle) * baseRadius * 0.65;
        line.position.y = 0.17;
        line.rotation.y = -angle;
        group.add(line);
    }

    // Obelisk-style gnomon (replaces thin triangle)
    const gnomonHeight = 3.0;
    const gnomonGeo = new THREE.CylinderGeometry(0.01, 0.08, gnomonHeight, 4);
    const gnomonMat = new THREE.MeshStandardMaterial({
        color: 0xcd7f32,
        metalness: 0.7,
        roughness: 0.2
    });
    const gnomon = new THREE.Mesh(gnomonGeo, gnomonMat);
    gnomon.position.set(0, 0.16 + gnomonHeight / 2, 0);
    gnomon.castShadow = true;
    group.add(gnomon);

    // Tip of the gnomon (slight point)
    const bitGeo = new THREE.ConeGeometry(0.01, 0.05, 4);
    const bit = new THREE.Mesh(bitGeo, gnomonMat);
    bit.position.y = gnomonHeight / 2 + 0.025;
    gnomon.add(bit);

    // North Chevron indicator (12 o'clock position)
    const chevronGroup = new THREE.Group();
    const chevMat = new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.8, roughness: 0.2 });
    const chevPart1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.2), chevMat);
    const chevPart2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.2), chevMat);

    chevPart1.rotation.y = Math.PI / 4;
    chevPart1.position.x = 0.06;
    chevPart2.rotation.y = -Math.PI / 4;
    chevPart2.position.x = -0.06;

    chevronGroup.add(chevPart1);
    chevronGroup.add(chevPart2);
    chevronGroup.position.set(0, 0.17, -baseRadius * 0.8); // North is local -Z
    group.add(chevronGroup);

    // Decorative ring
    const ringGeo = new THREE.TorusGeometry(baseRadius * 1.05, 0.03, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.3, roughness: 0.7 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    group.add(ring);

    return group;
}

// ─── Shelter ────────────────────────────────────────────────────

export function buildShelterMesh(shelter: ShelterConfig, shelterObj: THREE.Group): void {
    // Clear existing children
    while (shelterObj.children.length > 0) {
        const child = shelterObj.children[0];
        shelterObj.remove(child);
        if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    }

    if (shelter.built) {
        // Complete hut
        const floorGeo = new THREE.BoxGeometry(1.0, 0.1, 1.0);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, metalness: 0.0, roughness: 0.9 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.y = 0.05;
        shelterObj.add(floor);

        const wallMat = new THREE.MeshStandardMaterial({ color: 0xa0522d, metalness: 0.0, roughness: 0.8 });
        const wallGeo = new THREE.BoxGeometry(0.9, 0.8, 0.08);
        const backWall = new THREE.Mesh(wallGeo, wallMat);
        backWall.position.set(0, 0.5, -0.42);
        shelterObj.add(backWall);

        // Add Owner Nameplate to the back wall
        if (shelter.ownerName) {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.fillRect(0, 0, 256, 64);
                ctx.font = 'bold 36px Arial';
                ctx.fillStyle = shelter.ownerColor || '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(shelter.ownerName, 128, 32);

                const texture = new THREE.CanvasTexture(canvas);
                const plateGeo = new THREE.PlaneGeometry(0.6, 0.15);
                const plateMat = new THREE.MeshStandardMaterial({
                    map: texture,
                    transparent: true,
                    side: THREE.FrontSide
                });
                const plate = new THREE.Mesh(plateGeo, plateMat);
                // Position on the side wall (Right side)
                plate.position.set(0.375, 0.6, 0);
                plate.rotation.y = Math.PI / 2;
                shelterObj.add(plate);
            }
        }

        const frontWallHalfGeo = new THREE.BoxGeometry(0.3, 0.8, 0.08);
        const frontWallLeft = new THREE.Mesh(frontWallHalfGeo, wallMat);
        frontWallLeft.position.set(-0.3, 0.5, 0.42);
        shelterObj.add(frontWallLeft);

        const frontWallRight = new THREE.Mesh(frontWallHalfGeo, wallMat);
        frontWallRight.position.set(0.3, 0.5, 0.42);
        shelterObj.add(frontWallRight);

        const sideWallGeo = new THREE.BoxGeometry(0.08, 0.8, 0.84);
        const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
        leftWall.position.set(-0.42, 0.5, 0);
        shelterObj.add(leftWall);

        const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
        rightWall.position.set(0.42, 0.5, 0);
        shelterObj.add(rightWall);

        const roofMat = new THREE.MeshStandardMaterial({ color: 0x654321, metalness: 0.0, roughness: 0.9, side: THREE.DoubleSide });
        const roofGeo = new THREE.BoxGeometry(1.1, 0.08, 0.7);
        const leftRoof = new THREE.Mesh(roofGeo, roofMat);
        leftRoof.position.set(0, 1.0, -0.22);
        leftRoof.rotation.x = Math.PI * 0.2;
        shelterObj.add(leftRoof);

        const rightRoof = new THREE.Mesh(roofGeo, roofMat);
        rightRoof.position.set(0, 1.0, 0.22);
        rightRoof.rotation.x = -Math.PI * 0.2;
        shelterObj.add(rightRoof);

        // ZZZ Indicator if occupied
        if (shelter.isOccupied) {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.font = '64px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('💤', 64, 64);

                const texture = new THREE.CanvasTexture(canvas);
                const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
                const sprite = new THREE.Sprite(spriteMat);
                sprite.position.set(0, 1.6, 0); // Above the shelter
                sprite.scale.set(0.6, 0.6, 1);
                shelterObj.add(sprite);
            }
        }
    } else if (shelter.buildProgress > 0) {
        // Under construction
        const progress = shelter.buildProgress / 100;
        const foundationGeo = new THREE.BoxGeometry(1.0, 0.1, 1.0);
        const foundationMat = new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0.1, roughness: 0.9 });
        const foundation = new THREE.Mesh(foundationGeo, foundationMat);
        foundation.position.y = 0.05;
        shelterObj.add(foundation);

        if (progress > 0.3) {
            const wallMat = new THREE.MeshStandardMaterial({ color: 0xa0522d, transparent: true, opacity: Math.min(1, progress * 1.5) });
            const wallHeight = Math.min(0.8, progress * 1.6);
            const wallGeo = new THREE.BoxGeometry(0.9, wallHeight, 0.08);
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.set(0, wallHeight / 2 + 0.1, 0.42);
            shelterObj.add(wall);
        }
    } else {
        // Empty build plot
        const plotGeo = new THREE.CircleGeometry(0.5, 16);
        const plotMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, metalness: 0.0, roughness: 1.0 });
        const plot = new THREE.Mesh(plotGeo, plotMat);
        plot.rotation.x = -Math.PI / 2;
        plot.position.y = 0.02;
        shelterObj.add(plot);
    }

    // Add Mailbox if shelter has an owner
    if (shelter.ownerId) {
        const mailboxGroup = new THREE.Group();
        // Position mailbox in one corner (e.g., front-right: x=0.4, z=0.4)
        mailboxGroup.position.set(0.4, 0, 0.4);

        // Mailbox Post
        const postGeo = new THREE.BoxGeometry(0.04, 0.6, 0.04);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x4a2c1d, metalness: 0.0, roughness: 1.0 });
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.y = 0.3;
        mailboxGroup.add(post);

        // Mailbox Body (Main box)
        const boxGeo = new THREE.BoxGeometry(0.15, 0.1, 0.25);
        // Use bot's color for the mailbox body
        const boxMat = new THREE.MeshStandardMaterial({
            color: shelter.ownerColor || '#888888',
            metalness: 0.3,
            roughness: 0.5
        });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.y = 0.65;
        mailboxGroup.add(box);

        // Mailbox Roof (Curved top or just simple box)
        const roofGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.25, 12, 1, false, 0, Math.PI);
        const roof = new THREE.Mesh(roofGeo, boxMat);
        roof.rotation.x = -Math.PI / 2;
        roof.position.y = 0.7;
        mailboxGroup.add(roof);

        // Flag (Red)
        const flagGeo = new THREE.BoxGeometry(0.01, 0.08, 0.04);
        const flagMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(0.08, 0.7, 0.05);
        mailboxGroup.add(flag);

        // Nameplate
        if (shelter.ownerName) {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = shelter.ownerColor || '#888888';
                ctx.fillRect(0, 0, 128, 64);
                ctx.font = 'bold 32px Arial';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Draw name (truncate if too long)
                const displayName = shelter.ownerName.length > 10 ? shelter.ownerName.substring(0, 8) + '..' : shelter.ownerName;
                ctx.fillText(displayName, 64, 32);

                const texture = new THREE.CanvasTexture(canvas);
                const plateGeo = new THREE.PlaneGeometry(0.12, 0.06);
                const plateMat = new THREE.MeshStandardMaterial({
                    map: texture,
                    transparent: true,
                    side: THREE.DoubleSide
                });
                const plate = new THREE.Mesh(plateGeo, plateMat);
                plate.position.set(0, 0.65, 0.127); // Front of mailbox
                mailboxGroup.add(plate);
            }
        }

        shelterObj.add(mailboxGroup);
    }
}

// ─── Dispose Helper ─────────────────────────────────────────────

/**
 * Recursively dispose all geometries and materials in an Object3D tree.
 */
export function disposeObject3D(obj: THREE.Object3D): void {
    obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });
}
