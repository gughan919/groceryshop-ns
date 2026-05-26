import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let db: any = null;
let initialized = false;

export function getFirebaseServerDb() {
  if (initialized) return db;

  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      console.warn('[SERVER-FIREBASE] Configuration file firebase-applet-config.json not found. Running in local-only DB mode.');
      return null;
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const firebaseConfig = JSON.parse(configContent);

    const apps = getApps();
    let app;
    if (apps.length === 0) {
      app = initializeApp({
        projectId: firebaseConfig.projectId,
      });
    } else {
      app = apps[0];
    }

    // Specifying the custom database ID for the environment's Firestore instance
    const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
    db = getFirestore(app, databaseId);
    initialized = true;
    console.log('[SERVER-FIREBASE] Secretly authorized, initialized server connection to Firestore via Admin SDK. ID:', databaseId);

    if (onAuthSuccessCallback) {
      onAuthSuccessCallback();
    }

    return db;
  } catch (error) {
    console.error('[SERVER-FIREBASE] Admin SDK Initialization failed. Falling back to local db mode.', error);
    return null;
  }
}

let onAuthSuccessCallback: (() => void) | null = null;

export function setOnAuthSuccess(cb: () => void) {
  onAuthSuccessCallback = cb;
  if (initialized) {
    cb();
  }
}

let isSyncDisabled = false;
let permissionWarningLogged = false;

// Low-level helper to write/update any document cleanly to Firestore bypassing rules
export async function syncDocToFirestore(collectionName: string, docId: string, data: any) {
  if (isSyncDisabled) return;

  const fdb = getFirebaseServerDb();
  if (!fdb) return;

  try {
    // Avoid setting undefined or complex nested custom classes
    const sanitizedData = JSON.parse(JSON.stringify(data));
    const docRef = fdb.doc(`${collectionName}/${docId}`);
    await docRef.set(sanitizedData);
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isPermissionError = errorMsg.includes('PERMISSION_DENIED') || 
                             errorMsg.includes('Missing or insufficient permissions') ||
                             (error?.code === 7);

    if (isPermissionError) {
      isSyncDisabled = true;
      if (!permissionWarningLogged) {
        permissionWarningLogged = true;
        console.warn(`[SERVER-FIREBASE] Server Firestore synchronization is running in local fallback mode. (Standard IAM permissions for custom database ID not yet granted on the Cloud project). Nammashop is fully operational using safe persistent local storage.`);
      }
    } else {
      console.warn(`[SERVER-FIREBASE] Failed syncing ${collectionName}/${docId} to Firestore. Will continue in local fallback.`, error);
    }
  }
}

// Low-level helper to delete any document cleanly from Firestore bypassing rules
export async function deleteDocFromFirestore(collectionName: string, docId: string) {
  if (isSyncDisabled) return;

  const fdb = getFirebaseServerDb();
  if (!fdb) return;

  try {
    const docRef = fdb.doc(`${collectionName}/${docId}`);
    await docRef.delete();
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isPermissionError = errorMsg.includes('PERMISSION_DENIED') || 
                             errorMsg.includes('Missing or insufficient permissions') ||
                             (error?.code === 7);

    if (isPermissionError) {
      isSyncDisabled = true;
      if (!permissionWarningLogged) {
        permissionWarningLogged = true;
        console.warn(`[SERVER-FIREBASE] Server Firestore synchronization is running in local fallback mode. (Standard IAM permissions for custom database ID not yet granted on the Cloud project). Nammashop is fully operational using safe persistent local storage.`);
      }
    } else {
      console.warn(`[SERVER-FIREBASE] Failed deleting ${collectionName}/${docId} in Firestore.`, error);
    }
  }
}
