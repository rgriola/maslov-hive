'use client';
/**
 * Shared Three.js utility functions.
 * Extracted from scene-objects.ts (Phase 5).
 */

import * as THREE from 'three';

/**
 * Recursively dispose all geometries and materials in an Object3D tree.
 */
export function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}
