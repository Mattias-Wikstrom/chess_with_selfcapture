import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User, onAuthStateChanged, signInWithRedirect, getRedirectResult,
  signInAnonymously, signOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

interface AuthContextValue {
  user:            User | null;
  loading:         boolean;
  isAdmin:         boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest:   () => Promise<void>;
  signOutUser:     () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Handle the redirect return from Google sign-in
    getRedirectResult(auth).catch(() => { /* ignore redirect errors */ });

    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      // Keep loading=true until we've resolved isAdmin so pages that
      // depend on it (AdminPage) don't briefly redirect before it's known.
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const snap    = await getDoc(userRef);

        if (!snap.exists()) {
          const isAnon = u.isAnonymous;
          await setDoc(userRef, {
            displayName: u.displayName ?? (isAnon ? `Guest ${u.uid.slice(0, 4).toUpperCase()}` : 'Anonymous'),
            photoURL:    u.photoURL ?? '',
            createdAt:   serverTimestamp(),
          });
          setIsAdmin(false);
        } else {
          setIsAdmin(snap.data()?.isAdmin === true);
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = () => signInWithRedirect(auth, googleProvider);
  const signInAsGuest    = () => signInAnonymously(auth).then(() => undefined);
  const signOutUser      = () => signOut(auth);

  return (
    <AuthContext.Provider value={{
      user, loading, isAdmin,
      signInWithGoogle, signInAsGuest, signOutUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
