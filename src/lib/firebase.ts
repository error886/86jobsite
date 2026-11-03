/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { User } from '../types';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error handler helper per SKILL.md
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on boot as mandated by SKILL.md
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

/**
 * Login with Google popup and sync or retrieve user document in Firestore database
 */
export async function loginWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const fbUser = result.user;
    
    const uid = fbUser.uid;
    const email = fbUser.email || '';
    const name = fbUser.displayName || email.split('@')[0] || 'Người dùng Google';
    const avatar = fbUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`;
    // Profiles are always created as 'user'; admin rights are decided by the server
    const role = 'user' as const;

    const userDocRef = doc(db, 'users', uid);
    const pathForUser = `users/${uid}`;

    try {
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        const newUser: User = {
          id: uid,
          name,
          email,
          avatar,
          role,
          createdAt: new Date().toISOString()
        };
        await setDoc(userDocRef, newUser);
        return newUser;
      } else {
        const existingData = userDocSnap.data() as User;
        return {
          ...existingData,
          id: uid
        };
      }
    } catch (dbErr) {
      console.warn("Firestore error reading/writing user profile:", dbErr);
      // Fallback user object if Firestore rule restricts before full setup
      return {
        id: uid,
        name,
        email,
        avatar,
        role,
        createdAt: new Date().toISOString()
      };
    }
  } catch (authErr) {
    console.error("Google Auth error:", authErr);
    throw authErr;
  }
}

/**
 * Logout from Firebase Auth
 */
export async function logoutFirebase() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Logout error:", err);
  }
}
