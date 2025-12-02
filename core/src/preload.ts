import { contextBridge, ipcRenderer } from "electron";

type Plugin = {
  id: string;
  enabled: boolean;
};

type Theme = {
  id: string;
  enabled: boolean;
};

type PluginFile = {
  code?: string;
  css?: string;
};

const pluginInstances: { [pluginId: string]: any } = {};

// ---------- Helpers ----------
const injectCSS = (code: string, id: string) => {
  const style = document.createElement("style");
  style.setAttribute("data-slackmod", id);
  style.textContent = code;
  document.head.appendChild(style);
};

const injectModuleScript = (moduleSource: string, id: string) => {
  const blob = new Blob([moduleSource], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const script = document.createElement("script");
  script.type = "module";
  script.src = url;
  script.setAttribute("data-slackmod", id);
  script.id = `script-${id}-${crypto.randomUUID()}`;

  (document.head || document.documentElement).appendChild(script);

  script.addEventListener("load", () => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });

  return script.id;
};

const wrapPluginCode = (pluginId: string, code: string) => {
  return `
/* Snail plugin wrapper for ${pluginId} - auto-generated */
(function() {
  const log = (...args) => {
    try { console.log('[snail][plugin:${pluginId}]', ...args); } catch {}
  };

  const snail = window.snail || window.Snail || null;
  if (!snail) {
    log('Warning: window.snail is not present. Plugin will still run but snail API calls will fail until available.');
  }

  try {
    ${code}
  } catch (err) {
    console.error('[snail][plugin:${pluginId}] plugin execution error', err);
  }

  // Post-init: try to auto-call start() if plugin object was defined.
  try {
    window.__snailPlugins = window.__snailPlugins || {};
    // plugin authors may expose a plugin global or default export that assigns plugin into scope.
    // we support the old convention: a global named plugin.
    const candidate = (typeof plugin !== 'undefined' ? plugin : undefined);

    // If the module used ESM default export it will not create plugin global.
    // In that case, if the plugin module assigned to window.__snail_lastExport, use that.
    const fallback = window.__snail_lastExport;

    const pluginInstance = candidate || fallback || null;
    if (pluginInstance) {
      window.__snailPlugins["${pluginId}"] = pluginInstance;
      if (typeof pluginInstance.start === 'function') {
        try { pluginInstance.start(); log('start() invoked'); } catch(e) { console.error('[snail] plugin.start error', e); }
      }
    } else {
      log('No plugin instance found (no global plugin and no __snail_lastExport). If you export a default ESM export, ensure the wrapper assigns it to window.__snail_lastExport.');
    }
  } catch (e) {
    console.error('[snail] Plugin post-init failed', e);
  }
})();
`;
};

// ---------- Plugin Management ----------
const getPluginList = (): Plugin[] =>
  ipcRenderer.sendSync("SNAIL_GET_PLUGIN_LIST");

const getPluginFile = (pluginId: string): PluginFile | null =>
  ipcRenderer.sendSync("SNAIL_GET_PLUGIN_FILE", pluginId);

const loadPlugin = async (plugin: Plugin): Promise<boolean> => {
  const file = getPluginFile(plugin.id);
  if (!file) return false;

  if (file.css) {
    injectCSS(file.css, `plugin-${plugin.id}-style`);
  }

  if (file.code) {
    let wrappedSource = file.code;
    if (/\bexport\s+default\b/.test(file.code)) {
      wrappedSource = `
        ${file.code}
      `;
    }

    const wrapped = wrapPluginCode(plugin.id, wrappedSource);
    const scriptId = injectModuleScript(wrapped, `plugin-${plugin.id}`);

    await new Promise((res) => setTimeout(res, 50));

    const instance = (window as any).__snailPlugins?.[plugin.id] || null;

    if (instance && typeof instance.start === "function") {
      pluginInstances[plugin.id] = { scriptId, instance };
      console.log(`[snail] Plugin ${plugin.id} started.`);
      return true;
    }

    pluginInstances[plugin.id] = { scriptId, instance: instance || null };
    console.warn(
      `[snail] Plugin ${plugin.id} did not expose a start() method; check plugin.`,
    );

    return !!instance;
  }

  return false;
};

const getThemeList = (): Theme[] =>
  ipcRenderer.sendSync("SNAIL_GET_THEME_LIST");

const getThemeFile = (themeId: string): PluginFile | null =>
  ipcRenderer.sendSync("SNAIL_GET_THEME_FILE", themeId);

const loadTheme = (theme: Theme): boolean => {
  const file = getThemeFile(theme.id);
  if (!file || !file.css) return false;

  injectCSS(file.css, `plugin-${theme.id}-style`);

  return true;
};

const unloadTheme = (themeId: string) => {
  document
    .querySelectorAll(`style[data-slackmod="plugin-${themeId}-style"]`)
    .forEach((el) => el.remove());
};

const unloadPlugin = (pluginId: string) => {
  const inst = pluginInstances[pluginId]?.instance;

  if (inst && typeof inst.stop === "function") {
    try {
      inst.stop();
    } catch (err) {
      console.error(`[snail] Error stopping ${pluginId}:`, err);
    }
  }

  delete (window as any).__snailPlugins?.[pluginId];
  delete pluginInstances[pluginId];

  document
    .querySelectorAll(`script[data-slackmod="plugin-${pluginId}"]`)
    .forEach((el) => el.remove());

  document
    .querySelectorAll(`style[data-slackmod="plugin-${pluginId}-style"]`)
    .forEach((el) => el.remove());
};

// ---------- Expose API to Renderer ----------
contextBridge.exposeInMainWorld("snail", {
  getPluginList,
  getThemeList,
  enableTheme: (themeId: string) => {
    const success = ipcRenderer.sendSync("SNAIL_ENABLE_THEME", themeId);
    if (success) loadTheme({ id: themeId, enabled: true });
    return success;
  },
  disableTheme: (themeId: string) => {
    unloadTheme(themeId);
    return ipcRenderer.sendSync("SNAIL_DISABLE_THEME", themeId);
  },
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

// ---------- Load enabled plugins & themes on DOM ready ----------
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const plugins = getPluginList();
    console.log(`[snail] Found ${plugins.length} plugins.`);
    for (const plugin of plugins) {
      console.log(`[snail] Plugin: ${plugin.id}, Enabled: ${plugin.enabled}`);
    }

    await (contextBridge ? Promise.resolve() : Promise.resolve());
    for (const plugin of plugins) {
      if (plugin.enabled) {
        const success = await loadPlugin(plugin);
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
      console.log(`[snail] Theme: ${theme.id}, Enabled: ${theme.enabled}`);
    }

    for (const theme of themes) {
      if (theme.enabled) {
        const success = loadTheme(theme);
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
