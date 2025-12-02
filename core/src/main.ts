import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { app, ipcMain } from "electron";

interface PluginManifest {
  entry?: string;
  css?: string | string[];
  [key: string]: any;
}

export interface Plugin {
  id: string;
  manifest: PluginManifest;
}

interface PluginWithState extends Plugin {
  enabled: boolean;
}

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

// In-memory cache for config and manifests
let cachedConfig: Config | null = null;
let configLastModified: number = 0;
const manifestCache = new Map<string, { manifest: PluginManifest | null; mtime: number }>();

const getFileMtime = (filePath: string): number => {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
};

const readConfig = (): Config => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const mtime = getFileMtime(CONFIG_FILE);
      if (cachedConfig && mtime === configLastModified) {
        return cachedConfig;
      }
      cachedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      configLastModified = mtime;
      return cachedConfig!;
    }
  } catch (err) {
    console.error("[snail] Failed to read config:", err);
  }
  return { serverUrl: "", pluginsEnabled: [], themesEnabled: [] };
};

const writeConfig = (cfg: Config) => {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  cachedConfig = cfg;
  configLastModified = getFileMtime(CONFIG_FILE);
};

// ---------- Plugin Helpers ----------
const getPluginDirs = (): string[] => {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  return fs
    .readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
};

const readPluginManifest = (pluginId: string): PluginManifest | null => {
  const manifestPath = path.join(PLUGINS_DIR, pluginId, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  
  try {
    const mtime = getFileMtime(manifestPath);
    const cached = manifestCache.get(pluginId);
    if (cached && cached.mtime === mtime) {
      return cached.manifest;
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifestCache.set(pluginId, { manifest, mtime });
    return manifest;
  } catch (err) {
    console.error(`[snail] Failed to read manifest for ${pluginId}:`, err);
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

    const plugins: PluginWithState[] = pluginDirs
      .map((id) => {
        const manifest = readPluginManifest(id);
        if (!manifest) return null;
        return { id, manifest, enabled: cfg.pluginsEnabled.includes(id) };
      })
      .filter(Boolean) as PluginWithState[];

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
