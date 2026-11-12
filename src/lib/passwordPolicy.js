// Defaults match the policy enforced before it became configurable. An
// administrator can only tighten it (Settings -> Security); the minimum
// length never drops below 8.
export const DEFAULT_PASSWORD_POLICY = Object.freeze({
  minLength: 8,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: true,
})

export const PASSWORD_MAX_LENGTH = 128

export function normalizePasswordPolicy(policy) {
  const source = policy && typeof policy === 'object' ? policy : {}
  const minLength = Number(source.minLength)
  return {
    minLength: Number.isInteger(minLength) ? Math.min(Math.max(minLength, 8), 64) : DEFAULT_PASSWORD_POLICY.minLength,
    requireLowercase: source.requireLowercase !== false,
    requireUppercase: source.requireUppercase !== false,
    requireNumber: source.requireNumber !== false,
    requireSymbol: source.requireSymbol !== false,
  }
}

export function getPasswordRequirements(policy = DEFAULT_PASSWORD_POLICY) {
  const rules = normalizePasswordPolicy(policy)
  return [
    { key: 'length', label: `At least ${rules.minLength} characters`, test: (password) => password.length >= rules.minLength },
    rules.requireLowercase && { key: 'lowercase', label: 'One lowercase letter', test: (password) => /[a-z]/.test(password) },
    rules.requireUppercase && { key: 'uppercase', label: 'One uppercase letter', test: (password) => /[A-Z]/.test(password) },
    rules.requireNumber && { key: 'number', label: 'One number', test: (password) => /\d/.test(password) },
    rules.requireSymbol && { key: 'symbol', label: 'One special character', test: (password) => /[^A-Za-z0-9]/.test(password) },
  ].filter(Boolean)
}

export const PASSWORD_REQUIREMENTS = getPasswordRequirements()

export function describePasswordPolicy(policy = DEFAULT_PASSWORD_POLICY) {
  const labels = getPasswordRequirements(policy).map((rule) => rule.label.toLowerCase())
  return `Password must have ${labels.join(', ')}.`
}

export function getPasswordChecks(value, policy = DEFAULT_PASSWORD_POLICY) {
  const password = typeof value === 'string' ? value : ''
  return getPasswordRequirements(policy).map(({ key, label, test }) => ({
    key,
    label,
    valid: test(password),
  }))
}

export function getPasswordStrength(value, policy = DEFAULT_PASSWORD_POLICY) {
  const checks = getPasswordChecks(value, policy)
  const score = checks.filter((check) => check.valid).length
  const ratio = checks.length ? score / checks.length : 0

  if (ratio <= 0.4) return { label: 'Weak', score, checks }
  if (ratio < 1) return { label: 'Medium', score, checks }
  return { label: 'Strong', score, checks }
}

export function isPasswordValid(value, policy = DEFAULT_PASSWORD_POLICY) {
  return typeof value === 'string'
    && value.length <= PASSWORD_MAX_LENGTH
    && getPasswordChecks(value, policy).every((check) => check.valid)
}
