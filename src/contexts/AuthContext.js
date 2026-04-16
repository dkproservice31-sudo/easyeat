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

  const signUp = async (email, password, username, extra = {}) => {
    const cleanEmail = email.trim().toLowerCase();
    const finalUsername = username?.trim() || cleanEmail.split('@')[0];
    const meta = {
      username: finalUsername,
      first_name: extra.firstName || null,
      last_name: extra.lastName || null,
      age: extra.age != null ? String(extra.age) : null,
    };
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: meta },
    });
    if (error) return { data, error };

    // Fallback client-side si pas de trigger
    if (data?.user && data?.session) {
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: data.user.id,
          username: finalUsername,
          email: cleanEmail,
          first_name: extra.firstName || null,
          last_name: extra.lastName || null,
          age: extra.age || null,
          requested_editor_id: extra.requestedEditorId || null,
        },
        { onConflict: 'id' }
      );
      if (profileError) console.warn('profile upsert:', profileError.message);
    } else if (data?.user && extra.requestedEditorId) {
      // Cas confirmation email : le profil est créé par trigger, on patch après-coup
      await supabase
        .from('profiles')
        .update({ requested_editor_id: extra.requestedEditorId })
        .eq('id', data.user.id);
    }
    return { data, error: null };
  };

  const reloadProfile = async () => {
    if (!session?.user) return null;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();
    if (data) setProfile(data);
    return data;
  };

  const signOut = () => supabase.auth.signOut();

  const role = profile?.role ?? 'member';
  const isAdmin = role === 'admin';
  const isEditor = role === 'editor' || role === 'admin';
  const isApproved = profile ? (profile.approved === true || isEditor) : false;
  const isBanned = profile?.banned === true;

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role,
    isAdmin,
    isEditor,
    isApproved,
    isBanned,
    loading,
    signIn,
    signUp,
    signOut,
    reloadProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
