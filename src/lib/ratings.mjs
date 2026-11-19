export function isValidRating(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5
}

export function isOptionalRating(value) {
  return value === 0 || isValidRating(value)
}
