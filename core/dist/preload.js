var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// src/preload.ts
var import_electron = require("electron");

// src/utils/webpack.tsx
function setupWebpackHelpers() {
  const global = globalThis;
  const webpackChunkwebapp = global.webpackChunkwebapp;
  let __webpack_require__;
  webpackChunkwebapp.push([
    [Symbol()],
    {},
    (r) => {
      __webpack_require__ = r;
    }
  ]);
  function allExports() {
    return webpackChunkwebapp.flatMap((chunk) => Object.keys(chunk[1])).map((id) => {
      try {
        return __webpack_require__(id);
      } catch {
        return;
      }
    }).filter((value) => Boolean(value));
  }
  function wrapFilter(filter) {
    return (mod) => {
      try {
        return filter(mod);
      } catch {
        return false;
      }
    };
  }
  function find(_filter, tryDefault = true) {
    const filter = wrapFilter(_filter);
    for (const m of allExports()) {
      if (tryDefault && m.default && filter(m.default))
        return m.default;
      if (filter(m))
        return m;
    }
  }
  function findByProps(...props) {
    return find((m) => props.every((x) => m[x] !== undefined));
  }
  function findExport(filter, all = false) {
    const exports2 = allExports();
    const results = new Set;
    for (const exp of exports2) {
      try {
        if (filter(exp)) {
          if (!all)
            return exp;
          results.add(exp);
        }
      } catch {}
      for (const key in exp) {
        if (!Object.prototype.hasOwnProperty.call(exp, key))
          continue;
        try {
          const candidate = exp[key];
          if (filter(candidate)) {
            if (!all)
              return candidate;
            results.add(candidate);
          }
        } catch {}
      }
    }
    return all ? [...results] : null;
  }
  function findComponent(name, all = false, filter) {
    const found = findExport((exp) => typeof exp === "function" && exp.displayName === name && (!filter || filter(exp)), all);
    if (!found) {
      return () => /* @__PURE__ */ React.createElement("div", {
        style: { color: "red", fontWeight: "bold" }
      }, "⚠️ Missing component: ", name);
    }
    return found;
  }
  global.webpackHelpers = {
    allExports,
    wrapFilter,
    find,
    findByProps,
    findComponent
  };
}

// src/utils/react.ts
function setupReactPatch() {
  const { findByProps } = window.webpackHelpers;
  const ReactDOMClient = findByProps("createRoot", "hydrateRoot");
  const React2 = findByProps("useState", "useEffect", "createElement");
  if (!React2 || !React2.createElement) {
    console.warn("[ReactPatch] React not found, patch aborted.");
    return;
  }
  window.React = React2;
  if (!React2 || !React2.createElement) {
    console.warn("[ReactPatch] React not found, patch aborted.");
    return;
  }
  function getElementName(type) {
    if (typeof type === "string")
      return type;
    if (type.displayName)
      return type.displayName;
    if (type.name)
      return type.name;
    return "Unknown";
  }
  function getFiberRoot() {
    const container = document.querySelector(".p-client_container");
    if (!container)
      return null;
    const rootKey = Object.keys(container).find((k) => k.startsWith("__reactContainer$"));
    if (!rootKey)
      return null;
    return container[rootKey];
  }
  const tempRoot = ReactDOMClient.createRoot(document.createElement("div"));
  tempRoot.unmount();
  const ReactDOMRoot = tempRoot.constructor;
  function getRoot() {
    const fiberRoot = getFiberRoot();
    if (!fiberRoot) {
      console.warn("[ReactPatch] Could not find React fiber root.");
      return null;
    }
    return new ReactDOMRoot(fiberRoot);
  }
  function dirtyMemoizationCache() {
    const fiberRoot = getFiberRoot();
    if (!fiberRoot) {
      console.warn("[ReactPatch] Could not find fiber root, cannot dirty cache.");
      return;
    }
    const poison = (node) => {
      if (!node)
        return;
      if (node.memoizedProps && typeof node.memoizedProps === "object") {
        node.memoizedProps = { ...node.memoizedProps, _poison: 1 };
      }
      poison(node.child);
      poison(node.sibling);
    };
    poison(fiberRoot);
  }
  const elementReplacements = new Map;
  React2.createElement = new Proxy(React2.createElement, {
    apply(target, thisArg, [type, props, ...children]) {
      const replacement = elementReplacements.get(type);
      const __original = props && props["__original"];
      if (__original)
        delete props["__original"];
      if (replacement && !__original) {
        console.log(`[ReactPatch] React. createElement: Replacing element ${getElementName(type)} with ${getElementName(replacement)}`);
        return Reflect.apply(target, thisArg, [
          replacement,
          props,
          ...children
        ]);
      }
      return Reflect.apply(target, thisArg, [type, props, ...children]);
    }
  });
  function patchComponent(original, replacement) {
    if (typeof replacement === "function") {
      if (!replacement.displayName) {
        replacement.displayName = `Patched(${getElementName(original)})`;
      }
    }
    if (replacement === null || replacement === undefined) {
      elementReplacements.delete(original);
      console.log(`[ReactPatch] patchComponent: Unpatched component ${getElementName(original)}`, elementReplacements);
    } else {
      elementReplacements.set(original, replacement);
      console.log(`[ReactPatch] patchComponent: Patched component ${getElementName(original)} with ${getElementName(replacement)}`, elementReplacements);
    }
    dirtyMemoizationCache();
  }
  const reactPatchAPI = {
    replaceComponent: patchComponent,
    removeReplacement: (originalType) => {
      elementReplacements.delete(originalType);
      dirtyMemoizationCache();
    },
    clearReplacements: () => {
      elementReplacements.clear();
      dirtyMemoizationCache();
    },
    getReplacements: () => new Map(elementReplacements),
    patchComponent,
    getRoot
  };
  window.reactPatchAPI = reactPatchAPI;
}

// src/preload.ts
var plugins = {};
var injectCSS = (code, id) => {
  const style = document.createElement("style");
  style.setAttribute("data-snail", id);
  style.textContent = code;
  document.head.appendChild(style);
};
var wrapPluginCode = (pluginId, code) => `
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
function startPlugin(pluginId) {
  const plugin = plugins[pluginId];
  if (!plugin)
    return;
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
function stopPlugin(pluginId) {
  const plugin = plugins[pluginId];
  if (!plugin)
    return;
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
var getPluginList = () => import_electron.ipcRenderer.sendSync("SNAIL_GET_PLUGIN_LIST");
var getPluginFile = (pluginId) => import_electron.ipcRenderer.sendSync("SNAIL_GET_PLUGIN_FILE", pluginId);
function injectJS(code) {
  import_electron.ipcRenderer.send("SNAIL_INJECT_JS", code);
}
var loadPlugin = (pluginId) => {
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
    injectJS(wrapped);
    return true;
  } else {
    console.warn(`[snail] No code found in plugin file for ${pluginId}`);
    return false;
  }
};
var getThemeList = () => import_electron.ipcRenderer.sendSync("SNAIL_GET_THEME_LIST");
var getThemeFile = (themeId) => import_electron.ipcRenderer.sendSync("SNAIL_GET_THEME_FILE", themeId);
var loadTheme = (themeId) => {
  console.log(`[snail] Theme ${themeId} loaded.`);
  const file = getThemeFile(themeId);
  if (!file || !file.css) {
    console.warn(`[snail] Theme file not found or no CSS for ${themeId}`);
    return false;
  }
  injectCSS(file.css, `plugin-${themeId}-style`);
  return true;
};
var unloadTheme = (themeId) => {
  document.querySelectorAll(`style[data-snail="plugin-${themeId}-style"]`).forEach((el) => el.remove());
  console.log(`[snail] Theme ${themeId} unloaded.`);
};
var enableTheme = (themeId) => {
  const success = import_electron.ipcRenderer.sendSync("SNAIL_ENABLE_THEME", themeId);
  loadTheme(themeId);
  return success;
};
var disableTheme = (themeId) => {
  unloadTheme(themeId);
  return import_electron.ipcRenderer.sendSync("SNAIL_DISABLE_THEME", themeId);
};
var enablePlugin = (pluginId) => {
  const success = import_electron.ipcRenderer.sendSync("SNAIL_ENABLE_PLUGIN", pluginId);
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
var disablePlugin = (pluginId) => {
  try {
    stopPlugin(pluginId);
  } catch (e) {
    console.error(`[snail][plugin:${pluginId}] error during disable`, e);
    return false;
  }
  return import_electron.ipcRenderer.sendSync("SNAIL_DISABLE_PLUGIN", pluginId);
};
var registerPlugin = (pluginId) => {
  console.log(`[snail] Registering plugin: ${pluginId}`);
  plugins[pluginId] = {
    scriptID: plugins[pluginId]?.scriptID || "",
    running: false
  };
  console.log(`[snail] Plugin registered: ${pluginId}`);
  if (getPluginList().find((p) => p.id === pluginId)?.enabled) {
    startPlugin(pluginId);
  }
};
var SnailGlobal = {
  getPluginList,
  getThemeList,
  enableTheme,
  disableTheme,
  enablePlugin,
  disablePlugin,
  registerPlugin
};
import_electron.contextBridge.exposeInMainWorld("Snail", {
  ...SnailGlobal,
  plugins
});
window.addEventListener("DOMContentLoaded", async () => {
  try {
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
    const plugins2 = getPluginList();
    console.log(`[snail] Found ${plugins2.length} plugins.`);
    for (const plugin of plugins2) {
      let res = loadPlugin(plugin.id);
      console.log(res ? `[snail] Loaded plugin: ${plugin.id}` : `[snail] Failed to load plugin: ${plugin.id}`);
    }
    const themes = getThemeList();
    console.log(`[snail] Found ${themes.length} themes.`);
    for (const theme of themes) {
      if (theme.enabled) {
        const success = loadTheme(theme.id);
        console.log(success ? `[snail] Loaded theme: ${theme.id}` : `[snail] Failed to load theme: ${theme.id}`);
      }
    }
  } catch (e) {
    console.error("[snail] error during DOMContentLoaded plugin load", e);
  }
});
