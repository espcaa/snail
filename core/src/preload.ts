import { contextBridge, ipcRenderer } from "electron";
import {
  PluginFile,
  SnailPluginInstance,
  SnailAPI,
  ThemeListItem,
  PluginListItem,
} from "snail-plugin-api";
const pluginInstances: {
  [pluginId: string]: {
    scriptId: string;
    instance: SnailPluginInstance | null;
  };
} = {};
const runningPlugins: { [pluginId: string]: boolean } = {};

let currentPluginRegistration: {
  id: string;
  instance: SnailPluginInstance | null;
} = { id: "", instance: null };

const pluginLoadResolvers: {
  [pluginId: string]: ((value: unknown) => void) | null;
} = {};

const registerPlugin = (instance: Omit<SnailPluginInstance, "id">): void => {
  if (!currentPluginRegistration.id) {
    console.error(
      "[snail] registerPlugin called outside of a loading context.",
    );
    return;
  }

  const finalInstance = instance as SnailPluginInstance;
  finalInstance.id = currentPluginRegistration.id;

  currentPluginRegistration.instance = finalInstance;

  console.log(
    `[snail] Plugin ${currentPluginRegistration.id} registered successfully.`,
  );

  const resolver = pluginLoadResolvers[currentPluginRegistration.id];
  if (resolver) {
    resolver(true);
    delete pluginLoadResolvers[currentPluginRegistration.id];
  }
};

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

const wrapPluginCode = (pluginId: string, code: string): string => {
  return `
    (function() {
      const Snail = window.Snail;
      const pluginId = '${pluginId}';

      try {
        ${code}
      } catch (err) {
        console.error('[snail][plugin:' + pluginId + '] plugin execution error', err);
      }

      var isRunningCache = false;
      setInterval(() => {
        const currentlyRunning = Snail.isPluginRunning(pluginId);

        const pluginData = Snail.pluginInstances[pluginId];
        const inst = pluginData ? pluginData.instance : null;

        if (currentlyRunning && !isRunningCache) {
          try {
              inst.start();
              console.log('[snail][plugin:' + pluginId + '] start() invoked.');
              isRunningCache = true;
          } catch (e) {
              console.error('[snail][plugin:' + pluginId + '] error during start():', e);
          }
        } else if (!currentlyRunning && isRunningCache) {
          try {
              inst.stop();
              console.log('[snail][plugin:' + pluginId + '] stop() invoked.');
              isRunningCache = false;
          } catch (e) {
              console.error('[snail][plugin:' + pluginId + '] error during stop():', e);
          }
        }
      }, 100);
    })();
  `;
};

const getPluginList = (): PluginListItem[] =>
  ipcRenderer.sendSync("SNAIL_GET_PLUGIN_LIST");

const getPluginFile = (pluginId: string): PluginFile | null =>
  ipcRenderer.sendSync("SNAIL_GET_PLUGIN_FILE", pluginId);

const loadPlugin = async (pluginId: string): Promise<boolean> => {
  const file = getPluginFile(pluginId);
  if (!file) {
    console.warn(`[snail] Plugin file not found for ${pluginId}`);
    return false;
  }

  if (file.css) {
    injectCSS(file.css, `plugin-${pluginId}-style`);
  }

  if (file.code) {
    currentPluginRegistration = { id: pluginId, instance: null };

    const wrapped = wrapPluginCode(pluginId, file.code);
    const scriptId = injectModuleScript(wrapped, `plugin-${pluginId}`);

    const pluginLoadPromise = new Promise((resolve) => {
      pluginLoadResolvers[pluginId] = resolve;
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Timeout: registerPlugin not called for ${pluginId}`),
          ),
        1000,
      ),
    );

    let loadSuccessful = false;
    try {
      await Promise.race([pluginLoadPromise, timeoutPromise]);
      loadSuccessful = !!currentPluginRegistration.instance;
    } catch (e) {
      console.warn(
        `[snail] Plugin ${pluginId} failed to load within time/error:`,
        e,
      );
      loadSuccessful = false;
    }

    if (loadSuccessful) {
      runningPlugins[pluginId] = true;
      pluginInstances[pluginId] = {
        scriptId,
        instance: currentPluginRegistration.instance,
      };
      console.log(`[snail] Plugin ${pluginId} successfully initialized.`);
      return true;
    } else {
      console.error(`[snail] Plugin ${pluginId} failed to register.`);
      document.getElementById(scriptId)?.remove();
      document
        .querySelector(`style[data-snail="plugin-${pluginId}-style"]`)
        ?.remove();
      return false;
    }
  }

  return false;
};

const isPluginRunning = (pluginId: string): boolean => {
  return !!runningPlugins[pluginId];
};

const unloadPlugin = (pluginId: string): void => {
  const inst = pluginInstances[pluginId]?.instance;

  if (inst && typeof inst.stop === "function") {
    try {
      inst.stop();
      console.log(`[snail] Plugin ${pluginId} stop() invoked during unload.`);
    } catch (err) {
      console.error(`[snail] Error stopping ${pluginId} during unload:`, err);
    }
  }

  delete pluginInstances[pluginId];
  delete runningPlugins[pluginId];

  document
    .querySelectorAll(`script[data-snail="plugin-${pluginId}"]`)
    .forEach((el) => el.remove());

  document
    .querySelectorAll(`style[data-snail="plugin-${pluginId}-style"]`)
    .forEach((el) => el.remove());

  console.log(`[snail] Plugin ${pluginId} fully unloaded.`);
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
  if (success) return await loadPlugin(pluginId);
  return false;
};

const disablePlugin = (pluginId: string): boolean => {
  unloadPlugin(pluginId);
  return ipcRenderer.sendSync("SNAIL_DISABLE_PLUGIN", pluginId);
};

const SnailGlobal: SnailAPI = {
  registerPlugin,
  getPluginList,
  getThemeList,
  enableTheme,
  disableTheme,
  enablePlugin,
  disablePlugin,
  // Exposing internal structure for wrapped code to access instances
};

contextBridge.exposeInMainWorld("Snail", {
  ...SnailGlobal,
  isPluginRunning,
  pluginInstances,
});

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const plugins = getPluginList();
    console.log(`[snail] Found ${plugins.length} plugins.`);

    for (const plugin of plugins) {
      if (plugin.enabled) {
        const success = await loadPlugin(plugin.id);
        console.log(
          success
            ? `[snail] Loaded plugin: ${plugin.id}`
            : `[snail] Failed to load plugin: ${plugin.id}`,
        );
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
