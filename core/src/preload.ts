import { contextBridge, ipcRenderer } from "electron";
import {
  PluginFile,
  SnailAPI,
  ThemeListItem,
  PluginListItem,
} from "snail-plugin-api";
import { setupWebpackHelpers } from "./utils/webpack";
import { setupReactPatch } from "./utils/react";

const plugins: {
  [pluginId: string]: {
    scriptID: string;
    running?: boolean;
  };
} = {};

const injectCSS = (code: string, id: string): void => {
  const style = document.createElement("style");
  style.setAttribute("data-snail", id);
  style.textContent = code;
  document.head.appendChild(style);
};

const wrapPluginCode = (pluginId: string, code: string): string => `
(function() {
  const Snail = window.Snail;
  const PLUGIN_ID = '${pluginId}';

  // webpack helpers

  try {
    (${setupWebpackHelpers.toString()})();;
  } catch (e) {
    console.error('[snail][plugin:' + PLUGIN_ID + '] error setting up webpack helpers', e);
  }

  // plugin code

  try {
    console.log('[snail][plugin:' + PLUGIN_ID + '] executing plugin code');

    if (!window.SnailPlugins) window.SnailPlugins = {};

    ${code}

    console.log('[snail][plugin:' + PLUGIN_ID + '] plugin code executed');
    const ExportedPlugin = window.SnailPlugins[PLUGIN_ID];

    if (!ExportedPlugin) {
      console.error('[snail][plugin:' + PLUGIN_ID + '] no exported plugin found');
      return;
    }

    Snail.registerPlugin(PLUGIN_ID);

    window.addEventListener("snail:startPlugin", function(e) {
      console.log('[snail][plugin:' + PLUGIN_ID + '] received startPlugin event');
      var evt = e; // e is a CustomEvent
      if (evt.detail && evt.detail.id === PLUGIN_ID) {
        console.log('[snail][plugin:' + PLUGIN_ID + '] starting plugin');
        if (ExportedPlugin.start) ExportedPlugin.start();
      }
    });

    window.addEventListener("snail:stopPlugin", function(e) {
      console.log('[snail][plugin:' + PLUGIN_ID + '] received stopPlugin event');
      var evt = e; // e is a CustomEvent
      if (evt.detail && evt.detail.id === PLUGIN_ID) {
        console.log('[snail][plugin:' + PLUGIN_ID + '] stopping plugin');
        if (ExportedPlugin.stop) ExportedPlugin.stop();
      }
    });

  } catch (err) {
    console.error('[snail][plugin:' + PLUGIN_ID + '] plugin execution error', err);
  }
})();
`;

function startPlugin(pluginId: string) {
  const plugin = plugins[pluginId];
  if (!plugin) return;

  plugin.running = true;

  const uuid = crypto.randomUUID();
  const uuidNoDash = uuid.replace(/-/g, "");

  const code = `
  const event${uuidNoDash} = new CustomEvent("snail:startPlugin", {
    detail: { id: "${pluginId}" },
  });
  window.dispatchEvent(event${uuidNoDash});
  `;

  console.log(`[snail] Starting plugin: ${pluginId} with code: ${code}`);

  injectJS(code);

  console.log(`[snail] Plugin started: ${pluginId}`);
}

function stopPlugin(pluginId: string) {
  const plugin = plugins[pluginId];
  if (!plugin) return;

  const uuid = crypto.randomUUID();
  const uuidNoDash = uuid.replace(/-/g, "");

  plugin.running = false;
  const code = `
  const event${uuidNoDash} = new CustomEvent("snail:stopPlugin", {
    detail: { id: "${pluginId}" },
  });
  window.dispatchEvent(event${uuidNoDash});
  `;

  console.log(`[snail] Stopping plugin: ${pluginId} with code: ${code}`);

  injectJS(code);

  console.log(`[snail] Plugin stopped: ${pluginId}`);
}

const getPluginList = (): PluginListItem[] =>
  ipcRenderer.sendSync("SNAIL_GET_PLUGIN_LIST");

const getPluginFile = (pluginId: string): PluginFile | null =>
  ipcRenderer.sendSync("SNAIL_GET_PLUGIN_FILE", pluginId);

function injectJS(code: string): void {
  ipcRenderer.send("SNAIL_INJECT_JS", code);
}

const loadPlugin = (pluginId: string): boolean => {
  const file = getPluginFile(pluginId);
  if (!file) {
    console.warn(`[snail] Plugin file not found for ${pluginId}`);
    return false;
  }

  if (file.css) {
    injectCSS(file.css, `plugin-${pluginId}-style`);
  }

  if (file.code) {
    const wrapped = wrapPluginCode(pluginId, file.code);
    // inject the js
    injectJS(wrapped);
    return true;
  } else {
    console.warn(`[snail] No code found in plugin file for ${pluginId}`);
    return false;
  }
};

const getThemeList = (): ThemeListItem[] =>
  ipcRenderer.sendSync("SNAIL_GET_THEME_LIST");

const getThemeFile = (themeId: string): PluginFile | null =>
  ipcRenderer.sendSync("SNAIL_GET_THEME_FILE", themeId);

const loadTheme = (themeId: string): boolean => {
  console.log(`[snail] Theme ${themeId} loaded.`);
  const file = getThemeFile(themeId);
  if (!file || !file.css) {
    console.warn(`[snail] Theme file not found or no CSS for ${themeId}`);
    return false;
  }

  injectCSS(file.css, `plugin-${themeId}-style`);
  return true;
};

const unloadTheme = (themeId: string): void => {
  document
    .querySelectorAll(`style[data-snail="plugin-${themeId}-style"]`)
    .forEach((el) => el.remove());

  console.log(`[snail] Theme ${themeId} unloaded.`);
};

const enableTheme = (themeId: string): boolean => {
  const success: boolean = ipcRenderer.sendSync("SNAIL_ENABLE_THEME", themeId);
  loadTheme(themeId);
  return success;
};

const disableTheme = (themeId: string): boolean => {
  unloadTheme(themeId);
  return ipcRenderer.sendSync("SNAIL_DISABLE_THEME", themeId);
};

const enablePlugin = (pluginId: string): boolean => {
  const success: boolean = ipcRenderer.sendSync(
    "SNAIL_ENABLE_PLUGIN",
    pluginId,
  );
  if (success) {
    try {
      startPlugin(pluginId);
    } catch (e) {
      console.error(`[snail][plugin:${pluginId}] error during enable`, e);
      return false;
    }
    return true;
  }
  return false;
};

const disablePlugin = (pluginId: string): boolean => {
  try {
    stopPlugin(pluginId);
  } catch (e) {
    console.error(`[snail][plugin:${pluginId}] error during disable`, e);
    return false;
  }
  return ipcRenderer.sendSync("SNAIL_DISABLE_PLUGIN", pluginId);
};

const registerPlugin = (pluginId: string) => {
  console.log(`[snail] Registering plugin: ${pluginId}`);
  plugins[pluginId] = {
    scriptID: plugins[pluginId]?.scriptID || "",
    running: false,
  };
  console.log(`[snail] Plugin registered: ${pluginId}`);
  // if the plugin is enabled, start it immediately
  if (getPluginList().find((p) => p.id === pluginId)?.enabled) {
    startPlugin(pluginId);
  }
};

const installPlugin = (): Promise<{ success: boolean; message: string }> => {
  return ipcRenderer.invoke("SNAIL_INSTALL_NEW_PLUGIN");
};

const SnailGlobal: SnailAPI = {
  getPluginList,
  getThemeList,
  enableTheme,
  disableTheme,
  enablePlugin,
  disablePlugin,
  registerPlugin,
  installPlugin,
  updateLoader: (): boolean => {
    ipcRenderer.send("SNAIL_UPDATE_LOADER");
    return true;
  },
};

contextBridge.exposeInMainWorld("Snail", {
  ...SnailGlobal,
  plugins,
});

window.addEventListener("DOMContentLoaded", async () => {
  try {
    // load the webpack & react helpers
    injectJS(`
      (function() {
        try {
          (${setupWebpackHelpers.toString()})();
          console.log(${setupReactPatch.toString()});
          (${setupReactPatch.toString()})();
        } catch (e) {
          console.error('[snail] error during setup', e);
        }
      })();
    `);

    // load plugins
    const plugins = getPluginList();
    console.log(`[snail] Found ${plugins.length} plugins.`);

    for (const plugin of plugins) {
      let res = loadPlugin(plugin.id);
      console.log(
        res
          ? `[snail] Loaded plugin: ${plugin.id}`
          : `[snail] Failed to load plugin: ${plugin.id}`,
      );
    }

    // load themes
    const themes = getThemeList();
    console.log(`[snail] Found ${themes.length} themes.`);

    for (const theme of themes) {
      if (theme.enabled) {
        const success = loadTheme(theme.id);
        console.log(
          success
            ? `[snail] Loaded theme: ${theme.id}`
            : `[snail] Failed to load theme: ${theme.id}`,
        );
      }
    }
  } catch (e) {
    console.error("[snail] error during DOMContentLoaded plugin load", e);
  }
});
