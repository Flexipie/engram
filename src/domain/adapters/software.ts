import { registerProfile, SOFTWARE_SCOPES, type DomainAdapter } from '../profiles.js'

export class SoftwareAdapter implements DomainAdapter {
  fileToScope(filePath: string): string | null {
    const f = filePath

    if (/\.(test|spec)\.[a-z]+$/.test(f)) return 'testing'
    if (/__tests__\//.test(f)) return 'testing'
    if (/^src\/auth\//.test(f)) return 'auth'
    if (/^src\/api\//.test(f)) return 'api'
    if (/^src\/components\//.test(f)) return 'components'
    if (/^src\/ui\//.test(f)) return 'components'
    if (/^src\/db\//.test(f)) return 'database'
    if (/src\/[^/]*db[^/]*\//.test(f)) return 'database'
    if (/^src\/utils\//.test(f) || /\/utils\//.test(f)) return 'utils'
    if (/^src\/services\//.test(f)) return 'services'
    if (/^src\/types\//.test(f) || /\.types\.[a-z]+$/.test(f)) return 'types'
    if (/^src\/state\//.test(f) || /\/store\//.test(f)) return 'state'
    if (/^src\/routing\//.test(f) || /\/routes\//.test(f)) return 'routing'
    if (/^src\/infra\//.test(f) || /\/infrastructure\//.test(f)) return 'infra'
    if (/^scripts\//.test(f)) return 'scripts'
    if (/(?:webpack|rollup|tsup|babel|eslint|prettier)\.config/.test(f)) return 'build'
    if (/^(Makefile|Dockerfile|\.github\/)/.test(f)) return 'build'
    if (/^src\/config\//.test(f)) return 'config'
    if (/\.config\.[a-z]+$/.test(f)) return 'config'

    return 'general'
  }
}

registerProfile({
  name: 'software',
  description: 'Software development — TypeScript, React, Node, databases, APIs',
  scopes: SOFTWARE_SCOPES,
  adapter: new SoftwareAdapter(),
})
