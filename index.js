import { stringify } from 'javascript-stringify'

import * as editorconfigs from './templates/editorconfigs.js'
import * as prettierrcs from './templates/prettierrcs.js'

import versionMap from './versionMap.cjs'

const CREATE_ALIAS_SETTING_PLACEHOLDER = 'CREATE_ALIAS_SETTING_PLACEHOLDER'
export { CREATE_ALIAS_SETTING_PLACEHOLDER }

function stringifyJS (value, styleGuide, configFormat) {
  // eslint-disable-next-line no-shadow
  const result = stringify(value, (val, indent, stringify, key) => {
    if (key === 'CREATE_ALIAS_SETTING_PLACEHOLDER') {
      return `(${stringify(val)})`
    }

    return stringify(val)
  }, 2)

  if (configFormat === 'flat') {
    return result.replace('CREATE_ALIAS_SETTING_PLACEHOLDER: ', '...createAliasSetting')
  }

  return result.replace(
    'CREATE_ALIAS_SETTING_PLACEHOLDER: ',
    `...require('@vue/eslint-config-${styleGuide}/createAliasSetting')`
  )
}

const isObject = (val) => val && typeof val === 'object'
const mergeArrayWithDedupe = (a, b) => Array.from(new Set([...a, ...b]))

/**
 * Recursively merge the content of the new object to the existing one
 * @param {Object} target the existing object
 * @param {Object} obj the new object
 */
export function deepMerge (target, obj) {
  for (const key of Object.keys(obj)) {
    const oldVal = target[key]
    const newVal = obj[key]

    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      target[key] = mergeArrayWithDedupe(oldVal, newVal)
    } else if (isObject(oldVal) && isObject(newVal)) {
      target[key] = deepMerge(oldVal, newVal)
    } else {
      target[key] = newVal
    }
  }

  return target
}

// This is also used in `create-vue`
export default function createConfig ({
  vueVersion = '3.x', // '2.x' | '3.x' (TODO: 2.7 / vue-demi)
  configFormat = 'eslintrc', // eslintrc | flat

  filePatterns = [], // flat format only - e.g. '**/*.vue', '**/*.js', etc.

  styleGuide = 'default', // default | airbnb | standard
  hasTypeScript = false, // true | false
  needsPrettier = false, // true | false

  additionalConfig = {}, // e.g. Cypress, createAliasSetting for Airbnb, etc.
  additionalDependencies = {} // e.g. eslint-plugin-cypress
}) {
  // This is the pkg object to extend
  const pkg = { devDependencies: {} }
  const addDependency = (name) => {
    pkg.devDependencies[name] = versionMap[name]
  }

  addDependency('eslint')
  addDependency('eslint-plugin-vue')

  if (
    configFormat === "eslintrc" &&
    (styleGuide !== "default" || hasTypeScript || needsPrettier)
  ) {
    addDependency("@rushstack/eslint-patch");
  }

  const language = hasTypeScript ? 'typescript' : 'javascript'

  const eslintrcConfig = {
    root: true,
    extends: [
      vueVersion.startsWith('2')
        ? 'plugin:vue/essential'
        : 'plugin:vue/vue3-essential'
    ]
  }
  const addDependencyAndExtend = (name) => {
    addDependency(name)
    eslintrcConfig.extends.push(name)
  }

  let needsFlatCompat = false
  const flatConfigExtends = []
  const flatConfigImports = []
  flatConfigImports.push(`import pluginVue from 'eslint-plugin-vue'`)
  flatConfigExtends.push(
    vueVersion.startsWith('2')
      ? `...pluginVue.configs['flat/vue2-essential']`
      : `...pluginVue.configs['flat/essential']`
  )

  if (configFormat === 'flat' && styleGuide === 'default') {
    addDependency('@eslint/js')
  }

  switch (`${styleGuide}-${language}`) {
    case 'default-javascript':
      eslintrcConfig.extends.push('eslint:recommended')
      flatConfigImports.push(`import js from '@eslint/js'`)
      flatConfigExtends.push('js.configs.recommended')
      break
    case 'default-typescript':
      eslintrcConfig.extends.push('eslint:recommended')
      flatConfigImports.push(`import js from '@eslint/js'`)
      flatConfigExtends.push('js.configs.recommended')
      addDependencyAndExtend('@vue/eslint-config-typescript')
      needsFlatCompat = true
      flatConfigExtends.push(`...compat.extends('@vue/eslint-config-typescript')`)
      break
    case 'airbnb-javascript':
    case 'standard-javascript':
      addDependencyAndExtend(`@vue/eslint-config-${styleGuide}`)
      needsFlatCompat = true
      flatConfigExtends.push(`...compat.extends('@vue/eslint-config-${styleGuide}')`)
      break
    case 'airbnb-typescript':
    case 'standard-typescript':
      addDependencyAndExtend(`@vue/eslint-config-${styleGuide}-with-typescript`)
      needsFlatCompat = true
      flatConfigExtends.push(`...compat.extends('@vue/eslint-config-${styleGuide}-with-typescript')`)
      break
    default:
      throw new Error(`unexpected combination of styleGuide and language: ${styleGuide}-${language}`)
  }

  deepMerge(pkg.devDependencies, additionalDependencies)
  deepMerge(eslintrcConfig, additionalConfig)

  if (additionalConfig?.extends) {
    needsFlatCompat = true
    additionalConfig.extends.forEach((pkgName) => {
      flatConfigExtends.push(`...compat.extends('${pkgName}')`)
    })
  }

  const flatConfigEntry = {
    files: filePatterns
  }
  if (additionalConfig?.settings?.[CREATE_ALIAS_SETTING_PLACEHOLDER]) {
    flatConfigImports.push(
      `import createAliasSetting from '@vue/eslint-config-${styleGuide}/createAliasSetting'`
    )
    flatConfigEntry.settings = {
      [CREATE_ALIAS_SETTING_PLACEHOLDER]: 
        additionalConfig.settings[CREATE_ALIAS_SETTING_PLACEHOLDER]
    }
  }

  if (needsPrettier) {
    addDependency('prettier')
    addDependency('@vue/eslint-config-prettier')
    eslintrcConfig.extends.push('@vue/eslint-config-prettier/skip-formatting')
    needsFlatCompat = true
    flatConfigExtends.push(`...compat.extends('@vue/eslint-config-prettier/skip-formatting')`)
  }

  const configFilename = configFormat === 'flat'
    ? 'eslint.config.js'
    : '.eslintrc.cjs'
  const files = {
    [configFilename]: ''
  }

  if (styleGuide === 'default') {
    // Both Airbnb & Standard have already set `env: node`
    if (configFormat === 'eslintrc') {
      files['.eslintrc.cjs'] += '/* eslint-env node */\n'
    }

    // Both Airbnb & Standard have already set `ecmaVersion`
    // The default in eslint-plugin-vue is 2020, which doesn't support top-level await
    eslintrcConfig.parserOptions = {
      ecmaVersion: 'latest'
    }
    flatConfigEntry.languageOptions = {
      ecmaVersion: 'latest'
    }
  }

  if (pkg.devDependencies['@rushstack/eslint-patch']) {
    files['.eslintrc.cjs'] += "require('@rushstack/eslint-patch/modern-module-resolution')\n\n"
  }

  // eslint.config.js | .eslintrc.cjs
  if (configFormat === 'flat') {
    if (needsFlatCompat) {
      files['eslint.config.js'] += "import path from 'node:path'\n"
      files['eslint.config.js'] += "import { fileURLToPath } from 'node:url'\n\n"

      addDependency('@eslint/eslintrc')
      files['eslint.config.js'] += "import { FlatCompat } from '@eslint/eslintrc'\n"
    }

    // imports
    flatConfigImports.forEach((pkgImport) => {
      files['eslint.config.js'] += `${pkgImport}\n`
    })
    files['eslint.config.js'] += '\n'

    // neccesary for compatibility until all packages support flat config
    if (needsFlatCompat) {
      files['eslint.config.js'] += 'const __filename = fileURLToPath(import.meta.url)\n'
      files['eslint.config.js'] += 'const __dirname = path.dirname(__filename)\n'
      files['eslint.config.js'] += 'const compat = new FlatCompat({\n'
      files['eslint.config.js'] += '  baseDirectory: __dirname'
      if (pkg.devDependencies['@vue/eslint-config-typescript']) {
        files['eslint.config.js'] += ',\n  recommendedConfig: js.configs.recommended'
      }
      files['eslint.config.js'] += '\n})\n\n'
    }
    
    files['eslint.config.js'] += 'export default [\n'
    flatConfigExtends.forEach((usage) => {
      files['eslint.config.js'] += `  ${usage},\n`
    })

    const [, ...keep] = stringifyJS([flatConfigEntry], styleGuide, "flat").split('{')
    files['eslint.config.js'] += `  {${keep.join('{')}\n`
  } else {
    files['.eslintrc.cjs'] += `module.exports = ${stringifyJS(eslintrcConfig, styleGuide)}\n`
  }

  // .editorconfig & .prettierrc.json
  if (editorconfigs[styleGuide]) {
    files['.editorconfig'] = editorconfigs[styleGuide]
  }
  if (needsPrettier) {
    // Prettier recommends an explicit configuration file to let the editor know that it's used.
    files['.prettierrc.json'] = JSON.stringify(prettierrcs[styleGuide], undefined, 2)
  }

  return {
    pkg,
    files
  }
}
