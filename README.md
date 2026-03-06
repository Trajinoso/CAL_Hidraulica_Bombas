# Documentación Técnica — Aplicación de Curvas de Bomba y Sistema Hidráulico

---

## 1. Descripción General

Aplicación interactiva React para el análisis de puntos de trabajo en instalaciones de bombeo hidráulico. Permite visualizar gráficamente la intersección entre la curva del sistema y las curvas de bombas en configuraciones simple, paralelo (1-4 unidades) y serie (1-4 unidades).

**Contexto de aplicación:** Diseño de sistemas de recirculación para piscinas públicas, instalaciones HVAC, sistemas de distribución de agua, y cualquier sistema de bombeo donde se requiera determinar el punto de operación óptimo.

---

## 2. Fundamentos Hidráulicos Implementados

### 2.1 Curva del Sistema

La curva del sistema representa la resistencia total que la bomba debe vencer. Responde a la ecuación:

**H_sistema = H_estática + k_sistema · Q²**

Donde:
- **H_estática** = H_geométrica + P_residual (componente independiente del caudal)
- **H_geométrica**: diferencia de cotas entre punto de aspiración y punto de entrega (m.c.a.)
- **P_residual**: presión mínima requerida en el punto de entrega, p.ej. boquillas (m.c.a.)
- **k_sistema**: coeficiente de pérdidas dinámicas, derivado de las pérdidas totales a caudal de diseño
- **Q**: caudal (m³/h)

**Cálculo de k_sistema:**

```
k = H_f / Q_diseño²
```

Donde **H_f** es la suma de:
- Pérdidas por fricción en tuberías (Darcy-Weisbach)
- Pérdidas singulares (codos, válvulas, tes, etc.)
- Pérdidas en equipos (filtros, intercambiadores, etc.)

**Implementación en código:**

```javascript
function calcK_sistema(H_f, Q_dis) {
  if (Q_dis <= 0) return 0;
  return H_f / (Q_dis * Q_dis);
}

function Hsys(H_est, k, Q) {
  return H_est + k * Q * Q;
}
```

---

### 2.2 Curva de Bomba Unitaria

La curva característica de una bomba centrífuga se aproxima a una parábola:

**H_bomba = H₀ − k_bomba · Q²**

Donde:
- **H₀**: altura manométrica a caudal cero (punto de cierre o shut-off head)
- **k_bomba**: coeficiente de la parábola, derivado de dos puntos conocidos de la curva
- **Q**: caudal (m³/h)

**Cálculo de k_bomba a partir de dos puntos del catálogo:**

Dados H₀ (altura a Q=0) y un punto nominal (Q_nom, H_nom):

```
k_bomba = (H₀ − H_nom) / Q_nom²
```

**Implementación:**

```javascript
function calcK_bomba(H0, H_nom, Q_nom) {
  if (Q_nom <= 0 || H0 <= H_nom) return 0.001;
  return (H0 - H_nom) / (Q_nom * Q_nom);
}

function Hbomb(H0, k, Q) {
  const H = H0 - k * Q * Q;
  return H > 0 ? +H.toFixed(4) : null;
}
```

---

### 2.3 N Bombas en Paralelo

Cuando se colocan **N bombas idénticas en paralelo**:

- El caudal total es la suma de los caudales individuales: **Q_total = N · Q_individual**
- Todas las bombas trabajan a la **misma altura manométrica**
- Cada bomba maneja **Q_total / N**

**Curva combinada:**

```
H_paralelo = H₀ − k_bomba · (Q_total / N)²
```

**Efecto gráfico:** la curva se desplaza hacia la derecha (mayor caudal a la misma altura).

**Intersección con el sistema:**

Igualando:

```
H_est + k_sys·Q² = H₀ − k_bomba·(Q/N)²

Q²·(k_sys + k_bomba/N²) = H₀ − H_est

Q = √[(H₀ − H_est) / (k_sys + k_bomba/N²)]
```

**Implementación:**

```javascript
function HparallelN(H0, k, Q, N) {
  const H = H0 - k * (Q / N) * (Q / N);
  return H > 0 ? +H.toFixed(4) : null;
}

function intersectParN(H_est, k_sys, H0, k_pump, N, Qmax) {
  const d = k_sys + k_pump / (N * N);
  if (d <= 0) return null;
  const Q2 = (H0 - H_est) / d;
  if (Q2 <= 0) return null;
  const Q = Math.sqrt(Q2);
  if (Q > Qmax) return null;
  return { Q: +Q.toFixed(2), H: +(H_est + k_sys * Q2).toFixed(2) };
}
```

**Importante:** El caudal obtenido en el punto de trabajo NO es exactamente N veces el de una bomba sola, porque la curva del sistema tiene pendiente. El resultado real siempre es menor debido al aumento cuadrático de las pérdidas.

---

### 2.4 N Bombas en Serie

Cuando se colocan **N bombas idénticas en serie**:

- La altura manométrica total es la suma de las alturas individuales: **H_total = N · H_individual**
- Todas las bombas manejan el **mismo caudal Q**

**Curva combinada:**

```
H_serie = N · (H₀ − k_bomba · Q²)
```

**Efecto gráfico:** la curva se desplaza hacia arriba (mayor altura al mismo caudal).

**Intersección con el sistema:**

```
H_est + k_sys·Q² = N·H₀ − N·k_bomba·Q²

Q²·(k_sys + N·k_bomba) = N·H₀ − H_est

Q = √[(N·H₀ − H_est) / (k_sys + N·k_bomba)]
```

**Implementación:**

```javascript
function HseriesN(H0, k, Q, N) {
  const h1 = H0 - k * Q * Q;
  if (h1 <= 0) return null;
  return +(h1 * N).toFixed(4);
}

function intersectSerN(H_est, k_sys, H0, k_pump, N, Qmax) {
  const d = k_sys + N * k_pump;
  if (d <= 0) return null;
  const Q2 = (N * H0 - H_est) / d;
  if (Q2 <= 0) return null;
  const Q = Math.sqrt(Q2);
  if (Q > Qmax) return null;
  return { Q: +Q.toFixed(2), H: +(H_est + k_sys * Q2).toFixed(2) };
}
```

---

## 3. Arquitectura de la Aplicación

### 3.1 Stack Tecnológico

- **Framework:** React (functional components con Hooks)
- **Librería de gráficos:** Recharts
- **Gestión de estado:** React hooks (useState, useMemo, useCallback)
- **Estilo:** CSS-in-JS inline (sin dependencias externas)

### 3.2 Estructura de Componentes

```
PumpCurves (componente principal)
├── Section (contenedor de sección del panel)
├── InputField (campo de entrada numérica)
├── NBombas (selector de 1-4 bombas)
├── Toggle (switch para visibilidad de curvas)
├── Pill (indicador de valor calculado)
├── WPBadge (badge de punto de trabajo)
├── LineChart (Recharts)
│   ├── Line (curva del sistema)
│   ├── Line (bomba simple)
│   ├── Line (N bombas paralelo)
│   ├── Line (N bombas serie)
│   ├── ReferenceDot (puntos de intersección)
│   └── ReferenceLine (línea Q_diseño)
└── CustomTooltip
```

### 3.3 Estado de la Aplicación

El estado completo se gestiona en un único objeto:

```javascript
const DEFAULT = {
  // Sistema
  H_g:    6.00,      // Altura geométrica (m.c.a.)
  P_res:  7.14,      // Presión residual (m.c.a.)
  H_f:    7.43,      // Pérdidas dinámicas totales (m.c.a.)
  Q_dis:  60,        // Caudal de diseño (m³/h)
  
  // Bomba
  H0:     26,        // Altura a Q=0 (m.c.a.)
  H_nom:  20,        // Altura nominal (m.c.a.)
  Q_nom:  30,        // Caudal nominal (m³/h)
  
  // Configuración
  Q_max:  150,       // Rango del gráfico (m³/h)
  n_paralelo: 2,     // Número de bombas en paralelo
  n_serie:    2,     // Número de bombas en serie
  
  // Visibilidad
  mostrar_sistema:  true,
  mostrar_simple:   true,
  mostrar_paralelo: true,
  mostrar_serie:    true,
};
```

### 3.4 Valores Derivados (Memoizados)

Para optimizar rendimiento, los valores calculados se memorizan con `useMemo`:

```javascript
// Altura estática total
const H_est = p.H_g + p.P_res;

// Coeficientes de las curvas
const k_sys  = calcK_sistema(p.H_f, p.Q_dis);
const k_pump = calcK_bomba(p.H0, p.H_nom, p.Q_nom);

// Datos del gráfico (array de 120 puntos)
const { data, ptSimple, ptPar, ptSer } = useMemo(() => {
  // Generación de curvas
  // Cálculo de intersecciones
}, [dependencias]);
```

---

## 4. Generación de Curvas

### 4.1 Discretización del Dominio

El rango [0, Q_max] se divide en 120 pasos uniformes. Para cada valor de Q:

```javascript
const steps = 120;
const dQ = p.Q_max / steps;

for (let i = 0; i <= steps; i++) {
  const Q = +(i * dQ).toFixed(3);
  const row = { Q };
  
  if (p.mostrar_sistema)
    row["Sistema"] = +(Hsys(H_est, k_sys, Q)).toFixed(3);
  
  if (p.mostrar_simple)
    row["Bomba simple"] = Hbomb(p.H0, k_pump, Q);
  
  if (p.mostrar_paralelo)
    row[labelParalelo] = HparallelN(p.H0, k_pump, Q, p.n_paralelo);
  
  if (p.mostrar_serie)
    row[labelSerie] = HseriesN(p.H0, k_pump, Q, p.n_serie);
  
  rows.push(row);
}
```

### 4.2 Manejo de Valores Negativos

Las funciones de bomba retornan `null` cuando H ≤ 0, lo que hace que Recharts omita esos puntos y termine la curva correctamente en el eje X.

---

## 5. Cálculo de Puntos de Trabajo

Los puntos de trabajo se calculan analíticamente resolviendo la ecuación:

**H_sistema(Q) = H_bomba(Q)**

Las soluciones se obtienen despejando Q de una ecuación cuadrática. Si el punto cae fuera del rango [0, Q_max] o no tiene solución real, se retorna `null`.

**Validaciones implementadas:**

1. Denominador > 0 (evita divisiones por cero)
2. Q² > 0 (solución real)
3. Q ≤ Q_max (dentro del rango visible)

---

## 6. Interfaz de Usuario

### 6.1 Panel de Parámetros (Lateral Izquierdo)

**Secciones:**

1. **Curva del sistema**
   - Inputs: H_g, P_res, H_f, Q_dis
   - Pills calculados: H_estática, k_sistema, H_total en Q_dis
   - Fórmula resultante mostrada

2. **Bomba unitaria**
   - Inputs: H₀, H_nom, Q_nom
   - Pill calculado: k_bomba
   - Fórmula resultante

3. **Configuración de bombas**
   - Selector 1-4 para paralelo
   - Selector 1-4 para serie
   - Visualización dinámica de fórmulas según N seleccionado
   - Previsualización del punto de trabajo en cada configuración

4. **Rango del gráfico**
   - Input: Q_max

5. **Curvas visibles**
   - Toggles para activar/desactivar cada curva

6. **Puntos de trabajo**
   - Badges con (Q, H) de cada configuración
   - Indicación de Q y H por bomba individual en configuraciones múltiples

### 6.2 Área de Gráfico (Derecha)

**Elementos:**

- **Pills de fórmulas:** resumen de las ecuaciones activas
- **Gráfico Recharts:**
  - Ejes X (Q) e Y (H) con etiquetas
  - Grid semi-transparente
  - Línea de referencia vertical en Q_diseño
  - Curvas coloreadas según tipo
  - Puntos de intersección marcados con coordenadas
  - Leyenda dinámica
  - Tooltip interactivo

- **Notas explicativas:** texto dinámico que se adapta al número de bombas seleccionado

### 6.3 Paleta de Colores

```javascript
const C = {
  sistema:  "#f59e0b",  // Ámbar (curva del sistema)
  simple:   "#38bdf8",  // Cyan (bomba simple)
  paralelo: "#34d399",  // Verde (paralelo)
  serie:    "#f472b6",  // Rosa (serie)
};
```

**Tema general:**
- Fondo: degradado oscuro (#05090f → #0b1120)
- Texto principal: #e2e8f0
- Texto secundario: #475569
- Bordes/divisores: rgba(255,255,255,0.05)

---

## 7. Casos de Uso y Validaciones

### 7.1 Validación de Inputs

- **H_g, P_res, H_f:** admiten valores ≥ 0
- **Q_dis, Q_nom:** deben ser > 0 para evitar división por cero
- **H₀ > H_nom:** necesario para que k_bomba sea positivo
- **Q_max:** debe ser suficientemente grande para visualizar intersecciones

### 7.2 Comportamiento con N=1

Cuando se selecciona N=1 en paralelo o serie:
- La curva resultante **coincide exactamente** con la bomba simple
- Se evita duplicar líneas en el gráfico
- Si "Bomba simple" está desactivada pero paralelo N=1 activo, se muestra la curva con el color de paralelo

### 7.3 Sin Intersección

Si las curvas no se cruzan en el rango visible:
- El badge de punto de trabajo muestra "Sin intersección en rango"
- No se dibuja ReferenceDot en el gráfico
- El usuario debe ajustar Q_max o los parámetros de bomba/sistema

---

## 8. Optimizaciones de Rendimiento

### 8.1 Memoización

- `useMemo` para el array completo de datos del gráfico (evita recálculo en cada render)
- `useMemo` para Hmax (límite dinámico del eje Y)
- `useCallback` para las funciones `set()` de actualización de estado

### 8.2 Generación Eficiente

- Generación de 120 puntos (compromiso entre suavidad y rendimiento)
- Cálculos de intersección analíticos (O(1)) en lugar de iterativos
- Uso de `toFixed()` para limitar decimales y reducir memoria

---

## 9. Ejemplo de Datos Preconfigurados

Los valores por defecto corresponden a una **piscina pública de 60 m³/h**:

```
Sistema:
  H_g    = 6.00 m.c.a.   (altura geométrica)
  P_res  = 7.14 m.c.a.   (0,7 bar en boquillas)
  H_f    = 7.43 m.c.a.   (pérdidas: fricción + singulares + filtro limpio)
  Q_dis  = 60 m³/h       (caudal de diseño)
  
  → H_estática = 13.14 m.c.a.
  → k_sistema  = 0.0021 m/(m³/h)²
  → H_total a 60 m³/h = 20.57 m.c.a.

Bomba:
  H₀    = 26 m.c.a.      (shut-off head)
  H_nom = 20 m.c.a.      (punto BEP)
  Q_nom = 30 m³/h        (caudal BEP)
  
  → k_bomba = 0.0667 m/(m³/h)²

Configuración:
  2 bombas en paralelo → Punto de trabajo: (59.4 m³/h, 20.3 m.c.a.)
                          Cada bomba: 29.7 m³/h a 20.3 m.c.a.
```

---

## 10. Extensiones Futuras Posibles

1. **Exportación de datos:**
   - CSV con tabla de valores Q-H
   - Imagen PNG del gráfico
   - PDF con informe técnico

2. **Curvas de rendimiento:**
   - Superposición de curvas η(Q) de eficiencia
   - Cálculo de potencia consumida
   - Indicación de zona BEP (Best Efficiency Point)

3. **Análisis de costes:**
   - Consumo energético anual
   - Comparativa económica entre configuraciones

4. **Biblioteca de bombas:**
   - Catálogo de modelos comerciales precargados
   - Importación desde archivos CSV/JSON

5. **Análisis NPSH:**
   - Verificación de cavitación
   - Cálculo de NPSH disponible vs requerido

6. **Múltiples sistemas:**
   - Comparación de varios sistemas en el mismo gráfico
   - Escenarios de filtro limpio vs sucio

---

## 11. Referencias Técnicas

### Normativas y Guías Consultadas

- **ASOFAP** — Guía Técnica para el Diseño de Piscinas Públicas (2023)
- **CTE DB-HS 4** — Código Técnico de la Edificación, Suministro de Agua
- **UNE-EN 1452** — Sistemas de canalización en materiales plásticos (diámetros PVC)
- **Crane Technical Paper 410** — Flow of Fluids Through Valves, Fittings, and Pipe
- **Idel'chik** — Handbook of Hydraulic Resistance (coeficientes K singulares)

### Ecuaciones Fundamentales

- **Darcy-Weisbach:** pérdidas por fricción en tuberías
- **Colebrook-White:** factor de fricción en régimen turbulento
- **Bernoulli generalizada:** conservación de energía en circuitos hidráulicos
- **Leyes de afinidad de bombas:** escalado con velocidad y diámetro

---

## 12. Contacto y Soporte

Esta documentación técnica describe la implementación completa de la aplicación de curvas de bomba. Para dudas o ampliaciones, consultar el código fuente en `/mnt/user-data/outputs/pump_curves.jsx`.

**Versión:** 1.0  
**Fecha:** Marzo 2026  
**Autor:** Desarrollado con Claude (Anthropic)
