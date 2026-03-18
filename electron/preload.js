const { contextBridge, ipcRenderer } = require('electron');

function readArg(prefix) {
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

const apiHost = readArg('--tracklet-api-url=');

contextBridge.exposeInMainWorld('TRACKLET_ELECTRON', {
  isElectron: true,
  apiHost,
  openCreateSuperuser: () => ipcRenderer.invoke('tracklet:create-superuser'),
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  }
});
