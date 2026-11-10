const STORAGE_KEY = 'daet_auth_users'

const seedUsers = () => [
  {
    id: 'admin-seeded',
    email: 'admin@daet-tourism.com',
    full_name: 'Daet Tourism Administrator',
    user_type: 'admin',
    status: 'active',
    points: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_online: false,
  },
  {
    id: 'moderator-seeded',
    email: 'moderator@daet-tourism.com',
    full_name: 'John Moderator',
    user_type: 'moderator',
    status: 'active',
    points: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_online: false,
  },
  {
    id: 'business-seeded',
    email: 'business@bagasbas.com',
    full_name: 'Bagasbas Beach Resort',
    user_type: 'business',
    status: 'active',
    points: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_online: false,
  },
  {
    id: 'tourist1-seeded',
    email: 'tourist1@example.com',
    full_name: 'Maria Santos',
    user_type: 'tourist',
    status: 'active',
    points: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_online: false,
  },
  {
    id: 'tourist2-seeded',
    email: 'tourist2@example.com',
    full_name: 'Juan Dela Cruz',
    user_type: 'tourist',
    status: 'active',
    points: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_online: false,
  },
  {
    id: 'tourist3-seeded',
    email: 'tourist3@example.com',
    full_name: 'Anna Garcia',
    user_type: 'tourist',
    status: 'active',
    points: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_online: false,
  },
]

export function getStoredUsers() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seeded = seedUsers()
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
      return seeded
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) return seedUsers()
    let removedPassword = false
    const users = parsed.map((user) => {
      const safeUser = { ...user }
      if (Object.hasOwn(safeUser, 'password')) {
        delete safeUser.password
        removedPassword = true
      }
      return safeUser
    })
    if (removedPassword) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users))
    return users
  } catch (error) {
    console.error('Failed to read auth users:', error)
    return []
  }
}

export function saveStoredUsers(users) {
  if (typeof window === 'undefined') return

  try {
    const safeUsers = users.map((user) => {
      const safeUser = { ...user }
      delete safeUser.password
      return safeUser
    })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeUsers))
  } catch (error) {
    console.error('Failed to save auth users:', error)
  }
}

export function getStoredUserByEmail(email) {
  const normalizedEmail = (email || '').trim().toLowerCase()
  return getStoredUsers().find((user) => user.email?.toLowerCase() === normalizedEmail) || null
}

export function getStoredUserById(id) {
  return getStoredUsers().find((user) => user.id === id) || null
}

export function loginStoredUser() {
  return { success: false, message: 'Local password sign-in is disabled. Sign in through DAET CONNECT.' }
}

export function registerStoredUser() {
  return { success: false, message: 'Local account creation is disabled. Register through DAET CONNECT.' }
}
