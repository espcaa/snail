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
}

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

app.once("browser-window-created", (ev, win) => {
  const pre = win.webContents.session.getPreloads() || [];
  if (!pre.includes(PRELOAD)) {
    win.webContents.session.setPreloads([...pre, PRELOAD]);
  }
});

const installExtension = require("electron-devtools-installer").default;
const { REACT_DEVELOPER_TOOLS } = require("electron-devtools-installer");

app.whenReady().then(async () => {
  installExtension(REACT_DEVELOPER_TOOLS)
    .then((name) => console.log(`Added extension: ${name}`))
    .catch((err) => console.log("An error occurred: ", err));
});
