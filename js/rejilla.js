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
function medio(ruta, opciones) {
  if (!ruta) return "";
  if (/^https?:/i.test(ruta)) return ruta;
  /* Los pósters se quedan en el MISMO dominio que la página (Vercel), sin
     pasar por el CDN de Cloudflare. Se comprobó contra una web hermana
     (cristiyules.com) que sí carga bien en móvil: sus pósters van
     same-origin y sólo el vídeo pesado va al CDN. Tiene sentido — un
     dominio nuevo significa una conexión TLS nueva desde cero (DNS +
     handshake), y eso cuesta cientos de ms en una 4G floja, justo para la
     imagen que más importa: la que se ve primero, antes de que cargue
     nada más. Los pósters ya viajan con el propio despliegue (carpeta
     posters/ está en git), así que no hace falta el CDN para ellos. */
  const sinCdn = opciones && opciones.sinCdn;
  const base = sinCdn ? "" : (CONFIG.cdn || "").replace(/\/$/, "");
  const url = base ? base + "/" + ruta : ruta;
  const v = typeof MEDIA_V !== "undefined" ? MEDIA_V : "";
  return v ? url + (url.includes("?") ? "&" : "?") + "v=" + v : url;
}

/* Asigna la fuente y pide al navegador que la descargue del todo.
   Sin preload="auto" un vídeo pausado se queda a medias y, cuando entra en
   pantalla, hay que esperar a que termine: es lo que se notaba como tirón.

   OJO — esto se probó con preload="metadata" para lo que sólo estaba cerca
   (no en pantalla todavía), pensando que aliviaría el ancho de banda en
   móvil. En el simulador de escritorio parecía funcionar, pero comprobado
   con el Inspector Web conectado a un iPhone real: Safari en iOS con
   preload="metadata" pide un primer byte del vídeo (una sonda para leer
   duración/códec) Y SE QUEDA AHÍ, sin seguir bajando nada más por su
   cuenta — a diferencia del motor de escritorio, que sí continuaba. El
   vídeo se queda con ~1 byte descargado para siempre y nunca hay nada que
   reproducir. Por eso tocar un vídeo SÍ funcionaba (algo.play() fuerza la
   descarga completa de un tirón) pero el autoplay de la rejilla no.
   preload="auto" en TODO lo que se pide es lo único que se ha comprobado
   que funciona de verdad en un iPhone real; el resto de arreglos (pósters
   diferidos y same-origin, menos descargas simultáneas en móvil) ya
   recortan bastante el atasco sin tocar esto. */
function cargar(video) {
  if (!video || video.src || !video.dataset.src) return;
  video.preload = "auto";
  video.src = video.dataset.src;
  video.load();
}

/* Pide el póster sólo cuando hace falta (ver por qué en crearPieza, app.js
   y galeria.js). Ligero: sólo hay que asignarlo, sin tocar preload/load. */
function cargarPoster(video) {
  if (!video || video.poster || !video.dataset.poster) return;
  video.poster = video.dataset.poster;
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

// Proporción con la que se PINTA la pieza (ver unificarVerticales).
function arDeRejilla(p) {
  return p.arRejilla || p.ar || "4 / 5";
}

// Altura relativa de una pieza si todas las columnas tuvieran ancho 1.
function alturaEstimada(p) {
  const [w, h] = arDeRejilla(p).split("/").map((n) => parseFloat(n));
  return w && h ? h / w : 1.25;
}

/* Pone a todas las piezas verticales la proporción más repetida del grupo.
   Casi todos los vídeos son 9/16; con que uno solo se salga (por ejemplo
   uno un poco más cuadrado), su columna cierra más arriba que las otras y
   queda un diente en el borde de abajo por mucho que el número de piezas
   cuadre. Al pintarlas todas con la misma proporción, las columnas acaban
   exactamente a la misma altura. Lo que sobra se recorta con object-fit:
   cover y en el reproductor el vídeo se sigue viendo entero.
   Sólo para vídeo: las fotos tienen formatos muy distintos a propósito. */
function unificarVerticales(items) {
  const cuenta = new Map();
  for (const p of items) {
    if (esApaisada(p)) continue;
    cuenta.set(p.ar, (cuenta.get(p.ar) || 0) + 1);
  }
  if (!cuenta.size) return items;
  const dominante = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return items.map((p) => (esApaisada(p) ? p : { ...p, arRejilla: dominante }));
}

/* Columnas según el ancho de pantalla.
   OJO: este número lo tiene que decidir JS, no el CSS. Antes el CSS forzaba
   2 columnas por debajo de 900px y 1 por debajo de 600px con !important,
   pero JS seguía repartiendo las piezas en 3 contenedores .columna: el
   tercero caía a una fila nueva y dejaba medio ancho de pantalla en blanco.
   De ahí venían los huecos grandes en tableta y móvil. */
function columnasBase() {
  const w = window.innerWidth;
  return w < 900 ? 2 : 3;
}

/* Cuántas columnas usar para un grupo de g piezas.
   Como casi todas las piezas son verticales y de la misma proporción, si g
   es múltiplo del número de columnas todas acaban EXACTAMENTE a la misma
   altura y no queda ni un hueco. Si no lo es, se prueba con una columna
   menos antes de rendirse: mejor un bloque de dos columnas bien cerrado que
   uno de tres con la última fila coja. */
function elegirColumnas(g) {
  const base = columnasBase();
  if (g <= 0) return base;
  if (g < base) return g;                       // 1 ó 2 piezas sueltas
  if (g % base === 0) return base;
  for (let c = base - 1; c >= 2; c--) if (g % c === 0) return c;
  return base;
}

// Piezas que sobran (las que dejarían una fila coja) con el mejor reparto.
function sobra(g) {
  const base = columnasBase();
  if (g <= 0 || g < base) return 0;
  let mejor = g % base;
  for (let c = base - 1; c >= 2 && mejor > 0; c--) mejor = Math.min(mejor, g % c);
  return mejor;
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
   nombre. Cada grupo de piezas normales entre apaisadas se reparte en
   columnas; si su tamaño no cuadra con el número de columnas, la última
   fila queda coja y ahí aparece el hueco. El corte en sí también abre un
   grupo nuevo (separa lo de arriba de lo de abajo), así que hay que mirar
   los grupos que resultarían de verdad — no basta con contar piezas por
   mitad — y quedarse con el corte que deje menos piezas sueltas. */
function elegirCorte(lista) {
  const centro = Math.ceil(lista.length / 2);
  const puntuacion = (grupos) => grupos.reduce((n, g) => n + sobra(g), 0);

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
  /* Las columnas ya no van escalonadas. El escalonado (0 / 11 / 4 vh) daba
     un aire editorial, pero como todas las piezas son verticales y de la
     misma proporción, era justo lo que impedía que el bloque cerrase a ras:
     dejaba un diente arriba y otro abajo en cada rejilla. Sin desfase y con
     un número de piezas múltiplo de las columnas, el bloque queda macizo. */
  const desfasesVh = [0, 0, 0];
  const GAP = 0.5;               // separación entre piezas, misma escala que h/w
  let cola = [];
  let ladoAncha = 0;

  function volcarColumnas() {
    if (!cola.length) return;
    const n = elegirColumnas(cola.length);

    const rejilla = document.createElement("div");
    rejilla.className = "rejilla";
    rejilla.style.setProperty("--cols", n);
    // Cuántas columnas tendría el bloque si el número de piezas cuadrase:
    // el CSS lo usa para estrechar el bloque en vez de estirar las piezas
    // (si no, un bloque de 2 columnas sale con los vídeos gigantes al lado
    // de los de 3).
    rejilla.style.setProperty("--cols-base", columnasBase());

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

    /* A la columna más corta hasta el momento: con alturas reales (no sólo
       el índice) ninguna se queda muy por detrás de las demás.
       El tope por columna es lo que cierra el bloque: sin él, una pieza algo
       más baja que las demás podía llevarse dos huecos a la misma columna y
       dejar otra corta aunque el número de piezas cuadrase. */
    const maxPorColumna = Math.ceil(cola.length / n);
    const cuentas = new Array(n).fill(0);

    cola.forEach(({ p, i }) => {
      let destino = -1;
      for (let c = 0; c < n; c++) {
        if (cuentas[c] >= maxPorColumna) continue;
        if (destino === -1 || alturas[c] < alturas[destino]) destino = c;
      }
      if (destino === -1) destino = 0;
      columnas[destino].appendChild(crearPieza(p, base + i));
      alturas[destino] += alturaEstimada(p) + GAP;
      cuentas[destino]++;
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
