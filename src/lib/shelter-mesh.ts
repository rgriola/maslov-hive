'use client';
/**
 * Shelter mesh factory — builds/rebuilds a shelter Three.js Group
 * based on build state (empty plot → under construction → complete hut).
 * Extracted from scene-objects.ts (Phase 5).
 *
 * NOTE: This function mutates the passed-in `shelterObj` group
 * (clears children, adds new geometry). A pure "return new group"
 * approach would require the caller to swap scene references, which
 * touches too many call sites for a safe single-pass refactor.
 */

import * as THREE from 'three';
import {
  SHELTER_FLOOR,
  SHELTER_WALL,
  SHELTER_ROOF,
  FOUNDATION_GRAY,
  PLOT_TAN,
  MAILBOX_POST,
  MAILBOX_FLAG,
} from '@/config/scene-colors';

// ─── Types ──────────────────────────────────────────────────────

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

// ─── Factory ────────────────────────────────────────────────────

export function buildShelterMesh(shelter: ShelterConfig, shelterObj: THREE.Group): void {
  // Clear existing children
  while (shelterObj.children.length > 0) {
    const child = shelterObj.children[0];
    shelterObj.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  }

  if (shelter.built) {
    // Complete hut
    const floorGeo = new THREE.BoxGeometry(1.0, 0.1, 1.0);
    const floorMat = new THREE.MeshStandardMaterial({ color: SHELTER_FLOOR, metalness: 0.0, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = 0.05;
    shelterObj.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: SHELTER_WALL, metalness: 0.0, roughness: 0.8 });
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
          side: THREE.FrontSide,
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

    const roofMat = new THREE.MeshStandardMaterial({ color: SHELTER_ROOF, metalness: 0.0, roughness: 0.9, side: THREE.DoubleSide });
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
    const foundationMat = new THREE.MeshStandardMaterial({ color: FOUNDATION_GRAY, metalness: 0.1, roughness: 0.9 });
    const foundation = new THREE.Mesh(foundationGeo, foundationMat);
    foundation.position.y = 0.05;
    shelterObj.add(foundation);

    if (progress > 0.3) {
      const wallMat = new THREE.MeshStandardMaterial({ color: SHELTER_WALL, transparent: true, opacity: Math.min(1, progress * 1.5) });
      const wallHeight = Math.min(0.8, progress * 1.6);
      const wallGeo = new THREE.BoxGeometry(0.9, wallHeight, 0.08);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(0, wallHeight / 2 + 0.1, 0.42);
      shelterObj.add(wall);
    }
  } else {
    // Empty build plot
    const plotGeo = new THREE.CircleGeometry(0.5, 16);
    const plotMat = new THREE.MeshStandardMaterial({ color: PLOT_TAN, metalness: 0.0, roughness: 1.0 });
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
    const postMat = new THREE.MeshStandardMaterial({ color: MAILBOX_POST, metalness: 0.0, roughness: 1.0 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 0.3;
    mailboxGroup.add(post);

    // Mailbox Body (Main box)
    const boxGeo = new THREE.BoxGeometry(0.15, 0.1, 0.25);
    // Use bot's color for the mailbox body
    const boxMat = new THREE.MeshStandardMaterial({
      color: shelter.ownerColor || '#888888',
      metalness: 0.3,
      roughness: 0.5,
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
    const flagMat = new THREE.MeshStandardMaterial({ color: MAILBOX_FLAG });
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
          side: THREE.DoubleSide,
        });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.set(0, 0.65, 0.127); // Front of mailbox
        mailboxGroup.add(plate);
      }
    }

    shelterObj.add(mailboxGroup);
  }
}
