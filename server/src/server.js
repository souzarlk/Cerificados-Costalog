import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import agentRoutes from "./routes/agent.js";
import { query, pool } from "./db.js";
import { errorHandler } from "./middleware.js";

const app=express();
app.disable("x-powered-by");
app.set("trust proxy",process.env.TRUST_PROXY==="true"?1:false);
app.use((req,res,next)=>{req.id=crypto.randomUUID();res.set("X-Request-Id",req.id);next()});
app.use(helmet({crossOriginResourcePolicy:{policy:"cross-origin"}}));

const allowedOrigins=String(process.env.ALLOWED_ORIGINS||"").split(",").map(v=>v.trim()).filter(Boolean);
app.use(cors({
  origin(origin,callback){
    if(!origin||allowedOrigins.includes(origin))return callback(null,true);
    return callback(new Error("Origem não autorizada pelo CORS."));
  },
  methods:["GET","POST","DELETE","OPTIONS"],
  allowedHeaders:["Authorization","Content-Type","X-Request-Id"],
  credentials:false,
  maxAge:600
}));
app.use(express.json({limit:"64kb",strict:true}));
app.use((req,res,next)=>{res.set("Cache-Control","no-store");next()});

const globalLimiter=rateLimit({windowMs:60*1000,limit:120,standardHeaders:"draft-7",legacyHeaders:false});
app.use("/api/",globalLimiter);
app.get("/api/v1/health",async(req,res,next)=>{
  try{await query("SELECT 1");res.json({status:"ok",service:"agente-costalog-api",time:new Date().toISOString()});}
  catch(e){next(e)}
});
app.use("/api/v1/auth",authRoutes);
app.use("/api/v1/admin/agent",adminRoutes);
app.use("/api/v1/agent",agentRoutes);
app.use((req,res)=>res.status(404).json({error:"not_found",message:"Rota não encontrada.",requestId:req.id}));
app.use(errorHandler);

const port=Number(process.env.PORT||8080);
const host=process.env.HOST||"127.0.0.1";
const server=app.listen(port,host,async()=>{
  try{
    await query("SELECT 1");
    console.log("AGENTE COSTALOG API iniciado em "+host+":"+port);
  }catch(error){
    console.error("Banco indisponível na inicialização:",error.message);
    server.close(()=>process.exit(1));
  }
});
async function shutdown(signal){
  console.log("Encerrando API:",signal);
  server.close(async()=>{await pool.end();process.exit(0)});
  setTimeout(()=>process.exit(1),10000).unref();
}
process.on("SIGTERM",()=>shutdown("SIGTERM"));
process.on("SIGINT",()=>shutdown("SIGINT"));
