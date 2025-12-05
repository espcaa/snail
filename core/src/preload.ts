import { contextBridge, ipcRenderer } from "electron";
import {
  PluginFile,
  SnailAPI,
  ThemeListItem,
  PluginListItem,
  Plugin,
} from "snail-plugin-api";

const plugins: {
  [pluginId: string]: {
    scriptID: string;
    instance: Plugin | null;
  };
} = {};

const injectCSS = (code: string, id: string): void => {
  const style = document.createElement("style");
  style.setAttribute("data-snail", id);
  style.textContent = code;
  document.head.appendChild(style);
};

const injectModuleScript = (moduleSource: string, id: string): string => {
  const blob = new Blob([moduleSource], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const script = document.createElement("script");
  script.type = "module";
  script.src = url;
  script.setAttribute("data-snail", id);
  const scriptId = `script-${id}-${crypto.randomUUID()}`;
  script.id = scriptId;

  (document.head || document.documentElement).appendChild(script);

  script.addEventListener("load", () => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });

  return scriptId;
};

const wrapPluginCode = (pluginId: string, code: string): string => `
(function() {
  const Snail = window.Snail;
  const pluginId = '${pluginId}';

  try {
    ${code}
  } catch (err) {
    console.error('[snail][plugin:' + pluginId + '] plugin execution error', err);
  }

  if (typeof Plugin !== 'undefined') {
    Snail.registerPlugin(pluginId, Plugin);
  }
})();
`;

const startPlugin = (pluginId: string) => {
  const inst = plugins[pluginId]?.instance;
  inst?.start();
};

const stopPlugin = (pluginId: string) => {
  const inst = plugins[pluginId]?.instance;
  inst?.stop();
};

const getPluginList = (): PluginListItem[] =>
  ipcRenderer.sendSync("SNAIL_GET_PLUGIN_LIST");

const getPluginFile = (pluginId: string): PluginFile | null =>
  ipcRenderer.sendSync("SNAIL_GET_PLUGIN_FILE", pluginId);

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
    const scriptId = injectModuleScript(wrapped, `plugin-${pluginId}`);
    plugins[pluginId] = {
      scriptID: scriptId,
      instance: null,
    };
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
  if (success) loadTheme(themeId);
  return success;
};

const disableTheme = (themeId: string): boolean => {
  unloadTheme(themeId);
  return ipcRenderer.sendSync("SNAIL_DISABLE_THEME", themeId);
};

const enablePlugin = async (pluginId: string): Promise<boolean> => {
  const success: boolean = ipcRenderer.sendSync(
    "SNAIL_ENABLE_PLUGIN",
    pluginId,
  );
  if (success) return (startPlugin(pluginId), true);
  return false;
};

const disablePlugin = (pluginId: string): boolean => {
  stopPlugin(pluginId);
  return ipcRenderer.sendSync("SNAIL_DISABLE_PLUGIN", pluginId);
};

const registerPlugin = (pluginId: string, instance: Plugin) => {
  plugins[pluginId] = {
    scriptID: plugins[pluginId]?.scriptID || "",
    instance,
  };
  console.log(`[snail] Plugin registered: ${pluginId}`);
};

const SnailGlobal: SnailAPI = {
  getPluginList,
  getThemeList,
  enableTheme,
  disableTheme,
  enablePlugin,
  disablePlugin,
  registerPlugin,
};

contextBridge.exposeInMainWorld("Snail", {
  ...SnailGlobal,
  plugins,
});

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const plugins = getPluginList();
    console.log(`[snail] Found ${plugins.length} plugins.`);

    for (const plugin of plugins) {
      let res = loadPlugin(plugin.id);
      console.log(
        res
          ? `[snail] Loaded plugin: ${plugin.id}`
          : `[snail] Failed to load plugin: ${plugin.id}`,
      );

      // start all the plugins that are enabled
      if (plugin.enabled && res) {
        startPlugin(plugin.id);
        console.log(`[snail] Started plugin: ${plugin.id}`);
      }
    }

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
