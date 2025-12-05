var z=require("electron"),E={},N=(k,q)=>{let v=document.createElement("style");v.setAttribute("data-snail",q),v.textContent=k,document.head.appendChild(v)},W=(k,q)=>{let v=new Blob([k],{type:"text/javascript"}),A=URL.createObjectURL(v),D=document.createElement("script");D.type="module",D.src=A,D.setAttribute("data-snail",q);let K=`script-${q}-${crypto.randomUUID()}`;return D.id=K,(document.head||document.documentElement).appendChild(D),D.addEventListener("load",()=>{try{URL.revokeObjectURL(A)}catch{}}),K},X=(k,q)=>`
(function() {
  const Snail = window.Snail;
  const PLUGIN_ID = '${k}';

  try {
    console.log('[snail][plugin:' + PLUGIN_ID + '] executing plugin code');

    if (!window.SnailPlugins) window.SnailPlugins = {};

    ${q}

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
`;function O(k){let q=E[k];if(!q)return;q.running=!0,Q(`
  const event = new CustomEvent("snail:startPlugin", {
    detail: { id: "${k}" },
  });
  window.dispatchEvent(event);
  `),console.log(`[snail] Plugin started: ${k}`)}function Y(k){let q=E[k];if(!q)return;q.running=!1,Q(`
  const event = new CustomEvent("snail:stopPlugin", {
    detail: { id: "${k}" },
  });
  window.dispatchEvent(event);
  `),console.log(`[snail] Plugin stopped: ${k}`)}var H=()=>z.ipcRenderer.sendSync("SNAIL_GET_PLUGIN_LIST"),Z=(k)=>z.ipcRenderer.sendSync("SNAIL_GET_PLUGIN_FILE",k);function Q(k){z.ipcRenderer.send("SNAIL_INJECT_JS",k)}var _=(k)=>{let q=Z(k);if(!q)return console.warn(`[snail] Plugin file not found for ${k}`),!1;if(q.css)N(q.css,`plugin-${k}-style`);if(q.code){let v=X(k,q.code),A=W(v,`plugin-${k}`);return E[k]={scriptID:A},!0}else return console.warn(`[snail] No code found in plugin file for ${k}`),!1},U=()=>z.ipcRenderer.sendSync("SNAIL_GET_THEME_LIST"),$=(k)=>z.ipcRenderer.sendSync("SNAIL_GET_THEME_FILE",k),V=(k)=>{console.log(`[snail] Theme ${k} loaded.`);let q=$(k);if(!q||!q.css)return console.warn(`[snail] Theme file not found or no CSS for ${k}`),!1;return N(q.css,`plugin-${k}-style`),!0},x=(k)=>{document.querySelectorAll(`style[data-snail="plugin-${k}-style"]`).forEach((q)=>q.remove()),console.log(`[snail] Theme ${k} unloaded.`)},B=(k)=>{let q=z.ipcRenderer.sendSync("SNAIL_ENABLE_THEME",k);return V(k),q},G=(k)=>{return x(k),z.ipcRenderer.sendSync("SNAIL_DISABLE_THEME",k)},M=(k)=>{if(z.ipcRenderer.sendSync("SNAIL_ENABLE_PLUGIN",k)){try{O(k)}catch(v){return console.error(`[snail][plugin:${k}] error during enable`,v),!1}return!0}return!1},w=(k)=>{try{Y(k)}catch(q){return console.error(`[snail][plugin:${k}] error during disable`,q),!1}return z.ipcRenderer.sendSync("SNAIL_DISABLE_PLUGIN",k)},F=(k)=>{if(console.log(`[snail] Registering plugin: ${k}`),E[k]={scriptID:E[k]?.scriptID||"",running:!1},console.log(`[snail] Plugin registered: ${k}`),H().find((q)=>q.id===k)?.enabled)O(k)},J={getPluginList:H,getThemeList:U,enableTheme:B,disableTheme:G,enablePlugin:M,disablePlugin:w,registerPlugin:F};z.contextBridge.exposeInMainWorld("Snail",{...J,plugins:E});window.addEventListener("DOMContentLoaded",async()=>{try{let k=H();console.log(`[snail] Found ${k.length} plugins.`);for(let v of k){let A=_(v.id);console.log(A?`[snail] Loaded plugin: ${v.id}`:`[snail] Failed to load plugin: ${v.id}`)}let q=U();console.log(`[snail] Found ${q.length} themes.`);for(let v of q)if(v.enabled){let A=V(v.id);console.log(A?`[snail] Loaded theme: ${v.id}`:`[snail] Failed to load theme: ${v.id}`)}}catch(k){console.error("[snail] error during DOMContentLoaded plugin load",k)}});
