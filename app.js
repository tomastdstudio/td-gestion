// ── Supabase ──────────────────────────────────────────────────────────────────
const SB = window.supabase.createClient(
  "https://vahjkwqkellkxyzrretb.supabase.co",
  "sb_publishable_GbioLgtlhXJvgS_ZzWYXXw_h1tkGXCh"
);

// ── Colores ───────────────────────────────────────────────────────────────────
const G="#8DC63F",D="#111827",CA="#1a2232",CB="#1F2937",BR="#2d3748",GR="#9CA3AF",W="#F8FAFC",RE="#ef4444",YE="#f59e0b",WA="#25D366";

// ── Helpers ───────────────────────────────────────────────────────────────────
const money = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:0}).format(n);
const fdate = d => new Date(d).toLocaleDateString("es-AR");
const share = async t => {
  if(navigator.share) try{await navigator.share({text:t});return;}catch(e){}
  try{await navigator.clipboard.writeText(t);alert("¡Copiado!");}catch(e){}
};
const waOpen = (phone,txt) => {
  const n=(phone||"").replace(/\D/g,"");
  if(!n){share(txt);return;}
  const f=n.startsWith("549")?n:"549"+n;
  window.open("https://wa.me/"+f+"?text="+encodeURIComponent(txt),"_blank");
};

// ID temporal para ítems del carrito (no van a Supabase directamente)
let _id=1000;
const uid = () => ++_id;

// ── Estilos inline reutilizables ──────────────────────────────────────────────
const inp = {width:"100%",background:D,border:"1px solid "+BR,borderRadius:8,padding:"10px 12px",color:W,fontSize:13,boxSizing:"border-box",outline:"none",fontFamily:"Montserrat,sans-serif"};
const Btn = (bg,col,extra={}) => ({background:bg,color:col,border:"1px solid "+(bg==="transparent"?BR:bg),borderRadius:8,padding:"10px 18px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"Montserrat,sans-serif",...extra});

// ── Auth ──────────────────────────────────────────────────────────────────────
const _passCache = {};
const loadPasswords = async () => {
  const {data} = await SB.from("config").select("clave,valor").in("clave",["pass_admin","pass_vend"]);
  (data||[]).forEach(r=>{ _passCache[r.clave]=r.valor; });
};
const getPass = r => _passCache[r==="admin"?"pass_admin":"pass_vend"] || (r==="admin"?"admin2024":"venta2024");
const setPass = async (r,v) => {
  const clave = r==="admin"?"pass_admin":"pass_vend";
  await SB.from("config").update({valor:v}).eq("clave",clave);
  _passCache[clave]=v;
};
const checkLogin = (u,p) => {
  if(u==="admin"   && p===getPass("admin")) return {role:"admin",nombre:"Administrador"};
  if(u==="vendedor"&& p===getPass("vend"))  return {role:"vend", nombre:"Vendedor"};
  return null;
};
const getSess  = () => { try{const s=localStorage.getItem("td_sess");return s?JSON.parse(s):null;}catch(e){return null;} };
const setSess  = s => localStorage.setItem("td_sess", JSON.stringify(s));
const clearSess= () => localStorage.removeItem("td_sess");

// ── Mappers snake_case ↔ camelCase ────────────────────────────────────────────
const fromProd  = p => ({...p, stockMin: p.stock_min});
const toProd    = p => ({nombre:p.nombre,categoria:p.categoria,costo:p.costo,precio:p.precio,stock:p.stock,stock_min:p.stockMin||p.stock_min||10,unidad:p.unidad});
const fromVenta = v => ({...v,clienteId:v.cliente_id,clienteNombre:v.cliente_nombre,clienteDireccion:v.cliente_direccion,clienteTelefono:v.cliente_telefono,clienteCuit:v.cliente_cuit,esLibre:v.es_libre,esMixto:v.es_mixto});
const toVenta   = v => ({nro:v.nro,fecha:v.fecha,cliente_id:v.clienteId||null,cliente_nombre:v.clienteNombre,cliente_direccion:v.clienteDireccion||"",cliente_telefono:v.clienteTelefono||"",cliente_cuit:v.clienteCuit||"",items:v.items,subtotal:v.subtotal,descuento:v.descuento,total:v.total,nota:v.nota||"",estado:v.estado,es_libre:v.esLibre||false,es_mixto:v.esMixto||false});

// ── CRUD Supabase ─────────────────────────────────────────────────────────────
const db = {
  async loadAll() {
    const [pr,cl,vn,pv] = await Promise.all([
      SB.from("productos").select("*").order("id"),
      SB.from("clientes").select("*").order("id"),
      SB.from("ventas").select("*").order("fecha",{ascending:false}),
      SB.from("proveedores").select("*").order("id"),
    ]);
    return {
      productos:  (pr.data||[]).map(fromProd),
      clientes:   cl.data||[],
      ventas:     (vn.data||[]).map(fromVenta),
      proveedores:pv.data||[],
    };
  },

  async seedIfEmpty(data) {
    if(data.productos.length > 0) return data;
    await SB.from("productos").insert(PRODS_DEF.map(p=>({nombre:p.nombre,categoria:p.categoria,costo:p.costo,precio:p.precio,stock:p.stock,stock_min:p.stockMin,unidad:p.unidad})));
    await SB.from("clientes").insert(CLIS_DEF);
    await SB.from("proveedores").insert(PROVS_DEF);
    return db.loadAll();
  },

  async saveProd(d, prev, setProd) {
    if(d.id) {
      await SB.from("productos").update(toProd(d)).eq("id",d.id);
      setProd(prev=>prev.map(p=>p.id===d.id?{...d}:p));
    } else {
      const {data} = await SB.from("productos").insert(toProd(d)).select().single();
      if(data) setProd(prev=>[...prev,fromProd(data)]);
    }
  },

  async delProd(id, setProd) {
    await SB.from("productos").delete().eq("id",id);
    setProd(prev=>prev.filter(p=>p.id!==id));
  },

  async saveCli(d, setCli) {
    const row = {nombre:d.nombre,direccion:d.direccion,telefono:d.telefono,cuit:d.cuit,zona:d.zona};
    if(d.id) {
      await SB.from("clientes").update(row).eq("id",d.id);
      setCli(prev=>prev.map(c=>c.id===d.id?d:c));
    } else {
      const {data} = await SB.from("clientes").insert(row).select().single();
      if(data) setCli(prev=>[...prev,data]);
    }
  },

  async delCli(id, setCli) {
    await SB.from("clientes").delete().eq("id",id);
    setCli(prev=>prev.filter(c=>c.id!==id));
  },

  async saveVenta(v) {
    const {data} = await SB.from("ventas").insert(toVenta(v)).select().single();
    return data ? fromVenta(data) : null;
  },

  async updateVentaEstado(id, estado, setVentas) {
    await SB.from("ventas").update({estado}).eq("id",id);
    setVentas(prev=>prev.map(v=>v.id===id?{...v,estado}:v));
  },

  async updateStock(items, productos, setProductos) {
    const updates = items.filter(i=>i.tipo==="catalogo").map(i=>{
      const p = productos.find(x=>x.id===i.productoId);
      if(!p) return null;
      const ns = p.stock - i.cantidad;
      return SB.from("productos").update({stock:ns}).eq("id",p.id);
    }).filter(Boolean);
    await Promise.all(updates);
    setProductos(prev=>prev.map(p=>{
      const it=items.find(i=>i.productoId===p.id&&i.tipo==="catalogo");
      return it?{...p,stock:p.stock-it.cantidad}:p;
    }));
  },

  async saveProv(d, setProv) {
    const row={nombre:d.nombre,telefono:d.telefono,direccion:d.direccion,email:d.email};
    if(d.id) {
      await SB.from("proveedores").update(row).eq("id",d.id);
      setProv(prev=>prev.map(p=>p.id===d.id?d:p));
    } else {
      const {data} = await SB.from("proveedores").insert(row).select().single();
      if(data) setProv(prev=>[...prev,data]);
    }
  },

  async delProv(id, setProv) {
    await SB.from("proveedores").delete().eq("id",id);
    setProv(prev=>prev.filter(p=>p.id!==id));
  },
};

// ── Constantes de datos ───────────────────────────────────────────────────────
const CATS=["Bolsas de Residuos","Rollos de Residuos","Rollos Fondo Estrella","Bobinas","Camisetas y Arranque","Film Stretch","Papelería","Otro"];

const PROVS_DEF=[
  {nombre:"Antártida",telefono:"",direccion:"",email:""},
  {nombre:"Dottiplast",telefono:"",direccion:"",email:""},
  {nombre:"Flowi",telefono:"",direccion:"",email:""},
];

const CLIS_DEF=[
  {nombre:"Supermercado El Sol",direccion:"Av. Rivadavia 1234, CABA",telefono:"1145678901",cuit:"30-12345678-9",zona:"CABA Norte"},
  {nombre:"Consorcio Torres del Norte",direccion:"Av. Corrientes 5678, CABA",telefono:"1156789012",cuit:"30-87654321-0",zona:"CABA Centro"},
];

const PRODS_DEF=[
  {nombre:"45x60x10 Negras — Bulto x100 paq",categoria:"Bolsas de Residuos",costo:30261,precio:48181,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"45x60x10 Patogenas — Bulto x100 paq",categoria:"Bolsas de Residuos",costo:0,precio:61133,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"45x60x30 Negras — Bulto x50 paq",categoria:"Bolsas de Residuos",costo:34615,precio:55113,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"45x70x10 Albañilería — Bulto x30 paq",categoria:"Bolsas de Residuos",costo:0,precio:52834,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"50x70x10 Negras — Bulto x100 paq",categoria:"Bolsas de Residuos",costo:34877,precio:55530,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"50x70x30 Negras — Bulto x40 paq",categoria:"Bolsas de Residuos",costo:35293,precio:56192,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"60x90x10 Negras — Bulto x50 paq",categoria:"Bolsas de Residuos",costo:28057,precio:44671,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"60x100x10 Negras — Bulto x50 paq",categoria:"Bolsas de Residuos",costo:31718,precio:50499,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"70x100x10 Negras — Bulto x40 paq",categoria:"Bolsas de Residuos",costo:30039,precio:47827,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"80x110x10 Negras — Bulto x30 paq",categoria:"Bolsas de Residuos",costo:34990,precio:55708,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"90x110x10 Negras — Bulto x20 paq",categoria:"Bolsas de Residuos",costo:25370,precio:40392,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"45x60x10 Verdes — Bulto x100 paq",categoria:"Bolsas de Residuos",costo:36179,precio:57603,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"45x60x30 Verdes — Bulto x50 paq",categoria:"Bolsas de Residuos",costo:0,precio:70326,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"50x70x10 Verdes — Bulto x100 paq",categoria:"Bolsas de Residuos",costo:44171,precio:68611,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"50x70x30 Verdes — Bulto x40 paq",categoria:"Bolsas de Residuos",costo:0,precio:70826,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"60x90x10 Verdes — Bulto x50 paq",categoria:"Bolsas de Residuos",costo:27960,precio:33831,stock:0,stockMin:10,unidad:"bulto"},
  {nombre:"80x110x10 Verdes — Bulto x30 paq",categoria:"Bolsas de Residuos",costo:38800,precio:61775,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"Dottiplast 45x60x20 — 24 rollos/bulto",categoria:"Rollos de Residuos",costo:9453,precio:15051,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"Dottiplast 50x70x20 — 24 rollos/bulto",categoria:"Rollos de Residuos",costo:11923,precio:18982,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"Dottiplast 60x90x10 — 24 rollos/bulto",categoria:"Rollos de Residuos",costo:10689,precio:17019,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"Dottiplast 80x110x10 — 24 rollos/bulto",categoria:"Rollos de Residuos",costo:20332,precio:32371,stock:999,stockMin:20,unidad:"bulto"},
  {nombre:"Flowi 45x60x20 — Bulto 24 uni",categoria:"Rollos de Residuos",costo:0,precio:19933,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Flowi 45x60x30 — Bulto 40 uni",categoria:"Rollos de Residuos",costo:0,precio:42700,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Flowi 50x70x20 — Bulto 24 uni",categoria:"Rollos de Residuos",costo:0,precio:26039,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Flowi 50x70x30 — Bulto 30 uni",categoria:"Rollos de Residuos",costo:0,precio:43045,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Flowi 60x90x10 — Bulto 24 uni",categoria:"Rollos de Residuos",costo:14016,precio:23208,stock:58,stockMin:15,unidad:"bulto"},
  {nombre:"Flowi 60x90x10 — Bulto 50 uni",categoria:"Rollos de Residuos",costo:25996,precio:43045,stock:8,stockMin:5,unidad:"bulto"},
  {nombre:"Flowi 60x90x10 — Etiq. Chica 24 uni",categoria:"Rollos de Residuos",costo:8500,precio:10285,stock:28,stockMin:10,unidad:"bulto"},
  {nombre:"Flowi 80x110x10 — Bulto 30 uni",categoria:"Rollos de Residuos",costo:32916,precio:54503,stock:43,stockMin:10,unidad:"bulto"},
  {nombre:"45x60 Negro x20 — Fondo Estrella",categoria:"Rollos Fondo Estrella",costo:0,precio:500,stock:999,stockMin:500,unidad:"rollo"},
  {nombre:"45x60 Verde x20 — Fondo Estrella",categoria:"Rollos Fondo Estrella",costo:0,precio:573,stock:999,stockMin:500,unidad:"rollo"},
  {nombre:"50x70 Negro x20 — Fondo Estrella",categoria:"Rollos Fondo Estrella",costo:0,precio:633,stock:999,stockMin:500,unidad:"rollo"},
  {nombre:"50x70 Verde x20 — Fondo Estrella",categoria:"Rollos Fondo Estrella",costo:0,precio:729,stock:999,stockMin:500,unidad:"rollo"},
  {nombre:"60x90 Negro x10 — Fondo Estrella",categoria:"Rollos Fondo Estrella",costo:0,precio:573,stock:999,stockMin:500,unidad:"rollo"},
  {nombre:"60x90 Verde x10 — Fondo Estrella",categoria:"Rollos Fondo Estrella",costo:0,precio:666,stock:999,stockMin:500,unidad:"rollo"},
  {nombre:"80x110 Negro x10 — Fondo Estrella",categoria:"Rollos Fondo Estrella",costo:0,precio:1076,stock:999,stockMin:500,unidad:"rollo"},
  {nombre:"80x110 Verde x10 — Fondo Estrella",categoria:"Rollos Fondo Estrella",costo:0,precio:1248,stock:999,stockMin:500,unidad:"rollo"},
  {nombre:"90x120 Negro x10 — Fondo Estrella",categoria:"Rollos Fondo Estrella",costo:0,precio:1401,stock:999,stockMin:500,unidad:"rollo"},
  {nombre:"Bobina 15-25 Mic. Silo Negro",categoria:"Bobinas",costo:0,precio:2765,stock:999,stockMin:200,unidad:"kg"},
  {nombre:"Bobina 25+ Mic. Silo Negro",categoria:"Bobinas",costo:0,precio:2749,stock:999,stockMin:200,unidad:"kg"},
  {nombre:"Bobina +20 Mic. Mezcla Negro",categoria:"Bobinas",costo:0,precio:2560,stock:999,stockMin:200,unidad:"kg"},
  {nombre:"Bobina +25 Mic. Color",categoria:"Bobinas",costo:0,precio:3440,stock:999,stockMin:200,unidad:"kg"},
  {nombre:"Bobina +25 Mic. Caramelo",categoria:"Bobinas",costo:0,precio:2771,stock:999,stockMin:200,unidad:"kg"},
  {nombre:"Bobina +25 Mic. Cristal",categoria:"Bobinas",costo:0,precio:4104,stock:999,stockMin:200,unidad:"kg"},
  {nombre:"Camisetas Negras 40x50x70 — Bulto x20",categoria:"Camisetas y Arranque",costo:0,precio:26536,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Camisetas Sale Mix 40x50 — Bulto x20",categoria:"Camisetas y Arranque",costo:0,precio:43203,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Camisetas Sale Mix 45x60 — Bulto x20",categoria:"Camisetas y Arranque",costo:0,precio:63626,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Camisetas Class 40x50 — Bulto x20",categoria:"Camisetas y Arranque",costo:0,precio:50411,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Camisetas Standard 40x50 — Bulto x20",categoria:"Camisetas y Arranque",costo:0,precio:44318,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Arranque 30x40 — 6 rollos/bulto",categoria:"Camisetas y Arranque",costo:0,precio:47242,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Arranque 35x45 — 9 rollos/bulto",categoria:"Camisetas y Arranque",costo:0,precio:54789,stock:999,stockMin:10,unidad:"bulto"},
  {nombre:"Stretch Recuperado 50cm Natural",categoria:"Film Stretch",costo:2783,precio:4431,stock:999,stockMin:10,unidad:"kg"},
  {nombre:"Stretch Virgen 50cm Cristal",categoria:"Film Stretch",costo:3692,precio:5878,stock:999,stockMin:10,unidad:"kg"},
];
