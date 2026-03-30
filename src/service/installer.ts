import { join } from 'path'
import { homedir } from 'os'

export interface PlistOptions {
  label: string
  nodePath: string
  serverPath: string
  port: number
  logDir: string
}

export function generatePlist(opts: PlistOptions): string {
  const { label, nodePath, serverPath, port, logDir } = opts
  const stdoutLog = join(logDir, 'stdout.log')
  const stderrLog = join(logDir, 'stderr.log')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${serverPath}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ENGRAM_GLOBAL</key>
    <string>true</string>
    <key>ENGRAM_PORT</key>
    <string>${port}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${stdoutLog}</string>
  <key>StandardErrorPath</key>
  <string>${stderrLog}</string>
</dict>
</plist>
`
}

export function getServiceLabel(): string {
  return 'com.engram.server'
}

export function getPlistPath(): string {
  return join(homedir(), 'Library', 'LaunchAgents', `${getServiceLabel()}.plist`)
}
