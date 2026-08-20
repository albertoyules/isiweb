# Notas para trabajar en este proyecto

Portfolio de Isidro González (videógrafo, Málaga). HTML + CSS + JS a pelo, sin
framework y **sin paso de compilación**: lo que hay en el repo es lo que se
sirve. Se despliega solo en Vercel con cada `push` a `main` →
<https://isidrogonzalez.vercel.app>

El README para el dueño es `LEEME.md` y está escrito para alguien que no
programa. Este archivo es lo otro: lo que hay que saber antes de tocar código,
y sobre todo **las trampas que ya nos han costado horas**.

---

## Los vídeos: cómo se tratan

Esta es la parte con más reglas, y casi ninguna es obvia.

### De un archivo salen tres

De cada original en `videos/CATEGORIA/Nombre.mp4` el generador saca **tres
piezas distintas**, y cada una existe por un motivo:

| Archivo | Para qué | Peso |
|---|---|---|
| `previews/CATEGORIA_Nombre.mp4` | El bucle mudo de la rejilla | ~200-700 KB |
| `videos-web/CATEGORIA/Nombre.mp4` | El reproductor a pantalla completa, con sonido | 2-12 MB |
| `posters/CATEGORIA__Nombre.jpg` | La imagen fija mientras carga | ~100 KB |

**No usar el archivo bueno en la rejilla.** Safari sólo aguanta unos pocos
vídeos descodificándose a la vez; con los completos se atraganta y deja unos
cuantos congelados en el póster. Se puede forzar con
`CONFIG.calidadRejilla = "completa"`, pero es justo lo que no hay que hacer.

Los pósters van **same-origin** (Vercel), no por el CDN: una conexión TLS nueva
cuesta cientos de ms en 4G, justo para lo primero que se ve. Los vídeos sí van
por Cloudflare R2. Eso lo decide `medio(ruta, { sinCdn: true })` en
`js/rejilla.js`.

### Añadir contenido

```bash
./actualizar.sh            # comprime, sube a R2 sólo lo nuevo, publica y verifica
./actualizar.sh --probar   # todo menos publicar, y lo abre en local
```

`generar-datos.mjs` **reutiliza lo ya procesado** (comprueba si el destino
existe). Añadir un vídeo a una carpeta de veinte sólo trabaja con ese. Si hay
que rehacer algo, borrar el archivo generado y volver a lanzarlo.

`js/datos.js` es **generado, no se edita a mano**. Para cambiar rótulos está
`titulos.txt`; para el orden, `orden.txt`.

### Cuánto tarda y por qué

Los originales son 4K a ~126 Mbps: **893 MB por minuto de metraje**. Comprimir
uno lleva ~45 s y el cuello es **descodificar**, no codificar.

> Ya se probó el codificador por hardware (`h264_videotoolbox`): **es peor**.
> 12,8 s frente a 11,3 s de `libx264 -preset veryfast`, y el archivo sale 2,2×
> más grande. No volver a intentarlo esperando ganar tiempo.

### La rejilla y el número de piezas

La rejilla cierra a ras cuando cada bloque de vídeos verticales tiene un número
de piezas que cuadra con las columnas (4 en escritorio, 2 en móvil — antes eran
3/2, subido para que el vídeo ocupe menos y se scrollee más rápido en PC).
Los bloques los separan el nombre grande y los vídeos apaisados. **Múltiplos de
4 cuadran con las dos cosas a la vez.** Si no cuadra, el bloque se pinta con
menos columnas, estrechado y centrado, para que las piezas midan lo mismo que
las demás.

Las fotos (`fotos.html`) usan las MISMAS columnas que el vídeo (el "escritorio"
por defecto de `construirRejilla`, 4). Se probó a subirlas sólo para fotos (5,
sin rebajar nunca aunque el grupo no cuadrase) pensando en escanear muchas de
un vistazo, pero eso descuadraba `.fila-ancha` (ver más abajo): con deporte de
acción hay muchas fotos en horizontal (13 de 31), y una apaisada calculada para
3-4 columnas al lado de una vertical calculada para 5 se veía casi 3 veces más
grande — una desproporción real que Alberto vio y hubo que revertir. Lo que de
verdad hace más pequeñas las fotos que los vídeos es el ancho máximo de la
página, `max-width: 950-1150px` centrado en `body[data-galeria="fotos"]
.galeria` (CSS). El móvil de fotos no cambia: sigue en 2, igual que el vídeo
(`columnasBase()` deja el móvil fijo pase lo que pase).

**`.fila-ancha` (las piezas apaisadas) escala con `--cols-base`, no con un
número fijo.** Antes tenía `grid-template-columns: repeat(3, ...)` a pelo, sin
relación con las columnas reales del bloque de al lado — daba igual, porque en
vídeo casi no hay piezas apaisadas (1 de 23) y nadie lo notaba. En fotos, con
13 de 31 en horizontal, la desproporción con las verticales quedaba clarísima.
`construirRejilla` ahora le pone `--cols-base` a cada `.fila-ancha` al crearla
(el mismo valor que usan sus columnas vecinas), y el CSS lee esa variable en
vez de un 3 fijo. El lado "der" tampoco puede ser `2 / span 2` (sólo funciona
para 3 columnas): es `span 2 / -1` — "las dos últimas columnas", sea cual sea
el número.

**Ojo con el móvil de `.fila-ancha`, además.** Tiene reglas de escritorio con
dos clases de especificidad (`.fila-ancha.izq .pieza` / `.fila-ancha.der
.pieza`) y una de móvil pensada para anularlas (`.fila-ancha .pieza {
grid-column: 1 / -1 }` dentro de `@media (max-width: 900px)`). Como esa regla
de móvil sólo tiene DOS clases, pierde contra las de escritorio (TRES clases)
aunque vaya después en el archivo y dentro del `@media`: **en CSS la
especificidad manda sobre el orden**. Costó encontrarlo porque no daba ningún
error: las fotos en horizontal del lado "der" salían minúsculas en el móvil,
aplastadas en una columna casi vacía, con las otras bien. El apaño es repetir
el selector con `.izq`/`.der` explícitos dentro del propio `@media` para
igualar la especificidad.

---

## Trampas que ya nos han mordido

**No repetir estos errores.** Cada uno costó tiempo de verdad.

### `prefers-reduced-motion` no debe apagar contenido

Si el iPhone tiene *Reducir movimiento* activado, `prefers-reduced-motion`
salta. Durante dos horas eso dejó **todos los vídeos parados** sin dar ni un
error: se descargaban enteros, el póster se veía, tocarlos funcionaba, pero
nadie llamaba a `play()`.

Esa opción quita animación **decorativa** (paralaje, entradas, suavizado del
scroll, el nombre escribiéndose). **Nunca contenido.** Y al probar hay que
forzarla a propósito: `newPage({ reducedMotion: "reduce" })`.

### El silencio va como ATRIBUTO, no sólo como propiedad

`video.load()` devuelve `muted` a su valor por defecto, y sin el atributo ese
valor es *con sonido* — y en iOS un vídeo con sonido pierde el permiso de
arrancar solo. Por eso `prepararVideo()` pone `defaultMuted` **y** el atributo.

### Nada de `preload="metadata"`

Safari en iOS pide 1 byte de sonda y **se queda ahí para siempre**. El vídeo
nunca llega a tener nada que reproducir. En escritorio sí continúa, así que el
simulador dice que funciona. **`preload="auto"` en todo lo que se pide.**

### No abortar un `play()` en vuelo

Tres formas de hacerlo, las tres tapadas y las tres hay que respetar: llamar a
`pause()`, quitar el `src`, o llamar a `load()`. Mientras
`video.dataset.pendiente === "1"`, ese vídeo **no se toca**. Ver `reproducir()`
y `pausar()` en `js/rejilla.js`.

### La costura del bucle necesita padding propio

El ciclo se repite cada H píxeles y H es `.ciclo.offsetHeight`. Como los clones
son `position:absolute`, **ninguna regla CSS puede meter margen entre una vuelta
y la siguiente**: tiene que formar parte de la altura del ciclo. Eso es
`--gap-ciclo` como `padding-bottom` de `.ciclo`. Sin él la última fila y la
primera se tocaban con 0px.

### `npx` cuesta 11 segundos por llamada

`subir-r2.sh` lo llamaba una vez por archivo: ocho minutos con 46 archivos sin
subir un byte. Wrangler es **dependencia local** y se resuelve una sola vez.
Si algún script vuelve a necesitar una herramienta de npm en un bucle, resolver
el binario fuera del bucle.

### macOS trae bash 3.2

Nada de `wait -n` ni arrays asociativos en los `.sh`. Para paralelizar, tandas
con `wait` a secas.

---

## Probar los cambios

```bash
node servidor.mjs        # http://localhost:8777 (los medios vienen del R2 real)
```

Playwright (global) con el motor **webkit** es lo más parecido a Safari que hay
en el Mac, pero **no es el motor de iOS** y ya ha dado falsos positivos varias
veces con vídeo y autoplay.

- Sirve para **comparar antes/después**: `git worktree add --detach <ruta> HEAD`,
  servir en otro puerto y medir las dos versiones. Dos números del mismo
  simulador son honestos.
- **No sirve** para declarar algo arreglado en iOS. Decirlo claramente.
- Hay que **forzar lo que no viene puesto**: `reducedMotion`, latencia en los
  medios (`page.route` con un `setTimeout` antes de `continue()`), el viewport
  exacto.
- Contar **eventos, no impresiones**: interceptar `HTMLMediaElement.prototype.play`
  y `.pause` en un `addInitScript` y contar llamadas y `AbortError`.

### Diagnóstico en el móvil real

```
https://isidrogonzalez.vercel.app/?depurar
```

Panel en pantalla con el estado crudo de cada vídeo (`readyState`,
`networkState`, `paused`, `currentTime`, `buffered`, `error`, `muted` y el
último resultado de `play()`). Sin `?depurar` no hace nada. `js/depurar.js`.

Lo importante que enseña: **distingue "no se ha intentado" de "se ha intentado
y ha fallado"**. Un `-> -` (motivo vacío) significa que `play()` ni se llamó, y
eso mueve la búsqueda del navegador a nuestro código. Fue lo que resolvió el bug
de *Reducir movimiento*.

---

## Mapa rápido

```
js/config.js      Lo editable: textos, contacto, clave del formulario, scroll
js/datos.js       GENERADO por generar-datos.mjs — no tocar
js/rejilla.js     Común: rutas de medios, reproducir/pausar, montaje de la rejilla
js/app.js         Portada: bucle infinito, render, vigilante, rescate, visor
js/galeria.js     Categorías y fotos (scroll normal)
js/formulario.js  Contacto: envío real + plan B por mailto
js/depurar.js     Panel ?depurar
generar-datos.mjs Lee videos/ y fotos/, comprime y escribe datos.js
actualizar.sh     El comando de cada día
subir-r2.sh       Subida a Cloudflare (lo llama actualizar.sh)
```

## Al escribir código aquí

Los comentarios de este proyecto explican **por qué**, no qué, y en castellano
llano — está pensado para que el dueño pueda leerlos. Donde hay una decisión
rara casi siempre hay detrás un fallo real: contar cuál era. Mantener ese tono.

Nombres de variables y funciones también en castellano (`reproducir`, `pausar`,
`cargar`, `medio`, `pieza`, `rejilla`). No mezclar idiomas.
