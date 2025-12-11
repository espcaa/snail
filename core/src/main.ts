import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { app, ipcMain, session } from "electron";

import {
  PluginListItem,
  ThemeListItem,
  PluginManifest,
  ThemeManifest,
} from "snail-plugin-api";
import { dialog } from "electron/main";

const BASE_DIR = path.join(os.homedir(), ".snail");
const PLUGINS_DIR = path.join(BASE_DIR, "plugins");
const CONFIG_FILE = path.join(BASE_DIR, "config.json");
const THEMES_DIR = path.join(BASE_DIR, "themes");
const PRELOAD = path.join(BASE_DIR, "internal", "preload.js");

// ---------- Config Helpers ----------
interface Config {
  serverUrl: string;
  pluginsEnabled: string[];
  themesEnabled: string[];
  loaderVersion?: string;
}

let mainWindow: Electron.BrowserWindow | null = null;

ipcMain.on("SNAIL_INJECT_JS", (ev, code: string) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.error("[snail] Cannot inject JS: no active main window");
    return;
  }

  const wc = mainWindow.webContents;

  if (wc.isLoading()) {
    wc.once("did-finish-load", () => {
      wc.executeJavaScript(code).catch((err) => {
        console.error("[snail] Failed to inject JS after load:", err);
      });
    });
    return;
  }

  wc.executeJavaScript(code).catch((err) => {
    console.error("[snail] Failed to inject JS:", err);
  });
});

const readConfig = (): Config => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch (err) {
    console.error("[snail] Failed to read config:", err);
  }
  return { serverUrl: "", pluginsEnabled: [], themesEnabled: [] };
};

const writeConfig = (cfg: Config) => {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
};

// ---------- Plugin Helpers ----------
const getPluginDirs = (): string[] => {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  return fs
    .readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
};

const getThemeDirs = (): string[] => {
  if (!fs.existsSync(THEMES_DIR)) return [];
  return fs
    .readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
};

const readPluginManifest = (pluginId: string): PluginManifest | null => {
  const manifestPath = path.join(PLUGINS_DIR, pluginId, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.error(`[snail] Failed to read manifest for ${pluginId}:`, err);
    return null;
  }
};

const readThemeManifest = (themeId: string): ThemeManifest | null => {
  const manifestPath = path.join(THEMES_DIR, themeId, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.error(`[snail] Failed to read manifest for theme ${themeId}:`, err);
    return null;
  }
};

const readPluginFiles = (pluginId: string): { code?: string; css?: string } => {
  const pluginPath = path.join(PLUGINS_DIR, pluginId);
  const result: { code?: string; css?: string } = {};
  const manifest = readPluginManifest(pluginId);
  if (!manifest) return result;

  // JS entry
  if (manifest.entry) {
    const entryPath = path.join(pluginPath, manifest.entry);
    if (fs.existsSync(entryPath)) {
      result.code = fs.readFileSync(entryPath, "utf8");
    }
  }

  // CSS files
  if (manifest.css) {
    const cssFiles = Array.isArray(manifest.css)
      ? manifest.css
      : [manifest.css];
    result.css = cssFiles
      .map((f) => {
        const cssPath = path.join(pluginPath, f);
        if (fs.existsSync(cssPath)) return fs.readFileSync(cssPath, "utf8");
        return "";
      })
      .join("\n");
  }

  return result;
};

// ---------- IPC Handlers ----------
ipcMain.on("SNAIL_GET_PLUGIN_LIST", (e) => {
  try {
    const pluginDirs = getPluginDirs();
    const cfg = readConfig();

    const plugins: PluginListItem[] = pluginDirs
      .map((id) => {
        const manifest = readPluginManifest(id);
        if (!manifest) return null;
        return {
          id,
          manifest,
          enabled: cfg.pluginsEnabled.includes(id),
          name: manifest.name || id,
          description: manifest.description || "",
          version: manifest.version || "1.0.0",
          author: manifest.author,
          icon: manifest.icon,
        };
      })
      .filter(Boolean) as PluginListItem[];

    e.returnValue = plugins;
  } catch (err) {
    console.error("[snail] Error getting plugins:", err);
    e.returnValue = [];
  }
});

ipcMain.on("SNAIL_ENABLE_PLUGIN", (e, pluginId: string) => {
  const cfg = readConfig();
  if (!cfg.pluginsEnabled.includes(pluginId)) {
    cfg.pluginsEnabled.push(pluginId);
    writeConfig(cfg);
    console.log(`[snail] Enabled plugin: ${pluginId}`);
  }
  e.returnValue = true;
});

ipcMain.on("SNAIL_DISABLE_PLUGIN", (e, pluginId: string) => {
  const cfg = readConfig();
  cfg.pluginsEnabled = cfg.pluginsEnabled.filter((id) => id !== pluginId);
  writeConfig(cfg);
  console.log(`[snail] Disabled plugin: ${pluginId}`);
  e.returnValue = true;
});

ipcMain.on("SNAIL_ENABLE_THEME", (e, themeId: string) => {
  console.log(`[snail] Enabling theme: ${themeId}`);
  const cfg = readConfig();
  if (!cfg.themesEnabled.includes(themeId)) {
    cfg.themesEnabled.push(themeId);
    writeConfig(cfg);
    console.log(`[snail] Enabled theme: ${themeId}`);
  }
  e.returnValue = true;
  console.log(`[snail] Theme enabled: ${themeId}`);
});

ipcMain.on("SNAIL_DISABLE_THEME", (e, themeId: string) => {
  const cfg = readConfig();
  cfg.themesEnabled = cfg.themesEnabled.filter((id) => id !== themeId);
  writeConfig(cfg);
  console.log(`[snail] Disabled theme: ${themeId}`);
  e.returnValue = true;
});

ipcMain.on("SNAIL_GET_THEME_LIST", (e) => {
  try {
    const themeDirs = getThemeDirs();
    const cfg = readConfig();

    const themes: ThemeListItem[] = themeDirs
      .map((id) => {
        const manifest = readThemeManifest(id);
        if (!manifest) return null;
        return {
          id,
          manifest,
          enabled: cfg.themesEnabled.includes(id),
          name: manifest.name || id,
          description: manifest.description || "",
          version: manifest.version || "1.0.0",
          author: manifest.author,
          icon: manifest.icon,
        };
      })
      .filter(Boolean) as ThemeListItem[];

    e.returnValue = themes;
  } catch (err) {
    console.error("[snail] Error getting plugins:", err);
    e.returnValue = [];
  }
});

ipcMain.on("SNAIL_GET_THEME_FILE", (e, themeId: string) => {
  const themePath = path.join(THEMES_DIR, themeId);
  const result: { css?: string } = {};
  const manifest = readThemeManifest(themeId);
  if (!manifest) {
    e.returnValue = result;
    return;
  }

  // CSS files
  if (manifest.css) {
    const cssFiles = Array.isArray(manifest.css)
      ? manifest.css
      : [manifest.css];
    result.css = cssFiles
      .map((f) => {
        const cssPath = path.join(themePath, f);
        if (fs.existsSync(cssPath)) return fs.readFileSync(cssPath, "utf8");
        return "";
      })
      .join("\n");
  }

  e.returnValue = result;
});

ipcMain.on("SNAIL_GET_PLUGIN_FILE", (e, pluginId: string) => {
  const files = readPluginFiles(pluginId);
  e.returnValue = files;
});

// ---------- Updating Snail loader \o/ ----------

function updateLoader() {
  const internalDir = path.join(BASE_DIR, "internal");

  const serverUrl =
    readConfig().serverUrl || "https://assets.snail.hackclub.cc";
  const preloadUrl = `${serverUrl}/assets/preload.js`;
  const mainUrl = `${serverUrl}/assets/main.js`;

  fs.mkdirSync(internalDir, { recursive: true });

  // Download preload.js
  fetch(preloadUrl)
    .then((res) => {
      if (!res.ok)
        throw new Error(`Failed to download preload.js: ${res.status}`);
      return res.text();
    })
    .then((data) => {
      fs.writeFileSync(PRELOAD, data, "utf8");
      console.log("[snail] Updated preload.js");
    })
    .catch((err) => {
      console.error("[snail] Error updating preload.js:", err);
    });

  // Download main.js
  const mainPath = path.join(internalDir, "main.js");
  fetch(mainUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to download main.js: ${res.status}`);
      return res.text();
    })
    .then((data) => {
      fs.writeFileSync(mainPath, data, "utf8");
      console.log("[snail] Updated main.js");
    })
    .catch((err) => {
      console.error("[snail] Error updating main.js:", err);
    });
}

ipcMain.on("SNAIL_UPDATE_LOADER", () => {
  updateLoader();
});

function checkForUpdate(): boolean {
  const serverUrl =
    readConfig().serverUrl || "https://assets.snail.hackclub.cc";
  const currentVersion = readConfig().loaderVersion || "0.0.0";
  const versionUrl = `${serverUrl}/info.json`;

  fetch(versionUrl)
    .then((res) => {
      if (!res.ok)
        throw new Error(`Failed to fetch version info: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      const latestVersion = data.version;
      if (latestVersion !== currentVersion) {
        console.log(
          `[snail] New loader version available: ${latestVersion} (current: ${currentVersion})`,
        );
        return true;
      } else {
        console.log("[snail] Loader is up to date.");
        return false;
      }
    })
    .catch((err) => {
      console.error("[snail] Error checking for loader update:", err);
      return false;
    });
  return false;
}

ipcMain.on("SNAIL_CHECK_LOADER_UPDATE", (e) => {
  const hasUpdate = checkForUpdate();
  e.returnValue = hasUpdate;
});

// ---------- Plugin install helpers ----------
ipcMain.on("SNAIL_INSTALL_NEW_PLUGIN", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: ".zip Files", extensions: ["zip"] }],
  });
  if (canceled || filePaths.length === 0) {
    console.log("[snail] Plugin installation canceled.");
    return;
  }
  const zipPath = filePaths[0];
  console.log(`[snail] Selected plugin zip: ${zipPath}`);

  // unzip and put in ~/.snail/plugins (if the folder already exists, overwrite)
  const yauzl = require("yauzl");
  yauzl.open(zipPath, { lazyEntries: true }, (err: any, zipfile: any) => {
    if (err) {
      console.error("[snail] Failed to open zip file:", err);
      return;
    }
    zipfile.readEntry();
    zipfile.on("entry", (entry: any) => {
      const filePath = path.join(PLUGINS_DIR, entry.fileName);
      if (entry.fileName.endsWith("/")) {
        // Directory
        // Check if it's in ~/.snail/plugins
        if (!filePath.startsWith(PLUGINS_DIR)) {
          console.error(`[snail] Invalid plugin structure: ${entry.fileName}`);
          zipfile.close();
          return;
        }
        fs.mkdirSync(filePath, { recursive: true });
        zipfile.readEntry();
      } else {
        // File
        zipfile.openReadStream(entry, (err: any, readStream: any) => {
          if (err) {
            console.error("[snail] Failed to read zip entry:", err);
            return;
          }
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          const writeStream = fs.createWriteStream(filePath);
          readStream.pipe(writeStream);
          readStream.on("end", () => {
            zipfile.readEntry();
          });
        });
      }
    });
    zipfile.on("end", () => {
      console.log("[snail] Plugin installation completed.");
    });
  });
});

// ---------- App Event Handlers ----------

app.once("browser-window-created", (ev, win) => {
  const pre = win.webContents.session.getPreloads() || [];
  if (!pre.includes(PRELOAD)) {
    win.webContents.session.setPreloads([...pre, PRELOAD]);
    mainWindow = win;
  }
});
