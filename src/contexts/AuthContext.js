import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  loading: true,
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Charge le profil quand la session change
  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!cancelled && !error) setProfile(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signIn = async (email, password) => {
    return supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
  };

  const signUp = async (email, password, username) => {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { username: username?.trim() || cleanEmail.split('@')[0] },
      },
    });
    if (error) return { data, error };

    // Fallback: crée le profil côté client si pas de trigger SQL en place.
    // Avec confirmation email activée, session sera null — on skip.
    if (data?.user && data?.session) {
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: data.user.id,
          username: username?.trim() || cleanEmail.split('@')[0],
          email: cleanEmail,
        },
        { onConflict: 'id' }
      );
      if (profileError) console.warn('profile upsert:', profileError.message);
    }
    return { data, error: null };
  };

  const signOut = () => supabase.auth.signOut();

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
