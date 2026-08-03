const STORAGE_KEY = 'daet_auth_users'

const seedUsers = () => [
  {
    id: 'admin-seeded',
    email: 'admin@daet-tourism.com',
    password: 'Admin@123456',
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
    password: 'Mod@123456',
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
    password: 'Business@123456',
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
    password: 'Tourist@123',
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
    password: 'Tourist@123',
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
    password: 'Tourist@123',
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
    return Array.isArray(parsed) && parsed.length ? parsed : seedUsers()
  } catch (error) {
    console.error('Failed to read auth users:', error)
    return []
  }
}

export function saveStoredUsers(users) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users))
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

export function loginStoredUser({ email, password }) {
  const user = getStoredUserByEmail(email)
  if (!user) {
    return { success: false, message: 'No account found with this email.' }
  }

  if (user.status !== 'active') {
    return { success: false, message: `Your account is ${user.status}. Please contact support.` }
  }

  if (String(user.password || '').trim() !== String(password || '').trim()) {
    return { success: false, message: 'Invalid email or password.' }
  }

  const users = getStoredUsers().map((item) =>
    item.id === user.id
      ? { ...item, last_login: new Date().toISOString(), is_online: true, updated_at: new Date().toISOString() }
      : item
  )
  saveStoredUsers(users)

  return {
    success: true,
    user: {
      ...user,
      last_login: new Date().toISOString(),
      is_online: true,
      updated_at: new Date().toISOString(),
    },
  }
}

export function registerStoredUser({ full_name, email, password, user_type = 'tourist' }) {
  const normalizedEmail = (email || '').trim().toLowerCase()
  const existingUser = getStoredUserByEmail(normalizedEmail)
  if (existingUser) {
    return { success: false, message: 'Email address is already registered.' }
  }

  const newUser = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
    email: normalizedEmail,
    password: String(password || '').trim(),
    full_name: String(full_name || '').trim(),
    user_type: String(user_type || 'tourist').trim().toLowerCase(),
    status: 'active',
    points: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_online: true,
  }

  const users = [newUser, ...getStoredUsers()]
  saveStoredUsers(users)

  return { success: true, user: newUser }
}
