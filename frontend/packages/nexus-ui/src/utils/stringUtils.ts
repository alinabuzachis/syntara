export function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export function formatSnakeCase(value: string) {
  return value.split('_').map(capitalize).join(' ')
}
