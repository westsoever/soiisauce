// app/cli/plist.ts
// The macOS LaunchAgent that runs soii at login and restarts it if it dies.
export const LABEL = 'com.soii.server'

export interface PlistOptions {
  bun: string
  /** The vault's pinned CLI: `<vault>/.soii/soii/bin/soii.ts`. */
  script: string
  /** `<vault>/.soii`: where `.env.local` is picked up. */
  workingDir: string
  logPath: string
  path: string
  /** More environment for the service, e.g. SOII_CONFIG_DIR when the registry isn't in the default place. */
  env?: Record<string, string>
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function generatePlist(o: PlistOptions): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(o.bun)}</string>
    <string>${esc(o.script)}</string>
    <string>run</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${esc(o.workingDir)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${esc(o.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${esc(o.logPath)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${esc(o.path)}</string>${Object.entries(o.env ?? {})
    .map(([k, v]) => `\n    <key>${esc(k)}</key>\n    <string>${esc(v)}</string>`)
    .join('')}
  </dict>
</dict>
</plist>
`
}
