// Notarization stub — replace with real Apple notarization if shipping for macOS.
// For Windows/Linux builds this is a no-op.
exports.default = async function notarize() {
  if (process.platform !== 'darwin') return
  console.log('[notarize] macOS notarization not configured — skipping')
}
