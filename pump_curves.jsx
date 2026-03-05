import { useState, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceDot, ResponsiveContainer, Label, ReferenceLine,
} from "recharts";

const DEFAULT = {
  H_g:    6.00,
  P_res:  7.14,
  H_f:    7.43,
  Q_dis:  60,
  H0:     26,
  H_nom:  20,
  Q_nom:  30,
  Q_max:  120,
  mostrar_sistema:  true,
  mostrar_simple:   true,
  mostrar_paralelo: true,
  mostrar_serie:    true,
};

function calcK_sistema(H_f, Q_dis) {
  if (Q_dis <= 0) return 0;
  return H_f / (Q_dis * Q_dis);
}

function calcK_bomba(H0, H_nom, Q_nom) {
  if (Q_nom <= 0 || H0 <= H_nom) return 0.001;
  return (H0 - H_nom) / (Q_nom * Q_nom);
}

function calcSystemCurve(H_est, k, Q) {
  return H_est + k * Q * Q;
}

function calcPumpCurve(H0, k, Q) {
  const H = H0 - k * Q * Q;
  return H > 0 ? +H.toFixed(3) : null;
}

function intersectSimple(H_est, k_sys, H0, k_pump, Qmax) {
  const denom = k_sys + k_pump;
  if (denom <= 0) return null;
  const Q2 = (H0 - H_est) / denom;
  if (Q2 <= 0) return null;
  const Q = Math.sqrt(Q2);
  if (Q > Qmax) return null;
  return { Q: +Q.toFixed(2), H: +(H_est + k_sys * Q2).toFixed(2) };
}

function intersectParallel(H_est, k_sys, H0, k_pump, Qmax) {
  const denom = k_sys + k_pump / 4;
  if (denom <= 0) return null;
  const Q2 = (H0 - H_est) / denom;
  if (Q2 <= 0) return null;
  const Q = Math.sqrt(Q2);
  if (Q > Qmax) return null;
  return { Q: +Q.toFixed(2), H: +(H_est + k_sys * Q2).toFixed(2) };
}

function intersectSeries(H_est, k_sys, H0, k_pump, Qmax) {
  const denom = k_sys + 2 * k_pump;
  if (denom <= 0) return null;
  const Q2 = (2 * H0 - H_est) / denom;
  if (Q2 <= 0) return null;
  const Q = Math.sqrt(Q2);
  if (Q > Qmax) return null;
  return { Q: +Q.toFixed(2), H: +(H_est + k_sys * Q2).toFixed(2) };
}

const C = {
  sistema:  "#f59e0b",
  simple:   "#38bdf8",
  paralelo: "#34d399",
  serie:    "#f472b6",
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background:"rgba(6,9,18,0.97)",border:"1px solid rgba(255,255,255,0.1)",
      borderRadius:10,padding:"10px 16px",fontSize:12,
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
          width:"100%",boxSizing:"border-box",
          background: foc?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.03)",
          border:`1px solid ${foc ? accent+"88":"rgba(255,255,255,0.08)"}`,
          borderRadius:7,padding:"7px 10px",color:"#f1f5f9",
          fontSize:13,fontFamily:"monospace",outline:"none",transition:"all 0.18s",
        }}
      />
      {hint && <p style={{margin:"3px 0 0",fontSize:10,color:"#334155",fontStyle:"italic"}}>{hint}</p>}
    </div>
  );
}

function Toggle({ label, color, checked, onChange }) {
  return (
    <div onClick={()=>onChange(!checked)}
      style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:8,userSelect:"none"}}>
      <div style={{
        width:32,height:17,borderRadius:9,flexShrink:0,
        background:checked?color:"rgba(255,255,255,0.08)",
        position:"relative",transition:"background 0.2s",
        boxShadow:checked?`0 0 9px ${color}55`:"none",
      }}>
        <div style={{
          position:"absolute",top:2,left:checked?15:2,
          width:13,height:13,borderRadius:"50%",
          background:"#fff",transition:"left 0.2s",
        }}/>
      </div>
      <span style={{fontSize:11,color:checked?"#e2e8f0":"#475569",transition:"color 0.2s"}}>{label}</span>
    </div>
  );
}

function WPBadge({ label, point, color, extra }) {
  if (!point) return null;
  return (
    <div style={{
      background:"rgba(255,255,255,0.03)",
      border:`1px solid ${color}33`,borderLeft:`3px solid ${color}`,
      borderRadius:8,padding:"7px 11px",marginBottom:6,
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

function Section({ title, color, children }) {
  return (
    <div style={{marginBottom:20}}>
      <div style={{
        fontSize:9,color,textTransform:"uppercase",letterSpacing:"0.16em",
        fontFamily:"monospace",marginBottom:12,paddingBottom:5,
        borderBottom:`1px solid ${color}22`,
      }}>▸ {title}</div>
      {children}
    </div>
  );
}

function Pill({ label, value, color }) {
  return (
    <div style={{
      display:"flex",justifyContent:"space-between",alignItems:"center",
      background:`${color}0e`,border:`1px solid ${color}22`,
      borderRadius:6,padding:"4px 9px",marginBottom:5,
    }}>
      <span style={{fontSize:10,color:"#475569",fontFamily:"monospace"}}>{label}</span>
      <span style={{fontSize:12,color,fontFamily:"monospace",fontWeight:700}}>{value}</span>
    </div>
  );
}

export default function PumpCurves() {
  const [p, setP] = useState(DEFAULT);
  const set = useCallback((k)=>(v)=>setP(pr=>({...pr,[k]:v})),[]);

  const H_est   = p.H_g + p.P_res;
  const k_sys   = calcK_sistema(p.H_f, p.Q_dis);
  const k_pump  = calcK_bomba(p.H0, p.H_nom, p.Q_nom);
  const H_check = +(H_est + k_sys * p.Q_dis ** 2).toFixed(2);

  const { data, ptS, ptP, ptSer } = useMemo(() => {
    const steps = 100;
    const dQ = p.Q_max / steps;
    const rows = [];
    for (let i=0; i<=steps; i++) {
      const Q = +(i*dQ).toFixed(2);
      const row = { Q };
      if (p.mostrar_sistema)  row["Sistema"]           = +(calcSystemCurve(H_est,k_sys,Q)).toFixed(3);
      if (p.mostrar_simple)   row["Bomba simple"]      = calcPumpCurve(p.H0,k_pump,Q);
      if (p.mostrar_paralelo) row["2 Bombas paralelo"] = calcPumpCurve(p.H0,k_pump,Q/2);
      if (p.mostrar_serie) {
        const h = calcPumpCurve(p.H0,k_pump,Q);
        row["2 Bombas serie"] = h!=null ? +(h*2).toFixed(3) : null;
      }
      rows.push(row);
    }
    return {
      data: rows,
      ptS:   intersectSimple  (H_est,k_sys,p.H0,k_pump,p.Q_max),
      ptP:   intersectParallel(H_est,k_sys,p.H0,k_pump,p.Q_max),
      ptSer: intersectSeries  (H_est,k_sys,p.H0,k_pump,p.Q_max),
    };
  }, [p, H_est, k_sys, k_pump]);

  const Hmax = useMemo(()=>{
    const top = Math.max(H_est + k_sys*p.Q_max**2, p.H0*2);
    return Math.min(Math.ceil(top*1.15/5)*5, 300);
  },[H_est,k_sys,p.H0,p.Q_max]);

  const ks = k_sys.toFixed(4);
  const kp = k_pump.toFixed(4);

  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(160deg,#05090f 0%,#0b1120 60%,#05090f 100%)",
      color:"#e2e8f0",fontFamily:"'DM Sans',system-ui,sans-serif",
      display:"flex",flexDirection:"column",
    }}>

      {/* Header */}
      <div style={{
        padding:"16px 26px",borderBottom:"1px solid rgba(255,255,255,0.05)",
        background:"rgba(255,255,255,0.016)",display:"flex",alignItems:"center",gap:13,
      }}>
        <div style={{
          width:36,height:36,borderRadius:9,flexShrink:0,
          background:"linear-gradient(135deg,#0ea5e9,#6366f1)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,
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

        {/* Panel */}
        <div style={{
          width:268,flexShrink:0,padding:"16px 16px",
          borderRight:"1px solid rgba(255,255,255,0.05)",
          background:"rgba(255,255,255,0.01)",overflowY:"auto",
        }}>

          <Section title="Curva del sistema" color={C.sistema}>
            <InputField label="Altura geométrica H_g" unit="m.c.a."
              value={p.H_g} onChange={set("H_g")} min={0} max={50} step={0.1}
              accent={C.sistema} hint="Diferencia de cotas aspiración → entrega" />
            <InputField label="Presión residual P_res" unit="m.c.a."
              value={p.P_res} onChange={set("P_res")} min={0} max={50} step={0.1}
              accent={C.sistema} hint="Presión mínima requerida en punto de entrega" />
            <InputField label="Pérdidas dinámicas H_f" unit="m.c.a."
              value={p.H_f} onChange={set("H_f")} min={0} max={100} step={0.1}
              accent={C.sistema} hint="Fricción + singulares + filtro, a Q_diseño" />
            <InputField label="Caudal de diseño Q_dis" unit="m³/h"
              value={p.Q_dis} onChange={set("Q_dis")} min={1} max={500} step={1}
              accent={C.sistema} hint="Caudal al que se calcularon las pérdidas H_f" />
            <div style={{marginTop:8}}>
              <Pill label="H estática = H_g + P_res" value={`${(p.H_g+p.P_res).toFixed(2)} m.c.a.`} color={C.sistema}/>
              <Pill label="k = H_f / Q_dis²"         value={ks}                                       color={C.sistema}/>
              <Pill label="H_total en Q_dis"          value={`${H_check} m.c.a.`}                     color={C.sistema}/>
            </div>
            <p style={{fontSize:9,color:"#334155",fontFamily:"monospace",margin:"5px 0 0",lineHeight:1.5}}>
              H_sis = {(p.H_g+p.P_res).toFixed(2)} + {ks}·Q²
            </p>
          </Section>

          <Section title="Bomba unitaria" color={C.simple}>
            <InputField label="H₀ — altura en Q = 0" unit="m.c.a."
              value={p.H0} onChange={set("H0")} min={1} max={200} step={0.5}
              accent={C.simple} hint="Punto de cierre (shut-off head)" />
            <InputField label="H — altura en punto nominal" unit="m.c.a."
              value={p.H_nom} onChange={set("H_nom")} min={0} max={200} step={0.5}
              accent={C.simple} hint="Altura del punto de catálogo o BEP" />
            <InputField label="Q — caudal nominal" unit="m³/h"
              value={p.Q_nom} onChange={set("Q_nom")} min={1} max={500} step={1}
              accent={C.simple} hint="Caudal correspondiente a H nominal" />
            <div style={{marginTop:8}}>
              <Pill label="k = (H₀ − H) / Q²" value={kp} color={C.simple}/>
            </div>
            <p style={{fontSize:9,color:"#334155",fontFamily:"monospace",margin:"5px 0 0",lineHeight:1.5}}>
              H_bom = {p.H0} − {kp}·Q²
            </p>
          </Section>

          <Section title="Rango del gráfico" color="#a78bfa">
            <InputField label="Q máximo" unit="m³/h"
              value={p.Q_max} onChange={set("Q_max")} min={10} max={1000} step={5} accent="#a78bfa"/>
          </Section>

          <Section title="Curvas visibles" color="#94a3b8">
            <Toggle label="Curva del sistema"    color={C.sistema}  checked={p.mostrar_sistema}  onChange={set("mostrar_sistema")}/>
            <Toggle label="Bomba simple"         color={C.simple}   checked={p.mostrar_simple}   onChange={set("mostrar_simple")}/>
            <Toggle label="2 Bombas en paralelo" color={C.paralelo} checked={p.mostrar_paralelo} onChange={set("mostrar_paralelo")}/>
            <Toggle label="2 Bombas en serie"    color={C.serie}    checked={p.mostrar_serie}    onChange={set("mostrar_serie")}/>
          </Section>

          <Section title="Puntos de trabajo" color="#94a3b8">
            {p.mostrar_simple   && <WPBadge label="Bomba simple"              point={ptS}   color={C.simple}/>}
            {p.mostrar_paralelo && <WPBadge label="2 en paralelo — total"     point={ptP}   color={C.paralelo}
              extra={ptP ? `↳ cada bomba: ${(ptP.Q/2).toFixed(1)} m³/h` : null}/>}
            {p.mostrar_serie    && <WPBadge label="2 en serie"                point={ptSer} color={C.serie}/>}
          </Section>
        </div>

        {/* Gráfico */}
        <div style={{flex:1,padding:"18px 18px 14px",minWidth:300,display:"flex",flexDirection:"column"}}>

          {/* Fórmulas resumen */}
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:16}}>
            {[
              {label:"Sistema",  f:`H = ${(p.H_g+p.P_res).toFixed(2)} + ${ks}·Q²`,      color:C.sistema},
              {label:"Bomba",    f:`H = ${p.H0} − ${kp}·Q²`,                            color:C.simple},
              {label:"Paralelo", f:`H = ${p.H0} − ${kp}·(Q/2)²`,                        color:C.paralelo},
              {label:"Serie",    f:`H = 2·(${p.H0} − ${kp}·Q²)`,                        color:C.serie},
            ].map(({label,f,color})=>(
              <div key={label} style={{
                background:"rgba(255,255,255,0.022)",border:`1px solid ${color}28`,
                borderRadius:7,padding:"4px 10px",fontSize:10,fontFamily:"monospace",
              }}>
                <span style={{color,fontWeight:700}}>{label}: </span>
                <span style={{color:"#475569"}}>{f}</span>
              </div>
            ))}
          </div>

          <div style={{flex:1,minHeight:420}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{top:14,right:28,left:8,bottom:42}}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
                <XAxis dataKey="Q" type="number" domain={[0,p.Q_max]} tickCount={11}
                  stroke="#1e293b" tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}}>
                  <Label value="Caudal Q (m³/h)" offset={-12} position="insideBottom" fill="#475569" fontSize={11}/>
                </XAxis>
                <YAxis domain={[0,Hmax]} stroke="#1e293b"
                  tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}}>
                  <Label value="Altura H (m.c.a.)" angle={-90} position="insideLeft" offset={22} fill="#475569" fontSize={11}/>
                </YAxis>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:11,color:"#94a3b8",paddingTop:12,fontFamily:"monospace"}}/>

                <ReferenceLine x={p.Q_dis} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4"
                  label={{value:`Q_dis=${p.Q_dis}`,position:"insideTopRight",fill:"#334155",fontSize:9,fontFamily:"monospace"}}/>

                {p.mostrar_sistema  && <Line dataKey="Sistema"           stroke={C.sistema}  strokeWidth={2.5} dot={false} strokeDasharray="7 3" connectNulls/>}
                {p.mostrar_simple   && <Line dataKey="Bomba simple"      stroke={C.simple}   strokeWidth={2.5} dot={false} connectNulls/>}
                {p.mostrar_paralelo && <Line dataKey="2 Bombas paralelo" stroke={C.paralelo} strokeWidth={2.5} dot={false} connectNulls/>}
                {p.mostrar_serie    && <Line dataKey="2 Bombas serie"    stroke={C.serie}    strokeWidth={2.5} dot={false} connectNulls/>}

                {p.mostrar_simple   && ptS   && <ReferenceDot x={ptS.Q}   y={ptS.H}   r={7} fill={C.simple}   stroke="#05090f" strokeWidth={2} label={{value:`(${ptS.Q}, ${ptS.H})`,   fill:C.simple,   fontSize:9,fontFamily:"monospace",position:"top"}}/>}
                {p.mostrar_paralelo && ptP   && <ReferenceDot x={ptP.Q}   y={ptP.H}   r={7} fill={C.paralelo} stroke="#05090f" strokeWidth={2} label={{value:`(${ptP.Q}, ${ptP.H})`,   fill:C.paralelo, fontSize:9,fontFamily:"monospace",position:"top"}}/>}
                {p.mostrar_serie    && ptSer && <ReferenceDot x={ptSer.Q} y={ptSer.H} r={7} fill={C.serie}    stroke="#05090f" strokeWidth={2} label={{value:`(${ptSer.Q}, ${ptSer.H})`,fill:C.serie,    fontSize:9,fontFamily:"monospace",position:"top"}}/>}
                {p.mostrar_sistema  && <ReferenceDot x={p.Q_dis} y={H_check} r={5} fill={C.sistema} stroke="#05090f" strokeWidth={2} label={{value:"diseño",fill:C.sistema,fontSize:9,fontFamily:"monospace",position:"right"}}/>}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Notas */}
          <div style={{
            marginTop:12,background:"rgba(255,255,255,0.016)",
            border:"1px solid rgba(255,255,255,0.05)",borderRadius:10,padding:"10px 15px",
            display:"flex",gap:14,flexWrap:"wrap",
          }}>
            {[
              {icon:"⊕",color:C.paralelo,text:"Paralelo: curva desplazada a la derecha. Doble caudal a igual altura."},
              {icon:"↑", color:C.serie,   text:"Serie: curva desplazada hacia arriba. Doble altura a igual caudal."},
              {icon:"●", color:C.sistema, text:"El punto de trabajo es la intersección bomba ∩ sistema."},
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
