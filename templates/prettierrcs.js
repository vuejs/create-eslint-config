const defaultConfig = {
  $schema: 'https://json.schemastore.org/prettierrc',
  semi: false,
  singleQuote: true,
  printWidth: 100,
  trailingComma: 'none'
}

const airbnb = {
  $schema: 'https://json.schemastore.org/prettierrc',
  printWidth: 100,
  singleQuote: true,
}

const standard = {
  $schema: 'https://json.schemastore.org/prettierrc',
  jsxSingleQuote: true,
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
}

export {
  defaultConfig as default,
  airbnb,
  standard
}
