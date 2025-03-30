/**
 * Utility script to convert the SVG cat marker to a data URI 
 * for direct embedding in the application.
 * 
 * Usage:
 * 1. Run this script with Node.js:
 *    node --experimental-modules scripts/generate-cat-marker.js
 * 2. Copy the output data URI
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file's directory path (ES modules don't have __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the SVG file
const svgPath = path.join(__dirname, '../src/lib/assets/cat-marker.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

// Convert SVG to data URI
function svgToDataUri(svg) {
  // Convert SVG to base64
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

// Output the data URI
const dataUri = svgToDataUri(svgContent);
console.log(dataUri);

// To convert from SVG to PNG, you would typically:
// 1. Load the SVG into a canvas
// 2. Export the canvas as PNG
// 3. Convert to data URI
//
// This would require a browser environment or additional libraries in Node.js
// For simplicity, we're just creating the SVG data URI in this script 