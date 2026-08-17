#!/usr/bin/env node
/* =========================================================
   Servidor de desarrollo
   ---------------------------------------------------------
     node servidor.mjs          → http://localhost:8777
     node servidor.mjs 3000     → otro puerto

   ¿Por qué no `python -m http.server`? Porque no entiende las
   peticiones por rango (Range). Cuando el navegador pide un
   trozo de vídeo, aquel devuelve el archivo entero con un 200
   donde debería ir un 206. Consecuencias:
     · no se puede arrastrar la barra del reproductor
     · el navegador a veces guarda respuestas a medias y luego
       da "formato no soportado" con archivos perfectamente sanos
   Este sí lo hace bien. Además nunca cachea el HTML/CSS/JS, así
   que al recargar siempre ves tu última versión.
   ========================================================= */

import { createServer } from "node:http";
import { stat, open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.argv[2]) || 8777;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

const esMedio = (ext) => /^\.(mp4|mov|webm|jpg|jpeg|png|webp|avif|woff2)$/.test(ext);

createServer(async (pet, res) => {
  try {
    let ruta = decodeURIComponent(new URL(pet.url, "http://x").pathname);
    if (ruta.endsWith("/")) ruta += "index.html";

    const destino = path.join(RAIZ, path.normalize(ruta));
    // Nadie sale de la carpeta del proyecto
    if (!destino.startsWith(RAIZ)) {
      res.writeHead(403).end("Prohibido");
      return;
    }

    const info = await stat(destino).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" })
         .end(`<h1>404</h1><p>No existe: ${ruta}</p>`);
      console.log(`404  ${ruta}`);
      return;
    }

    const ext = path.extname(destino).toLowerCase();
    const tipo = TIPOS[ext] || "application/octet-stream";

    const cabeceras = {
      "Content-Type": tipo,
      "Accept-Ranges": "bytes",
      // Los medios llevan ?v= en la URL, así que se pueden cachear a saco.
      // El HTML/CSS/JS nunca, para no volver a pelearnos con versiones viejas.
      "Cache-Control": esMedio(ext)
        ? "public, max-age=31536000, immutable"
        : "no-store, must-revalidate",
    };

    // ---- Petición por rango (lo que usa el <video>) ----
    const rango = pet.headers.range;
    if (rango && esMedio(ext)) {
      const m = /bytes=(\d*)-(\d*)/.exec(rango);
      if (m) {
        let inicio = m[1] ? parseInt(m[1], 10) : 0;
        let fin = m[2] ? parseInt(m[2], 10) : info.size - 1;

        if (isNaN(inicio) || isNaN(fin) || inicio > fin || fin >= info.size) {
          res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
          return;
        }

        res.writeHead(206, {
          ...cabeceras,
          "Content-Range": `bytes ${inicio}-${fin}/${info.size}`,
          "Content-Length": fin - inicio + 1,
        });
        if (pet.method === "HEAD") return res.end();
        createReadStream(destino, { start: inicio, end: fin }).pipe(res);
        return;
      }
    }

    // ---- Respuesta completa ----
    res.writeHead(200, { ...cabeceras, "Content-Length": info.size });
    if (pet.method === "HEAD") return res.end();
    createReadStream(destino).pipe(res);
  } catch (e) {
    res.writeHead(500).end("Error: " + e.message);
    console.error(e);
  }
}).listen(PUERTO, () => {
  console.log(`\n  Portfolio de Isidro González`);
  console.log(`  → http://localhost:${PUERTO}\n`);
  console.log(`  Con soporte de rangos (206), así el reproductor puede`);
  console.log(`  adelantar y atrasar. Ctrl+C para parar.\n`);
});
