"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, db, googleProvider } from "@/lib/firebase";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";

export type UserStatus = "pending" | "approved" | null;

interface AuthContextType {
  user: User | null;
  userStatus: UserStatus;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userStatus: null,
  loading: true,
  signInWithGoogle: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        // Reference to user document in Firestore
        const userRef = doc(db, "users", currentUser.uid);
        
        // Listen to real-time changes for this user
        unsubscribeSnapshot = onSnapshot(userRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserStatus(data.status as UserStatus);
            setLoading(false);
          } else {
            // User doesn't exist in DB, create them as "pending"
            try {
              await setDoc(userRef, {
                email: currentUser.email,
                name: currentUser.displayName,
                photoURL: currentUser.photoURL,
                status: "pending",
                createdAt: serverTimestamp(),
              });
              setUserStatus("pending");
            } catch (error) {
              console.error("Error creating user doc:", error);
            } finally {
              setLoading(false);
            }
          }
        }, (error) => {
          console.error("Firestore onSnapshot error:", error);
          setLoading(false);
          setUserStatus(null);
        });
      } else {
        setUser(null);
        setUserStatus(null);
        setLoading(false);
        if (unsubscribeSnapshot) unsubscribeSnapshot();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userStatus, loading, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
