import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { homedir } from 'os'
import { generatePlist, getServiceLabel, getPlistPath } from '../../service/installer.js'

const BASE_OPTS = {
  label: 'com.engram.server',
  nodePath: '/usr/local/bin/node',
  serverPath: '/Users/test/.npm-global/lib/node_modules/engram/dist/server.js',
  port: 7337,
  logDir: join(homedir(), '.engram', 'logs'),
}

describe('generatePlist', () => {
  it('contains the correct label', () => {
    const plist = generatePlist(BASE_OPTS)
    expect(plist).toContain('com.engram.server')
  })

  it('contains the node path', () => {
    const plist = generatePlist(BASE_OPTS)
    expect(plist).toContain('/usr/local/bin/node')
  })

  it('contains the server path', () => {
    const plist = generatePlist(BASE_OPTS)
    expect(plist).toContain(BASE_OPTS.serverPath)
  })

  it('contains ENGRAM_GLOBAL=true env var', () => {
    const plist = generatePlist(BASE_OPTS)
    expect(plist).toContain('ENGRAM_GLOBAL')
    expect(plist).toContain('true')
  })

  it('contains ENGRAM_PORT env var with the port value', () => {
    const plist = generatePlist(BASE_OPTS)
    expect(plist).toContain('ENGRAM_PORT')
    expect(plist).toContain('7337')
  })

  it('includes KeepAlive', () => {
    const plist = generatePlist(BASE_OPTS)
    expect(plist).toContain('KeepAlive')
  })

  it('includes RunAtLoad', () => {
    const plist = generatePlist(BASE_OPTS)
    expect(plist).toContain('RunAtLoad')
  })

  it('includes stdout log path using logDir', () => {
    const plist = generatePlist(BASE_OPTS)
    expect(plist).toContain(BASE_OPTS.logDir)
    expect(plist.toLowerCase()).toContain('stdout')
  })

  it('includes stderr log path', () => {
    const plist = generatePlist(BASE_OPTS)
    expect(plist.toLowerCase()).toContain('stderr')
  })

  it('is valid XML (starts with <?xml)', () => {
    const plist = generatePlist(BASE_OPTS)
    expect(plist.trim()).toMatch(/^<\?xml/)
  })
})

describe('getServiceLabel', () => {
  it('returns com.engram.server', () => {
    expect(getServiceLabel()).toBe('com.engram.server')
  })
})

describe('getPlistPath', () => {
  it('returns a path under ~/Library/LaunchAgents/', () => {
    const expected = join(homedir(), 'Library', 'LaunchAgents')
    expect(getPlistPath()).toContain(expected)
  })

  it('filename contains com.engram.server.plist', () => {
    expect(getPlistPath()).toContain('com.engram.server.plist')
  })
})
