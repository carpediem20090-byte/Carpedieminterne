import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile } from '../lib/supabase'

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  estPatron: boolean
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data as Profile | null))
  }, [session?.user?.id])

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? traduireErreur(error.message) : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const estPatron = profile?.role === 'patron'

  return (
    <AuthContext.Provider value={{ session, profile, loading, estPatron, signInWithPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

function traduireErreur(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Email ou mot de passe incorrect.'
  }
  return message
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
