var A=require("electron"),O={},V={},H={id:"",instance:null},U={},B=(k)=>{if(!H.id){console.error("[snail] registerPlugin called outside of a loading context.");return}let q=k;q.id=H.id,H.instance=q,console.log(`[snail] Plugin ${H.id} registered successfully.`);let z=U[H.id];if(z)z(!0),delete U[H.id]},W=(k,q)=>{let z=document.createElement("style");z.setAttribute("data-snail",q),z.textContent=k,document.head.appendChild(z)},E=(k,q)=>{let z=new Blob([k],{type:"text/javascript"}),D=URL.createObjectURL(z),J=document.createElement("script");J.type="module",J.src=D,J.setAttribute("data-snail",q);let K=`script-${q}-${crypto.randomUUID()}`;return J.id=K,(document.head||document.documentElement).appendChild(J),J.addEventListener("load",()=>{try{URL.revokeObjectURL(D)}catch{}}),K},G=(k,q)=>{return`
    (function() {
      const Snail = window.Snail;
      const pluginId = '${k}';

      try {
        ${q}
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
  `},X=()=>A.ipcRenderer.sendSync("SNAIL_GET_PLUGIN_LIST"),M=(k)=>A.ipcRenderer.sendSync("SNAIL_GET_PLUGIN_FILE",k),Y=async(k)=>{let q=M(k);if(!q)return console.warn(`[snail] Plugin file not found for ${k}`),!1;if(q.css)W(q.css,`plugin-${k}-style`);if(q.code){H={id:k,instance:null};let z=G(k,q.code),D=E(z,`plugin-${k}`),J=new Promise((N)=>{U[k]=N}),K=new Promise((N,$)=>setTimeout(()=>$(Error(`Timeout: registerPlugin not called for ${k}`)),1000)),Q=!1;try{await Promise.race([J,K]),Q=!!H.instance}catch(N){console.warn(`[snail] Plugin ${k} failed to load within time/error:`,N),Q=!1}if(Q)return V[k]=!0,O[k]={scriptId:D,instance:H.instance},console.log(`[snail] Plugin ${k} successfully initialized.`),!0;else return console.error(`[snail] Plugin ${k} failed to register.`),document.getElementById(D)?.remove(),document.querySelector(`style[data-snail="plugin-${k}-style"]`)?.remove(),!1}return!1},x=(k)=>{return!!V[k]},F=(k)=>{let q=O[k]?.instance;if(q&&typeof q.stop==="function")try{q.stop(),console.log(`[snail] Plugin ${k} stop() invoked during unload.`)}catch(z){console.error(`[snail] Error stopping ${k} during unload:`,z)}delete O[k],delete V[k],document.querySelectorAll(`script[data-snail="plugin-${k}"]`).forEach((z)=>z.remove()),document.querySelectorAll(`style[data-snail="plugin-${k}-style"]`).forEach((z)=>z.remove()),console.log(`[snail] Plugin ${k} fully unloaded.`)},Z=()=>A.ipcRenderer.sendSync("SNAIL_GET_THEME_LIST"),w=(k)=>A.ipcRenderer.sendSync("SNAIL_GET_THEME_FILE",k),_=(k)=>{let q=w(k);if(!q||!q.css)return console.warn(`[snail] Theme file not found or no CSS for ${k}`),!1;return W(q.css,`plugin-${k}-style`),!0},y=(k)=>{document.querySelectorAll(`style[data-snail="plugin-${k}-style"]`).forEach((q)=>q.remove()),console.log(`[snail] Theme ${k} unloaded.`)},C=(k)=>{let q=A.ipcRenderer.sendSync("SNAIL_ENABLE_THEME",k);if(q)_(k);return q},j=(k)=>{return y(k),A.ipcRenderer.sendSync("SNAIL_DISABLE_THEME",k)},b=async(k)=>{if(A.ipcRenderer.sendSync("SNAIL_ENABLE_PLUGIN",k))return await Y(k);return!1},v=(k)=>{return F(k),A.ipcRenderer.sendSync("SNAIL_DISABLE_PLUGIN",k)},L={registerPlugin:B,getPluginList:X,getThemeList:Z,enableTheme:C,disableTheme:j,enablePlugin:b,disablePlugin:v};A.contextBridge.exposeInMainWorld("Snail",{...L,isPluginRunning:x,pluginInstances:O});window.addEventListener("DOMContentLoaded",async()=>{try{let k=X();console.log(`[snail] Found ${k.length} plugins.`);for(let z of k)if(z.enabled){let D=await Y(z.id);console.log(D?`[snail] Loaded plugin: ${z.id}`:`[snail] Failed to load plugin: ${z.id}`)}let q=Z();console.log(`[snail] Found ${q.length} themes.`);for(let z of q)if(z.enabled){let D=_(z.id);console.log(D?`[snail] Loaded theme: ${z.id}`:`[snail] Failed to load theme: ${z.id}`)}}catch(k){console.error("[snail] error during DOMContentLoaded plugin load",k)}});
