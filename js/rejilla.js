/* =========================================================
   Construcción de la rejilla — compartida por la portada
   (bucle infinito) y por las páginas de scroll normal.
   ---------------------------------------------------------
   Las piezas verticales van en 3 columnas escalonadas.
   Las horizontales rompen la rejilla y ocupan dos tercios del
   ancho, alternando lado, para que no queden ridículas al lado
   de los vídeos en vertical.
   ========================================================= */

/* Ruta de un medio.
   - Si CONFIG.cdn está definido, se sirve desde allí.
   - Se le añade la versión que escribe el generador, para que al regenerar
     los vídeos el navegador no siga mostrando los de la caché. */
function medio(ruta) {
  if (!ruta) return "";
  if (/^https?:/i.test(ruta)) return ruta;
  const base = (CONFIG.cdn || "").replace(/\/$/, "");
  const url = base ? base + "/" + ruta : ruta;
  const v = typeof MEDIA_V !== "undefined" ? MEDIA_V : "";
  return v ? url + (url.includes("?") ? "&" : "?") + "v=" + v : url;
}

/* Asigna la fuente y pide al navegador que la descargue del todo.
   Sin preload="auto" un vídeo pausado se queda a medias y, cuando entra en
   pantalla, hay que esperar a que termine: es lo que se notaba como tirón. */
function cargar(video) {
  if (!video || video.src || !video.dataset.src) return;
  video.preload = "auto";
  video.src = video.dataset.src;
  video.load();
}

/* Estados del reproductor: mientras carga muestra un giro, y si falla dice
   POR QUÉ falla en vez de quedarse en negro sin explicación. */
function vigilarCarga(visor, video) {
  if (!visor || !video) return;
  visor.classList.add("cargando");
  visor.classList.remove("fallo");

  const detalle = visor.querySelector(".estado.error .detalle");
  const listo = () => visor.classList.remove("cargando", "fallo");
  const fallo = (motivo) => {
    visor.classList.remove("cargando");
    visor.classList.add("fallo");
    if (detalle) {
      detalle.textContent = motivo + " · " +
        decodeURIComponent((video.currentSrc || video.src || "").split("/").slice(-2).join("/"));
    }
  };

  const tarde = setTimeout(() => {
    if (visor.classList.contains("cargando")) fallo("Tarda demasiado en llegar");
  }, 25000);

  const limpiar = () => {
    clearTimeout(tarde);
    video.removeEventListener("loadeddata", alCargar);
    video.removeEventListener("error", alFallar);
  };
  function alCargar() { limpiar(); listo(); }
  function alFallar() {
    limpiar();
    const c = video.error ? video.error.code : 0;
    fallo(["Error desconocido", "Reproducción cancelada", "Error de red",
           "El navegador no puede decodificarlo", "Formato no soportado"][c] || "Error " + c);
  }
  video.addEventListener("loadeddata", alCargar);
  video.addEventListener("error", alFallar);
}

// ¿La pieza es apaisada? Se decide con la proporción real ("16 / 9").
function esApaisada(p) {
  const [w, h] = (p.ar || "4 / 5").split("/").map((n) => parseFloat(n));
  return w && h ? w / h > 1.15 : false;
}

// Altura relativa de una pieza si todas las columnas tuvieran ancho 1.
function alturaEstimada(p) {
  const [w, h] = (p.ar || "4 / 5").split("/").map((n) => parseFloat(n));
  return w && h ? h / w : 1.25;
}

/* Siempre 3 columnas. (Se probó a reducir el número de columnas para
   grupos pequeños o mal repartidos, pero al ser cada columna más ancha,
   cada pieza también sale más alta — el hueco no desaparece, sólo cambia
   de sitio, y de paso esas piezas quedan más grandes que sus vecinas. El
   ajuste real se hace eligiendo bien el CORTE del ciclo, ver elegirCorte,
   más la repartición por altura real de más abajo.) */
function elegirColumnas() {
  return 3;
}

// Los mismos "grupos" (tandas entre piezas apaisadas) que formará
// construirRejilla al recorrer la lista, sin construir nada todavía.
function gruposDeFlush(sub) {
  const grupos = [];
  let actual = 0;
  for (const p of sub) {
    if (esApaisada(p)) { if (actual > 0) grupos.push(actual); actual = 0; }
    else actual++;
  }
  if (actual > 0) grupos.push(actual);
  return grupos;
}

/* Punto de corte del ciclo que separa la mitad de arriba y la de abajo del
   nombre. Cada grupo de piezas normales entre apaisadas se reparte en 3
   columnas; si su tamaño es ≡ 1 (mod 3), dos columnas se quedan cortas A LA
   VEZ mientras la tercera sigue, y el hueco vacío ocupa dos tercios del
   ancho de la fila. El corte en sí también abre un grupo nuevo (separa lo
   de arriba de lo de abajo), así que hay que mirar los grupos que
   resultarían de verdad — no basta con contar piezas por mitad — y elegir
   el corte que deje el menor número de grupos "malos" en las dos mitades. */
function elegirCorte(lista) {
  const centro = Math.ceil(lista.length / 2);
  const puntuacion = (grupos) => grupos.reduce((n, g) => n + (g % 3 === 1 ? 1 : 0), 0);

  let mejor = centro;
  let mejorMalo = Infinity;
  const candidatos = [centro];
  for (let d = 1; d <= Math.ceil(lista.length / 2); d++) candidatos.push(centro - d, centro + d);

  for (const c of candidatos) {
    if (c < 1 || c > lista.length - 1) continue;
    const malo =
      puntuacion(gruposDeFlush(lista.slice(0, c))) +
      puntuacion(gruposDeFlush(lista.slice(c)));
    // A igualdad de huecos, el corte más cercano al centro reparte mejor
    // el ciclo entre lo que se ve antes y después del nombre.
    if (malo < mejorMalo || (malo === mejorMalo && Math.abs(c - centro) < Math.abs(mejor - centro))) {
      mejorMalo = malo;
      mejor = c;
    }
  }
  return mejor;
}

/**
 * Devuelve un fragmento con la maquetación completa de la lista.
 * @param {Array}    items      piezas a colocar
 * @param {Function} crearPieza (item, indiceGlobal) => elemento
 * @param {Number}   base       desplazamiento del índice global
 */
function construirRejilla(items, crearPieza, base = 0) {
  const frag = document.createDocumentFragment();
  const desfasesVh = [0, 11, 4];
  const GAP = 0.5;               // separación entre piezas, misma escala que h/w
  let cola = [];
  let ladoAncha = 0;

  function volcarColumnas() {
    if (!cola.length) return;
    const n = elegirColumnas(cola.length);

    const rejilla = document.createElement("div");
    rejilla.className = "rejilla";
    rejilla.style.setProperty("--cols", n);

    const columnas = [];
    const alturas = [];
    for (let c = 0; c < n; c++) {
      const col = document.createElement("div");
      col.className = "columna";
      col.style.marginTop = (desfasesVh[c] ?? 0) + "vh";
      rejilla.appendChild(col);
      columnas.push(col);
      alturas.push((desfasesVh[c] ?? 0) / 55);
    }

    // A la columna más corta hasta el momento: con alturas reales (no sólo
    // el índice) ninguna se queda muy por detrás de las demás.
    cola.forEach(({ p, i }) => {
      let destino = 0;
      for (let c = 1; c < n; c++) if (alturas[c] < alturas[destino]) destino = c;
      columnas[destino].appendChild(crearPieza(p, base + i));
      alturas[destino] += alturaEstimada(p) + GAP;
    });

    frag.appendChild(rejilla);
    cola = [];
  }

  items.forEach((p, i) => {
    if (esApaisada(p)) {
      volcarColumnas();                       // cerramos el bloque en curso
      const fila = document.createElement("div");
      fila.className = "fila-ancha " + (ladoAncha++ % 2 ? "der" : "izq");
      fila.appendChild(crearPieza(p, base + i));
      frag.appendChild(fila);
    } else {
      cola.push({ p, i });
    }
  });

  volcarColumnas();
  return frag;
}
