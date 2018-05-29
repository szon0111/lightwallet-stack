const { ipcRenderer } = require('electron');
const nn = require('node-notifier');
const path = require('path');
const icon = path.join(__dirname, 'build/1024x1024.png');
const isWin = process.platform === 'win32';
const { MeritMiner } = require('merit-miner-node');

const showNotification = (title, message = ' ') => {
  const notification = new Notification(title, { body: message });
  notification.addEventListener('click', () => {
    ipcRenderer.send('notificationClick', true);
  });
};

const showWindowsNotification = (title, message = ' ') => {
  nn.notify({
    title,
    message,
    icon,
    appId: 'wallet.merit.me',
    wait: true,
    sound: true
  });
};

nn.on('click', () => {
  ipcRenderer.send('notificationClick', true);
});

window['electron'] = {
  showNotification: isWin? showWindowsNotification : showNotification,
  MeritMiner
};
