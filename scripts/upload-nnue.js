#!/usr/bin/env node
/**
 * One-time upload of NNUE network files to Firebase Storage.
 *
 * Run once (from the project root):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
 *     node scripts/upload-nnue.js
 *
 * Get the service account key from:
 *   Firebase Console → Project Settings → Service Accounts
 *   → "Generate new private key"
 *
 * After uploading you can delete the key file.
 */

const admin = require('../functions/node_modules/firebase-admin');
const path  = require('path');
const fs    = require('fs');

admin.initializeApp({
  credential:    admin.credential.applicationDefault(),
  storageBucket: 'chesswithselfcapture.firebasestorage.app',
});

const bucket  = admin.storage().bucket();
const nnueDir = path.join(__dirname, '..', 'web', 'public');
const files   = ['nn-1c0000000000.nnue', 'nn-37f18f62d772.nnue'];

(async () => {
  for (const file of files) {
    const src  = path.join(nnueDir, file);
    const size = (fs.statSync(src).size / 1024 / 1024).toFixed(1);
    process.stdout.write(`Uploading ${file} (${size} MB)… `);
    const t = Date.now();
    await bucket.upload(src, {
      destination: `nnue/${file}`,
      metadata: { contentType: 'application/octet-stream' },
    });
    console.log(`done (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }
  console.log('\nAll NNUE files are in Storage at gs://<bucket>/nnue/');
  console.log('You can now delete the service account key file.');
})().catch(err => { console.error(err); process.exit(1); });
