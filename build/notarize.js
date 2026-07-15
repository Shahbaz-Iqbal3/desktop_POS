// macOS notarization step — invoked by electron-builder via `afterSign`
// (see electron-builder.yml). It ONLY runs on macOS builds.
//
// Required env vars (set in CI secrets) to actually notarize:
//   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
// If any are missing, notarization is skipped (local/dev builds still succeed).
//
// `@electron/notarize` is imported lazily so a Windows build (which never calls
// this) does not require the dependency to be installed.
export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const appleId = process.env.APPLE_ID
  const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID

  if (!appleId || !applePassword || !teamId) {
    console.warn('[notarize] Skipping — Apple notarization credentials not set')
    return
  }

  const { notarize } = await import('@electron/notarize')
  console.log('[notarize] Submitting app for notarization...')
  await notarize({
    tool: 'notarytool',
    appBundleId: 'com.pos.app',
    appPath: `${appOutDir}/POS App.app`,
    appleId,
    appleIdPassword: applePassword,
    teamId
  })
  console.log('[notarize] Done')
}
