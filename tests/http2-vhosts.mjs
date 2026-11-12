import assert from "node:assert/strict";
import http2 from "node:http2";

// Exercise cross-origin streams on one verified TLS connection, not fresh requests.
// node tests/http2-vhosts.mjs [port] [IPv4|IPv6]
const port = Number(process.argv[2] ?? 443);
const family = Number(process.argv[3] ?? 4);
const hosts = ["batty.roybot.se", "belmondo.roybot.se"];

for (const sni of hosts) {
  const client = http2.connect(`https://${sni}:${port}`, { family });
  try {
    for (const [authority, path, status, marker] of [
      ["batty.roybot.se", "/", 200, "<title>Batty</title>"],
      [
        "belmondo.roybot.se",
        "/",
        200,
        "<title>BELMONDO — Anti-gravity racing</title>",
      ],
      ["belmondo.roybot.se", "/.env", 403],
      ["belmondo.roybot.se", "/api/bootstrap", 404],
      ["antigrav.roybot.se", "/", 410],
      ["batty.roybot.se", "/", 200, "<title>Batty</title>"],
    ]) {
      await new Promise((resolve, reject) => {
        const request = client.request({
          ":authority": authority,
          ":path": path,
        });
        const chunks = [];
        request.on("error", reject);
        request.on("response", (headers) => {
          try {
            assert.equal(
              headers[":status"],
              status,
              `${sni} → ${authority}${path}`,
            );
            assert.equal(headers.location, undefined);
          } catch (error) {
            reject(error);
          }
        });
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => {
          try {
            assert.equal(client.socket.alpnProtocol, "h2");
            if (marker)
              assert.ok(Buffer.concat(chunks).toString().includes(marker));
            console.log(
              `${family} ${sni}:${client.socket.localPort} → ${authority}${path}: ${status}`,
            );
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        request.end();
      });
    }
  } finally {
    client.destroy();
  }
}
