// A static file server for the repo root, so the phone flows need nothing
// running beforehand. Same files `npm start` serves, on a free port.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};

export const BLANK = "/__blank.html";

/**
 * @param {string} [root] the folder to serve: the repo, or a built copy of the
 *   site (flows/returning.mjs). `use(folder)` swaps it, as a deploy does.
 */
export async function serve(root = ROOT) {
  const server = createServer(async (req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (path.endsWith("/")) path += "index.html";
    // An empty page on the game's origin: somewhere to stand while a flow
    // writes localStorage, where the game is not running to save over it.
    if (path === BLANK)
      return void res
        .writeHead(200, { "content-type": TYPES[".html"] })
        .end('<!doctype html><link rel="icon" href="data:,">');
    try {
      const body = await readFile(join(root, path));
      res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    use: (folder) => void (root = folder),
    close: () => (server.close(), server.closeAllConnections()),
  };
}
