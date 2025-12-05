var E=require("electron"),H={},Q=(k,q)=>{let v=document.createElement("style");v.setAttribute("data-snail",q),v.textContent=k,document.head.appendChild(v)},Y=(k,q)=>{let v=new Blob([k],{type:"text/javascript"}),z=URL.createObjectURL(v),A=document.createElement("script");A.type="module",A.src=z,A.setAttribute("data-snail",q);let O=`script-${q}-${crypto.randomUUID()}`;return A.id=O,(document.head||document.documentElement).appendChild(A),A.addEventListener("load",()=>{try{URL.revokeObjectURL(z)}catch{}}),O},Z=(k,q)=>`
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
`;function U(k){let q=H[k];if(!q)return;q.running=!0;let z=crypto.randomUUID().replace(/-/g,""),A=`
  const event${z} = new CustomEvent("snail:startPlugin", {
    detail: { id: "${k}" },
  });
  window.dispatchEvent(event${z});
  `;console.log(`[snail] Starting plugin: ${k} with code: ${A}`),V(A),console.log(`[snail] Plugin started: ${k}`)}function _(k){let q=H[k];if(!q)return;let z=crypto.randomUUID().replace(/-/g,"");q.running=!1;let A=`
  const event${z} = new CustomEvent("snail:stopPlugin", {
    detail: { id: "${k}" },
  });
  window.dispatchEvent(event${z});
  `;console.log(`[snail] Stopping plugin: ${k} with code: ${A}`),V(A),console.log(`[snail] Plugin stopped: ${k}`)}var K=()=>E.ipcRenderer.sendSync("SNAIL_GET_PLUGIN_LIST"),$=(k)=>E.ipcRenderer.sendSync("SNAIL_GET_PLUGIN_FILE",k);function V(k){E.ipcRenderer.send("SNAIL_INJECT_JS",k)}var x=(k)=>{let q=$(k);if(!q)return console.warn(`[snail] Plugin file not found for ${k}`),!1;if(q.css)Q(q.css,`plugin-${k}-style`);if(q.code){let v=Z(k,q.code),z=Y(v,`plugin-${k}`);return H[k]={scriptID:z},!0}else return console.warn(`[snail] No code found in plugin file for ${k}`),!1},W=()=>E.ipcRenderer.sendSync("SNAIL_GET_THEME_LIST"),B=(k)=>E.ipcRenderer.sendSync("SNAIL_GET_THEME_FILE",k),X=(k)=>{console.log(`[snail] Theme ${k} loaded.`);let q=B(k);if(!q||!q.css)return console.warn(`[snail] Theme file not found or no CSS for ${k}`),!1;return Q(q.css,`plugin-${k}-style`),!0},G=(k)=>{document.querySelectorAll(`style[data-snail="plugin-${k}-style"]`).forEach((q)=>q.remove()),console.log(`[snail] Theme ${k} unloaded.`)},M=(k)=>{let q=E.ipcRenderer.sendSync("SNAIL_ENABLE_THEME",k);return X(k),q},w=(k)=>{return G(k),E.ipcRenderer.sendSync("SNAIL_DISABLE_THEME",k)},F=(k)=>{if(E.ipcRenderer.sendSync("SNAIL_ENABLE_PLUGIN",k)){try{U(k)}catch(v){return console.error(`[snail][plugin:${k}] error during enable`,v),!1}return!0}return!1},J=(k)=>{try{_(k)}catch(q){return console.error(`[snail][plugin:${k}] error during disable`,q),!1}return E.ipcRenderer.sendSync("SNAIL_DISABLE_PLUGIN",k)},C=(k)=>{if(console.log(`[snail] Registering plugin: ${k}`),H[k]={scriptID:H[k]?.scriptID||"",running:!1},console.log(`[snail] Plugin registered: ${k}`),K().find((q)=>q.id===k)?.enabled)U(k)},y={getPluginList:K,getThemeList:W,enableTheme:M,disableTheme:w,enablePlugin:F,disablePlugin:J,registerPlugin:C};E.contextBridge.exposeInMainWorld("Snail",{...y,plugins:H});window.addEventListener("DOMContentLoaded",async()=>{try{let k=K();console.log(`[snail] Found ${k.length} plugins.`);for(let v of k){let z=x(v.id);console.log(z?`[snail] Loaded plugin: ${v.id}`:`[snail] Failed to load plugin: ${v.id}`)}let q=W();console.log(`[snail] Found ${q.length} themes.`);for(let v of q)if(v.enabled){let z=X(v.id);console.log(z?`[snail] Loaded theme: ${v.id}`:`[snail] Failed to load theme: ${v.id}`)}}catch(k){console.error("[snail] error during DOMContentLoaded plugin load",k)}});
