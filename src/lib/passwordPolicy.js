export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', test: (password) => password.length >= 8 },
  { key: 'lowercase', label: 'One lowercase letter', test: (password) => /[a-z]/.test(password) },
  { key: 'uppercase', label: 'One uppercase letter', test: (password) => /[A-Z]/.test(password) },
  { key: 'number', label: 'One number', test: (password) => /\d/.test(password) },
  { key: 'symbol', label: 'One special character', test: (password) => /[^A-Za-z0-9]/.test(password) },
]

export function getPasswordChecks(value) {
  const password = typeof value === 'string' ? value : ''
  return PASSWORD_REQUIREMENTS.map(({ key, label, test }) => ({
    key,
    label,
    valid: test(password),
  }))
}

export function getPasswordStrength(value) {
  const checks = getPasswordChecks(value)
  const score = checks.filter((check) => check.valid).length

  if (score <= 2) return { label: 'Weak', score, checks }
  if (score <= 4) return { label: 'Medium', score, checks }
  return { label: 'Strong', score, checks }
}

export function isPasswordValid(value) {
  return typeof value === 'string'
    && value.length <= 128
    && getPasswordChecks(value).every((check) => check.valid)
}
