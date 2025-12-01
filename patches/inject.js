const fs = require("fs");
const path = require("path");
const os = require("os");

const homeDir = os.homedir();
const pluginThingyPath = path.join(homeDir, ".snail", "internal", "main.js");

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
