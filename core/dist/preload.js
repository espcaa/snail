var z=require("electron"),H={},J=(k,q)=>{let v=document.createElement("style");v.setAttribute("data-slackmod",q),v.textContent=k,document.head.appendChild(v)},W=(k,q)=>{let v=new Blob([k],{type:"text/javascript"}),E=URL.createObjectURL(v),A=document.createElement("script");return A.type="module",A.src=E,A.setAttribute("data-slackmod",q),A.id=`script-${q}-${crypto.randomUUID()}`,(document.head||document.documentElement).appendChild(A),A.addEventListener("load",()=>{try{URL.revokeObjectURL(E)}catch{}}),A.id},X=(k,q)=>{return`
/* Snail plugin wrapper for ${k} - auto-generated */
(function() {
  const log = (...args) => {
    try { console.log('[snail][plugin:${k}]', ...args); } catch {}
  };

  const snail = window.snail || window.Snail || null;
  if (!snail) {
    log('Warning: window.snail is not present. Plugin will still run but snail API calls will fail until available.');
  }

  try {
    ${q}
  } catch (err) {
    console.error('[snail][plugin:${k}] plugin execution error', err);
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
      window.__snailPlugins["${k}"] = pluginInstance;
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
`},K=()=>z.ipcRenderer.sendSync("SNAIL_GET_PLUGIN_LIST"),Y=(k)=>z.ipcRenderer.sendSync("SNAIL_GET_PLUGIN_FILE",k),N=async(k)=>{let q=Y(k.id);if(!q)return!1;if(q.css)J(q.css,`plugin-${k.id}-style`);if(q.code){let v=q.code;if(/\bexport\s+default\b/.test(q.code))v=`
        ${q.code}
      `;let E=X(k.id,v),A=W(E,`plugin-${k.id}`);await new Promise((V)=>setTimeout(V,50));let G=window.__snailPlugins?.[k.id]||null;if(G&&typeof G.start==="function")return H[k.id]={scriptId:A,instance:G},console.log(`[snail] Plugin ${k.id} started.`),!0;return H[k.id]={scriptId:A,instance:G||null},console.warn(`[snail] Plugin ${k.id} did not expose a start() method; check plugin.`),!!G}return!1},Q=()=>z.ipcRenderer.sendSync("SNAIL_GET_THEME_LIST"),Z=(k)=>z.ipcRenderer.sendSync("SNAIL_GET_THEME_FILE",k),U=(k)=>{let q=Z(k.id);if(!q||!q.css)return!1;return J(q.css,`plugin-${k.id}-style`),!0},_=(k)=>{document.querySelectorAll(`style[data-slackmod="plugin-${k}-style"]`).forEach((q)=>q.remove())},$=(k)=>{let q=H[k]?.instance;if(q&&typeof q.stop==="function")try{q.stop()}catch(v){console.error(`[snail] Error stopping ${k}:`,v)}delete window.__snailPlugins?.[k],delete H[k],document.querySelectorAll(`script[data-slackmod="plugin-${k}"]`).forEach((v)=>v.remove()),document.querySelectorAll(`style[data-slackmod="plugin-${k}-style"]`).forEach((v)=>v.remove())};z.contextBridge.exposeInMainWorld("snail",{getPluginList:K,getThemeList:Q,enableTheme:(k)=>{let q=z.ipcRenderer.sendSync("SNAIL_ENABLE_THEME",k);if(q)U({id:k,enabled:!0});return q},disableTheme:(k)=>{return _(k),z.ipcRenderer.sendSync("SNAIL_DISABLE_THEME",k)},enablePlugin:async(k)=>{let q=z.ipcRenderer.sendSync("SNAIL_ENABLE_PLUGIN",k);if(q)await N({id:k,enabled:!0});return q},disablePlugin:(k)=>{return $(k),z.ipcRenderer.sendSync("SNAIL_DISABLE_PLUGIN",k)}});window.addEventListener("DOMContentLoaded",async()=>{try{let k=K();console.log(`[snail] Found ${k.length} plugins.`);for(let v of k)console.log(`[snail] Plugin: ${v.id}, Enabled: ${v.enabled}`);await(z.contextBridge?Promise.resolve():Promise.resolve());for(let v of k)if(v.enabled){let E=await N(v);console.log(E?`[snail] Loaded plugin: ${v.id}`:`[snail] Failed to load plugin: ${v.id}`)}let q=Q();console.log(`[snail] Found ${q.length} themes.`);for(let v of q)console.log(`[snail] Theme: ${v.id}, Enabled: ${v.enabled}`);for(let v of q)if(v.enabled){let E=U(v);console.log(E?`[snail] Loaded theme: ${v.id}`:`[snail] Failed to load theme: ${v.id}`)}}catch(k){console.error("[snail] error during DOMContentLoaded plugin load",k)}});
