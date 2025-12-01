import { contextBridge, ipcRenderer } from "electron";

type Plugin = {
  id: string;
  enabled: boolean;
};

type PluginFile = {
  code?: string;
  css?: string;
};

// Map to keep track of plugin instances
const pluginInstances: Record<string, any> = {};

// ---------- Helpers ----------
const injectCSS = (code: string, id: string) => {
  const style = document.createElement("style");
  style.setAttribute("data-slackmod", id);
  style.textContent = code;
  document.head.appendChild(style);
};

const injectJSModule = async (code: string, id: string): Promise<any> => {
  const blob = new Blob([code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);

  try {
    const module = await import(url);
    return module.default;
  } finally {
    URL.revokeObjectURL(url);
  }
};

// ---------- Plugin Management ----------
const getPluginList = (): Plugin[] =>
  ipcRenderer.sendSync("SNAIL_GET_PLUGIN_LIST");

const getPluginFile = (pluginId: string): PluginFile | null =>
  ipcRenderer.sendSync("SNAIL_GET_PLUGIN_FILE", pluginId);

const loadPlugin = async (plugin: Plugin): Promise<boolean> => {
  const file = getPluginFile(plugin.id);
  if (!file) return false;

  if (file.css) injectCSS(file.css, `plugin-${plugin.id}-style`);

  if (file.code) {
    try {
      const PluginClass = await injectJSModule(
        file.code,
        `plugin-${plugin.id}`,
      );
      if (!PluginClass) return false;

      const instance = new PluginClass();
      pluginInstances[plugin.id] = instance;

      if (typeof instance.start === "function") instance.start();
      console.log(`[SlackMod] Started plugin: ${plugin.id}`);

      return true;
    } catch (e) {
      console.error(`[SlackMod] Failed to start plugin ${plugin.id}:`, e);
      return false;
    }
  }

  return true;
};

const unloadPlugin = (pluginId: string) => {
  const instance = pluginInstances[pluginId];
  if (instance && typeof instance.stop === "function") {
    try {
      instance.stop();
      console.log(`[SlackMod] Stopped plugin: ${pluginId}`);
    } catch (e) {
      console.error(`[SlackMod] Error stopping plugin ${pluginId}:`, e);
    }
  }

  delete pluginInstances[pluginId];

  document
    .querySelectorAll(`script[data-slackmod="plugin-${pluginId}"]`)
    .forEach((el) => el.remove());
  document
    .querySelectorAll(`style[data-slackmod="plugin-${pluginId}-style"]`)
    .forEach((el) => el.remove());
};

// ---------- Expose API to Renderer ----------
contextBridge.exposeInMainWorld("slackmod_custom", {
  getPluginList,
  getPluginFile,
  enablePlugin: async (pluginId: string) => {
    const success = ipcRenderer.sendSync("SNAIL_ENABLE_PLUGIN", pluginId);
    if (success) await loadPlugin({ id: pluginId, enabled: true });
    return success;
  },
  disablePlugin: (pluginId: string) => {
    unloadPlugin(pluginId);
    return ipcRenderer.sendSync("SNAIL_DISABLE_PLUGIN", pluginId);
  },
});

// ---------- Load enabled plugins on DOM ready ----------
window.addEventListener("DOMContentLoaded", async () => {
  const plugins = getPluginList();
  console.log(`[SlackMod] Found ${plugins.length} plugins.`);

  for (const plugin of plugins) {
    if (plugin.enabled) {
      const success = await loadPlugin(plugin);
      console.log(
        success
          ? `[SlackMod] Loaded plugin: ${plugin.id}`
          : `[SlackMod] Failed to load plugin: ${plugin.id}`,
      );
    }
  }
});
