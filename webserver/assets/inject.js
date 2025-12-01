const fs = require("fs");
const path = require("path");
const os = require("os");
const { app } = require("electron");

const homeDir = os.homedir();
const pluginThingyPath = path.join(homeDir, ".snail", "internal", "main.js");

function loadMainJS() {
  if (fs.existsSync(pluginThingyPath)) {
    try {
      require(pluginThingyPath);
    } catch (e) {
      console.error("[snail] :c we got an error loading main.js", e);
    }
  } else {
    console.log(
      "[snail] no ~/.config/snail/internal/main.js found... what the hell did you do?",
    );
  }
}

// Ensure the app is ready before requiring the file
app.on("ready", () => {
  loadMainJS();
});
