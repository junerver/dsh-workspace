/**
 * Offline sanity check for this bundle. There is no build step, so CI verifies
 * the shape a DSH profile install depends on: the manifest, the loader patch,
 * the locale metadata, and both JavaScript faces.
 *
 * Checks
 *  1. the package name is one the registry accepts;
 *  2. the manifest declares the bundle patch and the Web client module;
 *  3. `repository.url` names the GitHub slug trusted publishing matches on;
 *  4. every exported and packed path exists;
 *  5. `locale/en.json` and `locale/zh.json` carry display metadata;
 *  6. the detail document the locales name exists;
 *  7. `cordis.patch.yml` inserts exactly this package;
 *  8. `index.js` loads as a module and exports the Cordis plugin face;
 *  9. `client.js` loads through the module loader and registers its slots;
 * 10. the Host half imports nothing from the DSH installation.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const failures = []
const passes = []

/**
 * Record one assertion outcome.
 * @param label - what is being verified.
 * @param run - synchronous or asynchronous assertion; its return value is shown.
 */
async function check(label, run) {
  try {
    const detail = await run()
    passes.push(detail === undefined ? label : `${label} — ${detail}`)
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Assert a condition with a readable message. */
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

await check('package name is a registry-safe scoped name', () => {
  assert(/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/.test(manifest.name),
    `unexpected name ${JSON.stringify(manifest.name)}`)
  assert(manifest.name.length <= 214, 'name exceeds 214 characters')
  return manifest.name
})

await check('manifest declares the bundle patch and client module', () => {
  assert(manifest.type === 'module', 'type must be "module"')
  assert(manifest.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch must point at cordis.patch.yml')
  assert(manifest.dsh?.client?.platform === 'web', 'dsh.client.platform must be "web"')
  assert(manifest.publishConfig?.access === 'public', 'publishConfig.access must be "public"')
  return 'dsh.bundle + dsh.client'
})

await check('repository.url matches the GitHub slug used by trusted publishing', () => {
  const url = manifest.repository?.url ?? ''
  const match = /github\.com[/:]([^/]+)\/([^/#.]+)/.exec(url)
  assert(match !== null, `repository.url is not a GitHub URL: ${url}`)
  return `${match[1]}/${match[2]}`
})

await check('every exported and packed file exists', () => {
  const listed = [...Object.values(manifest.exports ?? {}), ...(manifest.files ?? [])]
  const concrete = listed.filter(entry => typeof entry === 'string' && !entry.includes('*'))
  const missing = concrete.filter(entry => !existsSync(join(root, entry)))
  assert(missing.length === 0, `missing ${missing.join(', ')}`)
  return `${concrete.length} paths`
})

await check('locale files carry Plugin Manager display metadata', () => {
  for (const lang of ['en', 'zh']) {
    const file = join(root, 'locale', `${lang}.json`)
    assert(existsSync(file), `locale/${lang}.json is missing`)
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    for (const field of ['title', 'description']) {
      const value = parsed.meta?.[field]
      assert(typeof value === 'string' && value.trim() !== '', `locale/${lang}.json meta.${field} is empty`)
    }
  }
  return 'en, zh'
})

await check('the detail document named by the locales exists', () => {
  const parsed = JSON.parse(readFileSync(join(root, 'locale', 'en.json'), 'utf8'))
  const detail = parsed.meta?.detail
  if (detail === undefined) return 'none declared'
  assert(existsSync(join(root, detail)), `${detail} is missing`)
  return detail
})

await check('cordis.patch.yml inserts exactly this package', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  const names = [...patch.matchAll(/name:\s*'?([^'\n]+)'?/g)].map(match => match[1].trim())
  assert(names.length === 1, `expected one inserted row, found ${names.length}`)
  assert(names[0] === manifest.name, `patch names ${names[0]}, manifest names ${manifest.name}`)
  return names[0]
})

await check('index.js loads as a module and exports the Cordis plugin face', async () => {
  const url = `${pathToFileURL(join(root, 'index.js')).href}?check=${Date.now()}`
  const loaded = await import(url)
  assert(typeof loaded.apply === 'function', 'index.js must export apply()')
  assert(typeof loaded.name === 'string' && loaded.name !== '', 'index.js must export the plugin name')
  assert(Array.isArray(loaded.inject) && loaded.inject.length > 0, 'index.js must declare injected services')
  return `${loaded.name}; injects ${loaded.inject.join(', ')}`
})

await check('client.js loads through the module loader and registers its slots', async () => {
  const registered = []
  const previous = globalThis.window
  globalThis.window = { __ModuleLoader__: { load: spec => registered.push(spec) } }
  try {
    const url = `${pathToFileURL(join(root, 'client.js')).href}?check=${Date.now()}`
    await import(url)
  } finally {
    if (previous === undefined) delete globalThis.window
    else globalThis.window = previous
  }
  assert(registered.length === 1, `expected one module registration, got ${registered.length}`)
  const spec = registered[0]
  assert(spec.id === manifest.name, `client module id ${spec.id} differs from package name ${manifest.name}`)
  assert(typeof spec.factory === 'function', 'client module must declare a factory')

  // A stand-in React is enough: the factory only builds hooks at render time.
  const react = {
    createElement: () => null,
    Fragment: Symbol('Fragment'),
    useReducer: (_reducer, initial) => [initial, () => {}],
    useEffect: () => {},
  }
  const face = spec.factory(specifier => {
    assert(specifier === 'react', `client module required unexpected "${specifier}"`)
    return react
  })
  assert(typeof face.apply === 'function', 'client face must expose apply()')
  assert(Array.isArray(face.inject) && face.inject.includes('slots'), 'client face must inject slots')

  const source = readFileSync(join(root, 'client.js'), 'utf8')
  for (const slot of [
    'sidebar.workspaces.session.row.action',
    'sidebar.workspaces.session.menu.item',
    'sidebar.session.row.leading',
    'shell.overlay',
  ]) {
    assert(source.includes(`'${slot}'`), `client.js never registers into ${slot}`)
  }
  return `${spec.id}; 4 slots`
})

await check('the Host half imports nothing from the DSH installation', () => {
  // A bundle installed from the registry has no route to `@deepseek-ai/*`; the
  // Host half must reach every service through `ctx` instead.
  const source = readFileSync(join(root, 'index.js'), 'utf8')
  const imports = [...source.matchAll(/from\s+'(@deepseek-ai\/[^']+)'/g)].map(match => match[1])
  assert(imports.length === 0, `index.js imports ${imports.join(', ')}`)
  return 'none'
})

for (const line of passes) console.log(`ok   ${line}`)
for (const line of failures) console.error(`FAIL ${line}`)
console.log(`\n${passes.length} passed, ${failures.length} failed`)
if (failures.length > 0) process.exitCode = 1
