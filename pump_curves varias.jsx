import { useState, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceDot, ResponsiveContainer, Label, ReferenceLine,
} from "recharts";

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT = {
  H_g:    6.00,
  P_res:  7.14,
  H_f:    7.43,
  Q_dis:  60,
  H0:     26,
  H_nom:  20,
  Q_nom:  30,
  Q_max:  150,
  n_paralelo: 2,   // número de bombas en paralelo
  n_serie:    2,   // número de bombas en serie
  mostrar_sistema:  true,
  mostrar_simple:   true,
  mostrar_paralelo: true,
  mostrar_serie:    true,
};

// ─── Cálculos hidráulicos ─────────────────────────────────────────────────────

function calcK_sistema(H_f, Q_dis) {
  if (Q_dis <= 0) return 0;
  return H_f / (Q_dis * Q_dis);
}

function calcK_bomba(H0, H_nom, Q_nom) {
  if (Q_nom <= 0 || H0 <= H_nom) return 0.001;
  return (H0 - H_nom) / (Q_nom * Q_nom);
}

// Curva del sistema: H = H_est + k·Q²
function Hsys(H_est, k, Q) {
  return H_est + k * Q * Q;
}

// Curva de bomba unitaria: H = H0 - k·Q²
function Hbomb(H0, k, Q) {
  const H = H0 - k * Q * Q;
  return H > 0 ? +H.toFixed(4) : null;
}

// N bombas en PARALELO: cada bomba trabaja con Q/N
// Curva combinada: H = H0 - k·(Q/N)²
function HparallelN(H0, k, Q, N) {
  const H = H0 - k * (Q / N) * (Q / N);
  return H > 0 ? +H.toFixed(4) : null;
}

// N bombas en SERIE: la altura se multiplica por N al mismo caudal
// Curva combinada: H = N·(H0 - k·Q²)
function HseriesN(H0, k, Q, N) {
  const h1 = H0 - k * Q * Q;
  if (h1 <= 0) return null;
  return +(h1 * N).toFixed(4);
}

// Intersección bomba simple con sistema
// H_est + k_sys·Q² = H0 - k_pump·Q²  →  Q² = (H0 - H_est)/(k_sys + k_pump)
function intersect1(H_est, k_sys, H0, k_pump, Qmax) {
  const d = k_sys + k_pump;
  if (d <= 0) return null;
  const Q2 = (H0 - H_est) / d;
  if (Q2 <= 0) return null;
  const Q = Math.sqrt(Q2);
  if (Q > Qmax) return null;
  return { Q: +Q.toFixed(2), H: +(H_est + k_sys * Q2).toFixed(2) };
}

// Intersección N bombas PARALELO con sistema
// H_est + k_sys·Q² = H0 - k_pump·(Q/N)²
// Q²·(k_sys + k_pump/N²) = H0 - H_est
function intersectParN(H_est, k_sys, H0, k_pump, N, Qmax) {
  const d = k_sys + k_pump / (N * N);
  if (d <= 0) return null;
  const Q2 = (H0 - H_est) / d;
  if (Q2 <= 0) return null;
  const Q = Math.sqrt(Q2);
  if (Q > Qmax) return null;
  return { Q: +Q.toFixed(2), H: +(H_est + k_sys * Q2).toFixed(2) };
}

// Intersección N bombas SERIE con sistema
// H_est + k_sys·Q² = N·H0 - N·k_pump·Q²
// Q²·(k_sys + N·k_pump) = N·H0 - H_est
function intersectSerN(H_est, k_sys, H0, k_pump, N, Qmax) {
  const d = k_sys + N * k_pump;
  if (d <= 0) return null;
  const Q2 = (N * H0 - H_est) / d;
  if (Q2 <= 0) return null;
  const Q = Math.sqrt(Q2);
  if (Q > Qmax) return null;
  return { Q: +Q.toFixed(2), H: +(H_est + k_sys * Q2).toFixed(2) };
}

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  sistema:  "#f59e0b",
  simple:   "#38bdf8",
  paralelo: "#34d399",
  serie:    "#f472b6",
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background:"rgba(6,9,18,0.97)", border:"1px solid rgba(255,255,255,0.1)",
      borderRadius:10, padding:"10px 16px", fontSize:12,
      boxShadow:"0 8px 32px rgba(0,0,0,0.7)",
    }}>
      <p style={{margin:"0 0 6px",color:"#94a3b8",fontFamily:"monospace"}}>
        Q = <strong style={{color:"#fff"}}>{Number(label).toFixed(1)} m³/h</strong>
      </p>
      {payload.map((p,i) => p.value != null && (
        <p key={i} style={{margin:"2px 0",color:p.color,fontFamily:"monospace"}}>
          {p.name}: <strong>{Number(p.value).toFixed(2)} m.c.a.</strong>
        </p>
      ))}
    </div>
  );
};

// ─── InputField ───────────────────────────────────────────────────────────────
function InputField({ label, unit, value, onChange, min, max, step=0.01, hint, accent="#38bdf8" }) {
  const [foc, setFoc] = useState(false);
  return (
    <div style={{marginBottom:11}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:3}}>
        <label style={{fontSize:10,color:"#94a3b8",letterSpacing:"0.09em",textTransform:"uppercase",fontFamily:"monospace"}}>{label}</label>
        {unit && <span style={{fontSize:10,color:"#334155",fontFamily:"monospace"}}>{unit}</span>}
      </div>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(parseFloat(e.target.value)||0)}
        onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
        style={{
          width:"100%", boxSizing:"border-box",
          background: foc ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
          border:`1px solid ${foc ? accent+"88" : "rgba(255,255,255,0.08)"}`,
          borderRadius:7, padding:"7px 10px", color:"#f1f5f9",
          fontSize:13, fontFamily:"monospace", outline:"none", transition:"all 0.18s",
        }}
      />
      {hint && <p style={{margin:"3px 0 0",fontSize:10,color:"#334155",fontStyle:"italic"}}>{hint}</p>}
    </div>
  );
}

// ─── Selector de N bombas ─────────────────────────────────────────────────────
function NBombas({ label, value, onChange, color }) {
  return (
    <div style={{marginBottom:12}}>
      <div style={{fontSize:10,color:"#94a3b8",letterSpacing:"0.09em",textTransform:"uppercase",fontFamily:"monospace",marginBottom:6}}>
        {label}
      </div>
      <div style={{display:"flex",gap:6}}>
        {[1,2,3,4].map(n => (
          <button key={n} onClick={()=>onChange(n)}
            style={{
              flex:1, padding:"8px 0", borderRadius:8, cursor:"pointer",
              fontSize:16, fontWeight:700, fontFamily:"monospace",
              border:`2px solid ${value===n ? color : "rgba(255,255,255,0.08)"}`,
              background: value===n ? `${color}22` : "rgba(255,255,255,0.03)",
              color: value===n ? color : "#475569",
              boxShadow: value===n ? `0 0 10px ${color}44` : "none",
              transition:"all 0.15s",
            }}
          >{n}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ label, color, checked, onChange }) {
  return (
    <div onClick={()=>onChange(!checked)}
      style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:8,userSelect:"none"}}>
      <div style={{
        width:32, height:17, borderRadius:9, flexShrink:0,
        background:checked ? color : "rgba(255,255,255,0.08)",
        position:"relative", transition:"background 0.2s",
        boxShadow:checked ? `0 0 9px ${color}55` : "none",
      }}>
        <div style={{
          position:"absolute", top:2, left:checked?15:2,
          width:13, height:13, borderRadius:"50%",
          background:"#fff", transition:"left 0.2s",
        }}/>
      </div>
      <span style={{fontSize:11,color:checked?"#e2e8f0":"#475569",transition:"color 0.2s"}}>{label}</span>
    </div>
  );
}

// ─── Badge punto de trabajo ───────────────────────────────────────────────────
function WPBadge({ label, point, color, extra }) {
  if (!point) return (
    <div style={{
      background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)",
      borderLeft:`3px solid ${color}44`, borderRadius:8, padding:"7px 11px", marginBottom:6,
      opacity:0.5,
    }}>
      <div style={{fontSize:9,color:"#334155",fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>{label}</div>
      <div style={{fontSize:10,color:"#334155",marginTop:3}}>Sin intersección en rango</div>
    </div>
  );
  return (
    <div style={{
      background:"rgba(255,255,255,0.03)",
      border:`1px solid ${color}33`, borderLeft:`3px solid ${color}`,
      borderRadius:8, padding:"7px 11px", marginBottom:6,
    }}>
      <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:"0.12em",fontFamily:"monospace",marginBottom:4}}>{label}</div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:"#94a3b8",fontFamily:"monospace"}}>Q = <strong style={{color:"#f1f5f9"}}>{point.Q} m³/h</strong></span>
        <span style={{fontSize:12,color:"#94a3b8",fontFamily:"monospace"}}>H = <strong style={{color:"#f1f5f9"}}>{point.H} m.c.a.</strong></span>
      </div>
      {extra && <div style={{fontSize:10,color,fontFamily:"monospace",marginTop:3}}>{extra}</div>}
    </div>
  );
}

// ─── Sección ──────────────────────────────────────────────────────────────────
function Section({ title, color, children }) {
  return (
    <div style={{marginBottom:20}}>
      <div style={{
        fontSize:9, color, textTransform:"uppercase", letterSpacing:"0.16em",
        fontFamily:"monospace", marginBottom:12, paddingBottom:5,
        borderBottom:`1px solid ${color}22`,
      }}>▸ {title}</div>
      {children}
    </div>
  );
}

// ─── Pill calculado ───────────────────────────────────────────────────────────
function Pill({ label, value, color }) {
  return (
    <div style={{
      display:"flex", justifyContent:"space-between", alignItems:"center",
      background:`${color}0e`, border:`1px solid ${color}22`,
      borderRadius:6, padding:"4px 9px", marginBottom:5,
    }}>
      <span style={{fontSize:10,color:"#475569",fontFamily:"monospace"}}>{label}</span>
      <span style={{fontSize:12,color,fontFamily:"monospace",fontWeight:700}}>{value}</span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PumpCurves() {
  const [p, setP] = useState(DEFAULT);
  const set = useCallback((k) => (v) => setP(pr => ({...pr, [k]: v})), []);

  // Valores derivados
  const H_est  = p.H_g + p.P_res;
  const k_sys  = calcK_sistema(p.H_f, p.Q_dis);
  const k_pump = calcK_bomba(p.H0, p.H_nom, p.Q_nom);
  const H_check = +(H_est + k_sys * p.Q_dis ** 2).toFixed(2);
  const ks = k_sys.toFixed(4);
  const kp = k_pump.toFixed(4);

  // Nombre de las curvas con N
  const labelPar = p.n_paralelo === 1 ? "Bomba simple" : `${p.n_paralelo} Bombas paralelo`;
  const labelSer = `${p.n_serie} Bomba${p.n_serie>1?"s":""} serie`;

  // Datos del gráfico
  const { data, ptSimple, ptPar, ptSer } = useMemo(() => {
    const steps = 120;
    const dQ = p.Q_max / steps;
    const rows = [];

    for (let i = 0; i <= steps; i++) {
      const Q = +(i * dQ).toFixed(3);
      const row = { Q };

      if (p.mostrar_sistema)
        row["Sistema"] = +(Hsys(H_est, k_sys, Q)).toFixed(3);

      if (p.mostrar_simple)
        row["Bomba simple"] = Hbomb(p.H0, k_pump, Q);

      if (p.mostrar_paralelo) {
        const lbl = p.n_paralelo === 1 ? "Bomba simple" : `${p.n_paralelo} Bombas paralelo`;
        // Evitar duplicar la línea si n_paralelo=1 y simple también activo
        if (!(p.n_paralelo === 1 && p.mostrar_simple))
          row[lbl] = HparallelN(p.H0, k_pump, Q, p.n_paralelo);
        else
          row[lbl] = HparallelN(p.H0, k_pump, Q, p.n_paralelo);
      }

      if (p.mostrar_serie)
        row[`${p.n_serie} Bomba${p.n_serie>1?"s":""} serie`] = HseriesN(p.H0, k_pump, Q, p.n_serie);

      rows.push(row);
    }

    const ptSimple = p.mostrar_simple
      ? intersect1(H_est, k_sys, p.H0, k_pump, p.Q_max)
      : null;
    const ptPar = p.mostrar_paralelo
      ? intersectParN(H_est, k_sys, p.H0, k_pump, p.n_paralelo, p.Q_max)
      : null;
    const ptSer = p.mostrar_serie
      ? intersectSerN(H_est, k_sys, p.H0, k_pump, p.n_serie, p.Q_max)
      : null;

    return { data: rows, ptSimple, ptPar, ptSer };
  }, [p, H_est, k_sys, k_pump]);

  const Hmax = useMemo(() => {
    const top = Math.max(
      H_est + k_sys * p.Q_max ** 2,
      p.H0 * Math.max(p.n_serie, 1)
    );
    return Math.min(Math.ceil(top * 1.15 / 5) * 5, 400);
  }, [H_est, k_sys, p.H0, p.Q_max, p.n_serie]);

  // Etiqueta dinámica paralelo para fórmulas
  const fPar = p.n_paralelo === 1
    ? `H = ${p.H0} − ${kp}·Q²`
    : `H = ${p.H0} − ${kp}·(Q/${p.n_paralelo})²`;
  const fSer = p.n_serie === 1
    ? `H = ${p.H0} − ${kp}·Q²`
    : `H = ${p.n_serie}·(${p.H0} − ${kp}·Q²)`;

  // Bomba simple siempre visible aunque coincida
  const showSimpleLine = p.mostrar_simple;
  const showParLine    = p.mostrar_paralelo && !(p.n_paralelo === 1 && p.mostrar_simple);
  const showSerLine    = p.mostrar_serie;

  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(160deg,#05090f 0%,#0b1120 60%,#05090f 100%)",
      color:"#e2e8f0", fontFamily:"'DM Sans',system-ui,sans-serif",
      display:"flex", flexDirection:"column",
    }}>

      {/* ── Header ── */}
      <div style={{
        padding:"16px 26px", borderBottom:"1px solid rgba(255,255,255,0.05)",
        background:"rgba(255,255,255,0.016)", display:"flex", alignItems:"center", gap:13,
      }}>
        <div style={{
          width:36, height:36, borderRadius:9, flexShrink:0,
          background:"linear-gradient(135deg,#0ea5e9,#6366f1)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:17,
          boxShadow:"0 0 16px rgba(14,165,233,0.3)",
        }}>⚙</div>
        <div>
          <h1 style={{margin:0,fontSize:17,fontWeight:700,letterSpacing:"-0.02em",color:"#f8fafc"}}>
            Curvas de Bomba y Sistema
          </h1>
          <p style={{margin:0,fontSize:11,color:"#475569"}}>Análisis de punto de trabajo hidráulico</p>
        </div>
      </div>

      <div style={{display:"flex",flex:1,flexWrap:"wrap",overflow:"hidden"}}>

        {/* ── Panel parámetros ── */}
        <div style={{
          width:275, flexShrink:0, padding:"16px 16px",
          borderRight:"1px solid rgba(255,255,255,0.05)",
          background:"rgba(255,255,255,0.01)", overflowY:"auto",
        }}>

          {/* SISTEMA */}
          <Section title="Curva del sistema" color={C.sistema}>
            <InputField label="Altura geométrica H_g" unit="m.c.a."
              value={p.H_g} onChange={set("H_g")} min={0} max={50} step={0.1}
              accent={C.sistema} hint="Diferencia de cotas aspiración → entrega"/>
            <InputField label="Presión residual P_res" unit="m.c.a."
              value={p.P_res} onChange={set("P_res")} min={0} max={50} step={0.1}
              accent={C.sistema} hint="Presión mínima requerida en punto de entrega"/>
            <InputField label="Pérdidas dinámicas H_f" unit="m.c.a."
              value={p.H_f} onChange={set("H_f")} min={0} max={100} step={0.1}
              accent={C.sistema} hint="Fricción + singulares + filtro a Q_diseño"/>
            <InputField label="Caudal de diseño Q_dis" unit="m³/h"
              value={p.Q_dis} onChange={set("Q_dis")} min={1} max={500} step={1}
              accent={C.sistema} hint="Caudal al que se calcularon las pérdidas H_f"/>
            <div style={{marginTop:8}}>
              <Pill label="H estática = H_g + P_res" value={`${(p.H_g+p.P_res).toFixed(2)} m.c.a.`} color={C.sistema}/>
              <Pill label="k = H_f / Q_dis²"         value={ks}                                       color={C.sistema}/>
              <Pill label="H total en Q_dis"          value={`${H_check} m.c.a.`}                     color={C.sistema}/>
            </div>
          </Section>

          {/* BOMBA */}
          <Section title="Bomba unitaria" color={C.simple}>
            <InputField label="H₀ — altura en Q = 0" unit="m.c.a."
              value={p.H0} onChange={set("H0")} min={1} max={300} step={0.5}
              accent={C.simple} hint="Punto de cierre (shut-off head)"/>
            <InputField label="H — altura nominal" unit="m.c.a."
              value={p.H_nom} onChange={set("H_nom")} min={0} max={300} step={0.5}
              accent={C.simple} hint="Altura del punto BEP o punto de catálogo"/>
            <InputField label="Q — caudal nominal" unit="m³/h"
              value={p.Q_nom} onChange={set("Q_nom")} min={1} max={500} step={1}
              accent={C.simple} hint="Caudal correspondiente a H nominal"/>
            <div style={{marginTop:8}}>
              <Pill label="k = (H₀ − H) / Q²" value={kp} color={C.simple}/>
            </div>
          </Section>

          {/* CONFIGURACIÓN BOMBAS */}
          <Section title="Configuración de bombas" color={C.paralelo}>
            <NBombas
              label="N bombas en paralelo"
              value={p.n_paralelo}
              onChange={set("n_paralelo")}
              color={C.paralelo}
            />
            <div style={{
              background:`${C.paralelo}0a`, border:`1px solid ${C.paralelo}22`,
              borderRadius:7, padding:"6px 10px", marginBottom:12,
              fontSize:9, color:"#475569", fontFamily:"monospace", lineHeight:1.6,
            }}>
              {p.n_paralelo === 1
                ? `1 bomba: H = ${p.H0} − ${kp}·Q²`
                : `${p.n_paralelo} en paralelo: H = ${p.H0} − ${kp}·(Q/${p.n_paralelo})²`}
              {p.mostrar_paralelo && ptPar &&
                <><br/><span style={{color:C.paralelo}}>
                  Q total = {ptPar.Q} m³/h · H = {ptPar.H} m.c.a.
                  {p.n_paralelo > 1 && ` · cada bomba: ${(ptPar.Q/p.n_paralelo).toFixed(1)} m³/h`}
                </span></>
              }
            </div>

            <NBombas
              label="N bombas en serie"
              value={p.n_serie}
              onChange={set("n_serie")}
              color={C.serie}
            />
            <div style={{
              background:`${C.serie}0a`, border:`1px solid ${C.serie}22`,
              borderRadius:7, padding:"6px 10px", marginBottom:4,
              fontSize:9, color:"#475569", fontFamily:"monospace", lineHeight:1.6,
            }}>
              {p.n_serie === 1
                ? `1 bomba: H = ${p.H0} − ${kp}·Q²`
                : `${p.n_serie} en serie: H = ${p.n_serie}·(${p.H0} − ${kp}·Q²)`}
              {p.mostrar_serie && ptSer &&
                <><br/><span style={{color:C.serie}}>
                  Q = {ptSer.Q} m³/h · H = {ptSer.H} m.c.a.
                </span></>
              }
            </div>
          </Section>

          {/* RANGO */}
          <Section title="Rango del gráfico" color="#a78bfa">
            <InputField label="Q máximo" unit="m³/h"
              value={p.Q_max} onChange={set("Q_max")} min={10} max={1000} step={5} accent="#a78bfa"/>
          </Section>

          {/* VISIBILIDAD */}
          <Section title="Curvas visibles" color="#94a3b8">
            <Toggle label="Curva del sistema"              color={C.sistema}  checked={p.mostrar_sistema}  onChange={set("mostrar_sistema")}/>
            <Toggle label="Bomba simple (1 unidad)"        color={C.simple}   checked={p.mostrar_simple}   onChange={set("mostrar_simple")}/>
            <Toggle label={`${p.n_paralelo} Bomb. paralelo`} color={C.paralelo} checked={p.mostrar_paralelo} onChange={set("mostrar_paralelo")}/>
            <Toggle label={`${p.n_serie} Bomb. serie`}     color={C.serie}    checked={p.mostrar_serie}    onChange={set("mostrar_serie")}/>
          </Section>

          {/* PUNTOS DE TRABAJO */}
          <Section title="Puntos de trabajo" color="#94a3b8">
            {p.mostrar_simple && (
              <WPBadge label="Bomba simple (1 unidad)" point={ptSimple} color={C.simple}/>
            )}
            {p.mostrar_paralelo && (
              <WPBadge
                label={p.n_paralelo === 1 ? "1 Bomba (paralelo)" : `${p.n_paralelo} Bombas en paralelo`}
                point={ptPar}
                color={C.paralelo}
                extra={ptPar && p.n_paralelo > 1
                  ? `↳ cada bomba: ${(ptPar.Q / p.n_paralelo).toFixed(1)} m³/h · ${ptPar.H} m.c.a.`
                  : null}
              />
            )}
            {p.mostrar_serie && (
              <WPBadge
                label={`${p.n_serie} Bomba${p.n_serie>1?"s":""} en serie`}
                point={ptSer}
                color={C.serie}
                extra={ptSer && p.n_serie > 1
                  ? `↳ cada bomba: ${ptSer.Q} m³/h · ${(ptSer.H / p.n_serie).toFixed(1)} m.c.a.`
                  : null}
              />
            )}
          </Section>
        </div>

        {/* ── Área gráfico ── */}
        <div style={{flex:1, padding:"18px 18px 14px", minWidth:300, display:"flex", flexDirection:"column"}}>

          {/* Fórmulas resumen */}
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:16}}>
            {[
              {label:"Sistema",             f:`H = ${(p.H_g+p.P_res).toFixed(2)} + ${ks}·Q²`,    color:C.sistema},
              {label:"Bomba simple",        f:`H = ${p.H0} − ${kp}·Q²`,                          color:C.simple},
              {label:`×${p.n_paralelo} ∥`,  f: fPar,                                              color:C.paralelo},
              {label:`×${p.n_serie} serie`, f: fSer,                                              color:C.serie},
            ].map(({label,f,color})=>(
              <div key={label} style={{
                background:"rgba(255,255,255,0.022)", border:`1px solid ${color}28`,
                borderRadius:7, padding:"4px 10px", fontSize:10, fontFamily:"monospace",
              }}>
                <span style={{color,fontWeight:700}}>{label}: </span>
                <span style={{color:"#475569"}}>{f}</span>
              </div>
            ))}
          </div>

          {/* Gráfico */}
          <div style={{flex:1,minHeight:420}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{top:14,right:28,left:8,bottom:42}}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
                <XAxis dataKey="Q" type="number" domain={[0, p.Q_max]} tickCount={11}
                  stroke="#1e293b" tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}}>
                  <Label value="Caudal Q (m³/h)" offset={-12} position="insideBottom" fill="#475569" fontSize={11}/>
                </XAxis>
                <YAxis domain={[0, Hmax]} stroke="#1e293b"
                  tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}}>
                  <Label value="Altura H (m.c.a.)" angle={-90} position="insideLeft" offset={22} fill="#475569" fontSize={11}/>
                </YAxis>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:11,color:"#94a3b8",paddingTop:12,fontFamily:"monospace"}}/>

                {/* Línea de referencia Q diseño */}
                <ReferenceLine x={p.Q_dis} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4"
                  label={{value:`Q_dis=${p.Q_dis}`,position:"insideTopRight",fill:"#334155",fontSize:9,fontFamily:"monospace"}}/>

                {/* Curvas */}
                {p.mostrar_sistema  && <Line dataKey="Sistema"       stroke={C.sistema}  strokeWidth={2.5} dot={false} strokeDasharray="7 3" connectNulls/>}
                {showSimpleLine     && <Line dataKey="Bomba simple"  stroke={C.simple}   strokeWidth={2.5} dot={false} connectNulls/>}
                {p.mostrar_paralelo && p.n_paralelo > 1 &&
                  <Line dataKey={`${p.n_paralelo} Bombas paralelo`}  stroke={C.paralelo} strokeWidth={2.5} dot={false} connectNulls/>}
                {p.mostrar_serie    && p.n_serie > 1 &&
                  <Line dataKey={`${p.n_serie} Bombas serie`}        stroke={C.serie}    strokeWidth={2.5} dot={false} connectNulls/>}
                {/* Cuando n=1, la curva paralelo/serie coincide con bomba simple — se muestra como simple */}
                {p.mostrar_paralelo && p.n_paralelo === 1 && !p.mostrar_simple &&
                  <Line dataKey="Bomba simple" stroke={C.paralelo} strokeWidth={2.5} dot={false} connectNulls/>}
                {p.mostrar_serie && p.n_serie === 1 && !p.mostrar_simple && !p.mostrar_paralelo &&
                  <Line dataKey="Bomba simple" stroke={C.serie} strokeWidth={2.5} dot={false} connectNulls/>}

                {/* Punto diseño sistema */}
                {p.mostrar_sistema && (
                  <ReferenceDot x={p.Q_dis} y={H_check} r={5}
                    fill={C.sistema} stroke="#05090f" strokeWidth={2}
                    label={{value:"diseño",fill:C.sistema,fontSize:9,fontFamily:"monospace",position:"right"}}/>
                )}

                {/* Puntos de intersección */}
                {p.mostrar_simple && ptSimple && (
                  <ReferenceDot x={ptSimple.Q} y={ptSimple.H} r={7}
                    fill={C.simple} stroke="#05090f" strokeWidth={2}
                    label={{value:`(${ptSimple.Q}, ${ptSimple.H})`,fill:C.simple,fontSize:9,fontFamily:"monospace",position:"top"}}/>
                )}
                {p.mostrar_paralelo && ptPar && (
                  <ReferenceDot x={ptPar.Q} y={ptPar.H} r={7}
                    fill={C.paralelo} stroke="#05090f" strokeWidth={2}
                    label={{value:`(${ptPar.Q}, ${ptPar.H})`,fill:C.paralelo,fontSize:9,fontFamily:"monospace",position:"top"}}/>
                )}
                {p.mostrar_serie && ptSer && (
                  <ReferenceDot x={ptSer.Q} y={ptSer.H} r={7}
                    fill={C.serie} stroke="#05090f" strokeWidth={2}
                    label={{value:`(${ptSer.Q}, ${ptSer.H})`,fill:C.serie,fontSize:9,fontFamily:"monospace",position:"top"}}/>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Notas */}
          <div style={{
            marginTop:12, background:"rgba(255,255,255,0.016)",
            border:"1px solid rgba(255,255,255,0.05)", borderRadius:10, padding:"10px 15px",
            display:"flex", gap:14, flexWrap:"wrap",
          }}>
            {[
              {icon:"⊕", color:C.paralelo, text:`${p.n_paralelo} en paralelo: la curva se desplaza a la derecha (×${p.n_paralelo} caudal a igual altura).`},
              {icon:"↑",  color:C.serie,    text:`${p.n_serie} en serie: la curva se desplaza hacia arriba (×${p.n_serie} altura a igual caudal).`},
              {icon:"●",  color:C.sistema,  text:"El punto de trabajo real es siempre la intersección con la curva del sistema."},
            ].map(({icon,color,text})=>(
              <div key={text} style={{display:"flex",gap:8,alignItems:"flex-start",flex:"1 1 170px"}}>
                <span style={{color,fontSize:12,flexShrink:0,marginTop:1}}>{icon}</span>
                <span style={{fontSize:10,color:"#475569",lineHeight:1.5}}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
