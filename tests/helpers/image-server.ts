import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";

const PNG = readFileSync(
  join(import.meta.dirname, "../fixtures/vault/attachments/remote-source.png")
);

/** Serves /remote.png as a PNG and every other path as 404, standing in for a remote host. */
export async function startImageServer(): Promise<{ base: string; server: Server }> {
  const server = createServer((req, res) => {
    if (req.url === "/remote.png") {
      res.writeHead(200, { "content-type": "image/png" }).end(PNG);
    } else {
      res.writeHead(404, { "content-type": "text/html" }).end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server has no port");
  return { base: `http://127.0.0.1:${address.port}`, server };
}
