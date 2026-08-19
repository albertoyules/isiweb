/* =========================================================
   Panel de diagnóstico de vídeo — SÓLO se enciende si la URL
   lleva "?depurar" (o "#depurar"). En una visita normal este
   archivo no hace absolutamente nada.
   ---------------------------------------------------------
   Para qué sirve: mirar en la PANTALLA DEL PROPIO MÓVIL qué
   está haciendo cada vídeo, sin cable ni Inspector Web. Se
   abre así desde el iPhone:

     https://isidrogonzalez.vercel.app/?depurar

   Qué significa cada columna de una fila de vídeo:
     rs  readyState  0 = sin datos · 2 = ya hay imagen ·
                     3-4 = hay de sobra para reproducir
     ns  networkState 1 = parado · 2 = descargando ·
                     3 = no encuentra la fuente
     p   pausado (sí/no)
     t   segundo por el que va (si sube, SE ESTÁ MOVIENDO)
     buf segundos descargados
     err código de error del elemento, si lo hay
     ->  último resultado de play(): ok, NotAllowedError,
         AbortError, sin-respuesta…

   Lectura rápida del resultado:
   - t sube  → el vídeo va bien, el problema sería otro (visual).
   - p=sí y -> NotAllowedError → el navegador prohíbe el
     autoplay: no es la web, es una política/ajuste del móvil.
   - p=sí y -> AbortError → alguien corta el play() a medias.
   - rs=0 y ns=2 eternamente → los datos no llegan (red/CDN).
   - rs=0 y ns=1 → la descarga ni siquiera ha empezado.
   - err=4 → el archivo no se puede decodificar en este móvil.
   ========================================================= */

var DEPURAR = (function () {
  "use strict";

  const activo = /[?&#]depurar/.test(location.search + location.hash);

  // Apagado: se devuelven funciones vacías para no tener que comprobar
  // "¿está encendido?" en cada sitio desde donde se llama.
  if (!activo) return { activo: false, apunta: function () {} };

  const registro = [];   // últimos avisos, los más nuevos arriba

  function apunta(video, texto) {
    const n = video && video.dataset ? (video.dataset.dep || "?") : "?";
    registro.unshift(reloj() + " #" + n + " " + texto);
    if (registro.length > 8) registro.pop();
  }

  function reloj() {
    return (performance.now() / 1000).toFixed(1).padStart(5, " ");
  }

  const panel = document.createElement("div");
  panel.setAttribute("aria-hidden", "true");
  panel.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:9999",
    "max-height:52vh", "overflow:hidden",
    "background:rgba(0,0,0,.86)", "color:#0f0",
    "font:10px/1.35 ui-monospace,Menlo,monospace",
    "padding:6px 8px", "white-space:pre", "pointer-events:none",
    "text-shadow:0 0 2px #000",
  ].join(";");

  function fila(v, i) {
    const err = v.error ? v.error.code : "";
    let buf = "-";
    try {
      if (v.buffered.length) buf = v.buffered.end(v.buffered.length - 1).toFixed(1);
    } catch (e) { /* algunos navegadores lanzan si aún no hay nada */ }
    return [
      "#" + String(i).padStart(2, "0"),
      "rs" + v.readyState,
      "ns" + v.networkState,
      v.paused ? "PAUSA" : "anda ",
      "t" + v.currentTime.toFixed(1).padStart(5),
      "buf" + String(buf).padStart(5),
      err ? "err" + err : "    ",
      v.muted ? "mudo" : "SUENA",
      "-> " + (v.dataset.motivo || "-"),
    ].join(" ");
  }

  function pintar() {
    const todos = [...document.querySelectorAll(".pieza video")];
    todos.forEach((v, i) => { if (!v.dataset.dep) v.dataset.dep = i; });

    // Sólo los que tienen fuente asignada: el resto son ruido.
    const conFuente = todos.filter((v) => v.src);
    const andando = conFuente.filter((v) => !v.paused && v.currentTime > 0);

    panel.textContent = [
      "DIAGNÓSTICO VÍDEO — quita ?depurar de la URL para ocultarlo",
      "piezas:" + todos.length +
        "  con fuente:" + conFuente.length +
        "  MOVIÉNDOSE:" + andando.length +
        "  ancho:" + window.innerWidth + "x" + window.innerHeight,
      "",
      ...conFuente.slice(0, 10).map((v) => fila(v, v.dataset.dep)),
      "",
      ...registro,
    ].join("\n");
  }

  function arrancar() {
    document.body.appendChild(panel);
    setInterval(pintar, 400);
    pintar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancar);
  } else {
    arrancar();
  }

  return { activo: true, apunta: apunta };
})();
