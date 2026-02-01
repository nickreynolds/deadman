import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

interface User {
  id: string
  username: string
  is_admin: boolean
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  error: string | null
}

const AuthContext = createContext<AuthState | null>(null)

const TOKEN_KEY = 'dd_admin_token'
const USER_KEY = 'dd_admin_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_KEY)
    if (stored) {
      try {
        return JSON.parse(stored) as User
      } catch {
        return null
      }
    }
    return null
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    setError(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json() as { token?: string; user?: User; error?: string }

      if (!res.ok) {
        throw new Error(data.error ?? 'Login failed')
      }

      if (!data.token || !data.user) {
        throw new Error('Invalid response from server')
      }

      if (!data.user.is_admin) {
        throw new Error('Admin access required')
      }

      setToken(data.token)
      setUser(data.user)
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Verify stored token is still valid on mount
  useEffect(() => {
    if (!token) return

    fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          logout()
          return
        }
        const data = await res.json() as { token: string }
        setToken(data.token)
        localStorage.setItem(TOKEN_KEY, data.token)
      })
      .catch(() => {
        logout()
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
