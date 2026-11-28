/** @param {import('electron').App} app @param {string[]} features */
function enableFeatures(app, features) {
  const named = app.commandLine.getSwitchValue('enable-features').split(',').filter(Boolean);
  app.commandLine.appendSwitch('enable-features', [...new Set([...named, ...features])].join(','));
}

const GPU_FEATURES = ['Vulkan'];

module.exports = { enableFeatures, GPU_FEATURES };
