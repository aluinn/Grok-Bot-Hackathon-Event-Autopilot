// A tiny web server for the dashboard. It only READS files and shows them. It never sends anything anywhere.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4010;
const SHARED_DIR = path.join(__dirname, "..", "..", "shared"); // event.json + promo.json
const OUTPUT_DIR = path.join(__dirname, "..", "output");        // promo images
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };

// Send one file to the browser (only if it lives inside the allowed folder)
function sendFile(res, folder, name) {
  const file = path.join(folder, name);
  if (!file.startsWith(folder) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);

  if (url === "/api/images") {
    // List the PNG files in the output folder
    const files = fs.existsSync(OUTPUT_DIR) ? fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".png")) : [];
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(files));
  }
  if (url.startsWith("/shared/")) return sendFile(res, SHARED_DIR, url.slice("/shared/".length));
  if (url.startsWith("/output/")) return sendFile(res, OUTPUT_DIR, url.slice("/output/".length));
  sendFile(res, __dirname, url === "/" ? "index.html" : url.slice(1));
}).listen(PORT, () => console.log(`Dashboard running: open http://localhost:${PORT}`));
