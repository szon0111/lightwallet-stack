const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const checkForUpdates = async () => {
  if (process.platform === 'linux') {
    // Auto update is not available
    return;
  }

  try {
    const res = await autoUpdater.checkForUpdates();
    if (res && res.updateInfo && res.updateInfo.files && res.updateInfo.files.length) {
      log.info('Got an update: ', res.updateInfo);

      const file = res.updateInfo.files[0];

      return {
        size: (Math.round(file.size / 1024 / 1024 * 100) / 100) + 'MB',
        releaseDate: res.updateInfo.releaseDate,
        releaseNotes: res.updateInfo.releaseNotes,
        version: res.updateInfo.version
      };
    }
  } catch (err) {
    log.error('Error checking for updates: ', err);
  }
};

const downloadUpdate = async progressCallback => {
  autoUpdater.on('download-progress', progressCallback);
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    log.error('Error downloading update', err);
  }
};

const installUpdate = () => autoUpdater.quitAndInstall(false, true);

module.exports = {
  checkForUpdates,
  downloadUpdate,
  installUpdate
};
