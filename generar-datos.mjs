#!/usr/bin/env node
/* =========================================================
   Genera js/datos.js a partir de la carpeta /videos
   ---------------------------------------------------------
   Uso:
     node generar-datos.mjs              → lee vídeos, crea posters y datos.js
     node generar-datos.mjs --optimizar  → además crea versiones web ligeras

   Organiza tus vídeos por carpetas; cada carpeta es una categoría:
     videos/Bodas/rocio-y-luis.mp4
     videos/Publicidad/campana-verano.mp4
   Los vídeos sueltos en /videos van a la categoría "Otros".
   ========================================================= */

import { readdir, stat, mkdir, writeFile, readFile, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ejecutar = promisify(execFile);
const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const DIR_VIDEOS = path.join(RAIZ, "videos");
const DIR_POSTERS = path.join(RAIZ, "posters");
const DIR_WEB = path.join(RAIZ, "videos-web");
const DIR_FOTOS = path.join(RAIZ, "fotos");
const DIR_FOTOS_WEB = path.join(RAIZ, "fotos-web");
const DIR_PREVIEWS = path.join(RAIZ, "previews");
const EXT = new Set([".mp4", ".mov", ".webm", ".m4v", ".mkv", ".avi"]);
const EXT_FOTO = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic"]);
const OPTIMIZAR = process.argv.includes("--optimizar");

const existe = (p) => access(p).then(() => true).catch(() => false);

async function hayFfmpeg() {
  try { await ejecutar("ffmpeg", ["-version"]); return true; } catch { return false; }
}

async function listar(dir, base = "", exts = EXT) {
  const salida = [];
  let entradas = [];
  try { entradas = await readdir(dir, { withFileTypes: true }); } catch { return salida; }

  for (const e of entradas) {
    if (e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      salida.push(...await listar(abs, base ? `${base}/${e.name}` : e.name, exts));
    } else if (exts.has(path.extname(e.name).toLowerCase())) {
      const rel = base ? `${base}/${e.name}` : e.name;
      salida.push({ abs, categoria: base || "Otros", archivo: e.name, rel });
    }
  }
  return salida;
}

async function dimensiones(abs) {
  try {
    const { stdout } = await ejecutar("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0:s=x",
      abs,
    ]);
    const [w, h] = stdout.trim().split("x").map(Number);
    if (w && h) return { w, h };
  } catch {}
  return { w: 4, h: 5 };
}

function proporcion(w, h) {
  const div = (a, b) => (b ? div(b, a % b) : a);
  const g = div(w, h) || 1;
  return `${w / g} / ${h / g}`;
}

function titular(archivo) {
  return path.basename(archivo, path.extname(archivo))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

const seguro = (s) => s.replace(/[^\w.\-]+/g, "_");

const RUTA_ORDEN = path.join(RAIZ, "orden.txt");

/* orden.txt: una ruta relativa dentro de /videos por línea, en el orden en
   que se quiere que aparezcan los vídeos por la web. Las líneas vacías o
   que empiezan por # se ignoran. Lo que no aparezca en la lista se coloca
   al final, con el barajado automático de siempre. */
async function leerOrdenManual() {
  if (!(await existe(RUTA_ORDEN))) return null;
  const texto = await readFile(RUTA_ORDEN, "utf8");
  const lineas = texto
    .split("\n")
    .map((l) => l.split("#")[0].trim())
    .filter(Boolean)
    .map((l) => l.replace(/\\/g, "/").toLowerCase());
  return lineas.length ? lineas : null;
}

/* Si no existe orden.txt, se crea uno con el orden actual (el que sale del
   barajado automático) como plantilla ya lista para editar: basta con
   mover líneas de sitio y volver a lanzar el generador. */
async function escribirPlantillaOrden(proyectosOrdenados, items) {
  const rutaPorTituloCat = new Map(
    items.map((it) => [rotular(it.categoria) + "|" + titular(it.archivo), it.rel])
  );
  const lineas = proyectosOrdenados
    .map((p) => rutaPorTituloCat.get(p.categoria + "|" + p.titulo))
    .filter(Boolean);

  const contenido =
    `# Orden manual de los vídeos en la web.\n` +
    `#\n` +
    `# Una ruta por línea (dentro de /videos), de arriba abajo tal como\n` +
    `# quieres que aparezcan. Para reordenar, mueve las líneas de sitio y\n` +
    `# vuelve a ejecutar:  node generar-datos.mjs\n` +
    `#\n` +
    `# Los vídeos que no aparezcan aquí (por ejemplo, si añades uno nuevo)\n` +
    `# se colocan al final automáticamente.\n` +
    `#\n` +
    `# Esta plantilla se generó sola con el orden que había ahora mismo.\n` +
    `# Bórrala si prefieres volver al barajado automático.\n\n` +
    lineas.join("\n") + "\n";

  await writeFile(RUTA_ORDEN, contenido, "utf8");
  console.log(`✓ orden.txt creado con el orden actual — muévelo a mano cuando quieras`);
}

// "DEPORTES" → "Deportes" (queda mucho mejor en la tipografía grande).
// Si escribes la carpeta con mayúsculas y minúsculas, se respeta tal cual.
function rotular(carpeta) {
  const c = carpeta.split("/")[0];
  return c === c.toUpperCase()
    ? c.charAt(0) + c.slice(1).toLowerCase()
    : c;
}

async function poster(item, ffmpeg) {
  const nombre = seguro(item.rel.replace(/\.[^.]+$/, "").replace(/\//g, "__")) + ".jpg";
  const destino = path.join(DIR_POSTERS, nombre);
  if (!ffmpeg) return "";
  if (await existe(destino)) return "posters/" + encodeURIComponent(nombre);
  try {
    await ejecutar("ffmpeg", [
      "-y", "-nostdin", "-loglevel", "error",
      "-ss", "1",
      "-i", item.abs,
      "-frames:v", "1",
      "-vf", "scale=800:-2",
      "-q:v", "6",
      destino,
    ]);
    return "posters/" + encodeURIComponent(nombre);
  } catch {
    return "";
  }
}

async function optimizar(item, ffmpeg) {
  const rel = item.rel.replace(/\.[^.]+$/, "") + ".mp4";
  const destino = path.join(DIR_WEB, rel);
  const url = "videos-web/" + rel.split("/").map(encodeURIComponent).join("/");
  // Si la copia ligera ya existe, se usa aunque no pases --optimizar
  if (await existe(destino)) return url;
  if (!OPTIMIZAR || !ffmpeg) return null;
  await mkdir(path.dirname(destino), { recursive: true });
  process.stdout.write(`   comprimiendo ${item.archivo}… `);
  try {
    await ejecutar("ffmpeg", [
      "-y", "-loglevel", "error",
      "-nostdin",
      "-hwaccel", "videotoolbox",
      "-i", item.abs,
      // Con audio: en la rejilla van en silencio (atributo muted del <video>),
      // pero al abrir el reproductor tiene que sonar.
      "-c:a", "aac", "-b:a", "128k",
      // el lado largo se limita a 1280 px, sea vertical u horizontal
      "-vf", "scale='if(gt(a,1),min(1280,iw),-2)':'if(gt(a,1),-2,min(1280,ih))'",
      "-c:v", "libx264", "-profile:v", "high", "-crf", "27",
      "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",               // empieza a verse antes
      destino,
    ], { maxBuffer: 1024 * 1024 * 32 });
    const { size } = await stat(destino);
    console.log(`${(size / 1048576).toFixed(1)} MB`);
    return url;
  } catch (err) {
    console.log("error");
    return null;
  }
}

async function optimizarFoto(item, ffmpeg) {
  const rel = item.rel.replace(/\.[^.]+$/, "") + ".jpg";
  const destino = path.join(DIR_FOTOS_WEB, rel);
  const url = "fotos-web/" + rel.split("/").map(encodeURIComponent).join("/");
  if (await existe(destino)) return url;
  if (!OPTIMIZAR || !ffmpeg) return null;
  await mkdir(path.dirname(destino), { recursive: true });
  try {
    await ejecutar("ffmpeg", [
      "-y", "-nostdin", "-loglevel", "error",
      "-i", item.abs,
      // lado largo a 1800 px, suficiente para pantallas grandes
      "-vf", "scale='if(gt(a,1),min(1800,iw),-2)':'if(gt(a,1),-2,min(1800,ih))'",
      "-q:v", "4",
      destino,
    ], { maxBuffer: 1024 * 1024 * 32 });
    return url;
  } catch {
    return null;
  }
}

/* Previsualización para la rejilla: 6 segundos, sin audio, ~800 KB.
   Va a la MISMA resolución que el vídeo bueno (720x1280 en vertical) porque
   en una pantalla Retina la rejilla ya pide ~730 px reales por columna: con
   menos se ve pastoso.
   Es LO QUE HACE QUE LA WEB VAYA FINA: el navegador puede decodificar ocho de
   estas a la vez sin despeinarse, mientras que con los archivos completos se
   atraganta y deja vídeos congelados en el póster. El vídeo bueno se carga
   sólo al abrir el reproductor. */
async function previa(item, ffmpeg, fuenteWeb) {
  const nombre = item.rel.replace(/\.[^.]+$/, "").replace(/\//g, "_") + ".mp4";
  const destino = path.join(DIR_PREVIEWS, nombre);
  const url = "previews/" + encodeURIComponent(nombre);
  if (await existe(destino)) return url;
  if (!ffmpeg) return null;

  await mkdir(DIR_PREVIEWS, { recursive: true });
  const origen = fuenteWeb ? path.join(RAIZ, decodeURIComponent(fuenteWeb)) : item.abs;

  // Arrancamos al 15% del clip: el primer segundo suele ser el menos vistoso.
  let inicio = 0;
  try {
    const { stdout } = await ejecutar("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", origen,
    ]);
    const d = parseFloat(stdout);
    if (d) inicio = Math.max(0, Math.min(d * 0.15, d - 7));
  } catch {}

  process.stdout.write(`   previa de ${item.archivo}… `);
  try {
    await ejecutar("ffmpeg", [
      "-nostdin", "-y", "-loglevel", "error",
      "-ss", inicio.toFixed(2),
      "-i", origen,
      "-t", "6",
      "-an",
      "-vf", "scale='if(gt(a,1),min(1280,iw),-2)':'if(gt(a,1),-2,min(1280,ih))',fps=24",
      "-c:v", "libx264", "-profile:v", "high", "-crf", "26",
      "-preset", "slow", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      destino,
    ], { maxBuffer: 1024 * 1024 * 32 });
    const { size } = await stat(destino);
    console.log(`${Math.round(size / 1024)} KB`);
    return url;
  } catch {
    console.log("error");
    return null;
  }
}

// ---------------------------------------------------------
const ffmpeg = await hayFfmpeg();
if (!ffmpeg) {
  console.log("⚠  No se ha encontrado ffmpeg: no se generarán posters.");
  console.log("   Instálalo con:  brew install ffmpeg\n");
}

await mkdir(DIR_POSTERS, { recursive: true });
const items = await listar(DIR_VIDEOS);

if (!items.length) {
  console.log("No hay vídeos en /videos todavía.");
  console.log("Mete tus archivos en carpetas por categoría, p. ej. videos/Bodas/…\n");
}

const proyectos = [];
for (const item of items) {
  const { w, h } = await dimensiones(item.abs);
  const ligero = await optimizar(item, ffmpeg);
  const { size } = await stat(item.abs);

  const completo = ligero || "videos/" + item.rel.split("/").map(encodeURIComponent).join("/");

  proyectos.push({
    titulo: titular(item.archivo),
    categoria: rotular(item.categoria),
    video: completo,                            // el bueno, con sonido, para el reproductor
    preview: await previa(item, ffmpeg, ligero), // el ligero, mudo, para la rejilla
    poster: await poster(item, ffmpeg),
    ar: proporcion(w, h),
    _rel: item.rel.toLowerCase(),                // sólo para el orden manual, se borra al final
  });

  if (!ligero && size > 12 * 1048576) {
    console.log(`⚠  ${item.archivo} pesa ${(size / 1048576).toFixed(0)} MB — usa --optimizar`);
  }
}

// =========================================================
// Orden: manual (orden.txt) si existe, si no un barajado estable
// que reparte las categorías por la rejilla.
// =========================================================
const barajaEstable = (a, b) =>
  (a.titulo.length % 7) - (b.titulo.length % 7) || a.titulo.localeCompare(b.titulo);

const orden = await leerOrdenManual();
let proyectosOrdenados;
if (orden) {
  const pos = new Map(orden.map((r, i) => [r, i]));
  const listados = proyectos.filter((p) => pos.has(p._rel));
  const resto = proyectos.filter((p) => !pos.has(p._rel));
  listados.sort((a, b) => pos.get(a._rel) - pos.get(b._rel));
  resto.sort(barajaEstable);
  proyectosOrdenados = [...listados, ...resto];
  console.log(`✓ orden.txt: ${listados.length} vídeos colocados a mano, ${resto.length} al final por defecto`);
} else {
  proyectosOrdenados = [...proyectos].sort(barajaEstable);
}
proyectosOrdenados.forEach((p) => delete p._rel);

// Si no existe orden.txt, se crea uno con el orden actual como plantilla:
// así siempre hay un archivo listo para reordenar a mano moviendo líneas.
if (!orden && proyectosOrdenados.length) {
  await escribirPlantillaOrden(proyectosOrdenados, items);
}

// =========================================================
// Fotos: misma lógica, carpeta /fotos
// =========================================================
const fotos = [];
const imagenes = await listar(DIR_FOTOS, "", EXT_FOTO);

for (const item of imagenes) {
  const { w, h } = await dimensiones(item.abs);
  const ligera = await optimizarFoto(item, ffmpeg);

  fotos.push({
    titulo: titular(item.archivo),
    categoria: rotular(item.categoria),
    imagen: ligera || "fotos/" + item.rel.split("/").map(encodeURIComponent).join("/"),
    ar: proporcion(w, h),
  });
}

fotos.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.titulo.localeCompare(b.titulo));

// =========================================================
// Escritura
// =========================================================
const cabecera = `/* =========================================================
   ARCHIVO GENERADO AUTOMÁTICAMENTE — no lo edites a mano.
   Regenéralo con:  node generar-datos.mjs
   Generado: ${new Date().toISOString().slice(0, 16).replace("T", " ")}
   ========================================================= */

const MEDIA_V = "${Date.now().toString(36)}";

const PROYECTOS = `;

await writeFile(
  path.join(RAIZ, "js", "datos.js"),
  cabecera +
    JSON.stringify(proyectosOrdenados, null, 2) +
    ";\n\nconst FOTOS = " +
    JSON.stringify(fotos, null, 2) +
    ";\n",
  "utf8"
);

const cats = [...new Set(proyectosOrdenados.map((p) => p.categoria))];
console.log(`\n✓ ${proyectosOrdenados.length} vídeos → js/datos.js`);
if (cats.length) console.log(`  Categorías de vídeo: ${cats.join(", ")}`);
if (fotos.length) {
  const catsF = [...new Set(fotos.map((p) => p.categoria))];
  console.log(`✓ ${fotos.length} fotos — categorías: ${catsF.join(", ")}`);
} else {
  console.log("· Sin fotos todavía (carpeta /fotos vacía).");
}
