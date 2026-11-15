const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const crypto = require("crypto");
initializeApp();
const REGION="asia-southeast1", db=getDatabase();
const PRICES={adult:50,child:30,senior:35,vip:120};
const ROLES=["admin","counter","gate","supervisor","finance"];
function employeeId(v){const s=String(v||"").trim().toUpperCase();if(!/^[A-Z0-9_-]{3,24}$/.test(s))throw new HttpsError("invalid-argument","員工編號格式不正確。");return s;}
function emailFor(id){return `staff-${id.toLowerCase()}@staff.smartthemepark.invalid`;}
function staff(ctx,allowed=ROLES){if(!ctx.auth)throw new HttpsError("unauthenticated","請先登入。");const c=ctx.auth.token;if(c.staff!==true||!allowed.includes(c.role))throw new HttpsError("permission-denied","沒有此操作權限。");return c;}
function hash(s){return crypto.createHash("sha256").update(s).digest("hex");}
function token(){return crypto.randomBytes(32).toString("base64url");}
function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(String(d||""));}
async function log(uid,action,details={}){await db.ref("auditLogs").push({uid,action,details,at:Date.now()});}

exports.createStaff=onCall({region:REGION},async req=>{
 const c=staff(req,["admin"]);const id=employeeId(req.data.employeeId),password=String(req.data.password||""),role=String(req.data.role||"counter");
 if(password.length<12)throw new HttpsError("invalid-argument","員工密碼至少 12 個字元。");
 if(!ROLES.includes(role))throw new HttpsError("invalid-argument","職位無效。");
 let u;try{u=await getAuth().createUser({email:emailFor(id),password,displayName:String(req.data.displayName||id).slice(0,80)});}catch(e){if(e.code==="auth/email-already-exists")throw new HttpsError("already-exists","員工編號已存在。");throw e;}
 await getAuth().setCustomUserClaims(u.uid,{staff:true,role,employeeId:id});
 await db.ref(`staff/${u.uid}`).set({employeeId:id,displayName:u.displayName,role,active:true,createdAt:Date.now()});
 await log(req.auth.uid,"staff.created",{employeeId:id,role});return {ok:true,employeeId:id};
});

exports.disableStaff=onCall({region:REGION},async req=>{
 staff(req,["admin"]);const uid=String(req.data.uid||"");if(!uid)throw new HttpsError("invalid-argument","缺少 UID。");
 await getAuth().updateUser(uid,{disabled:true});await db.ref(`staff/${uid}/active`).set(false);await log(req.auth.uid,"staff.disabled",{uid});return {ok:true};
});

// Online purchase placeholder: creates a pending order only. No payment and no valid QR ticket.
exports.createOnlinePendingOrder=onCall({region:REGION},async req=>{
 const type=String(req.data.ticketType||""),qty=Number(req.data.quantity),date=String(req.data.visitDate||"");
 if(!Object.hasOwn(PRICES,type)||!Number.isInteger(qty)||qty<1||qty>10||!validDate(date))throw new HttpsError("invalid-argument","購票資料無效。");
 const ref=db.ref("orders").push();const total=PRICES[type]*qty;
 await ref.set({orderId:ref.key,channel:"mobile",ticketType:type,quantity:qty,visitDate:date,total,currency:"SGD",paymentStatus:"not_configured",status:"pending_payment",email:String(req.data.email||"").slice(0,160),createdAt:Date.now(),ticketIds:[]});
 return {ok:true,orderId:ref.key,total,currency:"SGD",status:"pending_payment",ticketIssued:false};
});

// Cash + biometric enrollment must be implemented against a selected, audited face SDK.
// This callable deliberately fails closed until a server-side provider adapter is configured.
exports.issueCounterFaceTickets=onCall({region:REGION},async req=>{
 const c=staff(req,["admin","counter"]);
 if(process.env.FACE_PROVIDER_ENABLED!=="true")throw new HttpsError("failed-precondition","正式人臉辨識服務尚未設定，系統不會建立未經核驗的人臉門票。");
 // TODO: Verify provider-signed enrollment reference server-to-server here.
 // Never accept a client boolean such as faceVerified=true as proof.
 throw new HttpsError("unimplemented","請先完成並測試人臉供應商伺服器端整合。");
});

exports.redeemQrTicket=onCall({region:REGION},async req=>{
 staff(req,["admin","gate"]);const raw=String(req.data.token||"");
 if(raw.length<30||raw.length>100)throw new HttpsError("invalid-argument","QR Code 無效。");
 const snap=await db.ref("tickets").orderByChild("tokenHash").equalTo(hash(raw)).limitToFirst(1).get();
 if(!snap.exists())throw new HttpsError("not-found","找不到有效 QR 門票。");
 const [id,ticket]=Object.entries(snap.val())[0];
 if(ticket.entryMethod!=="qr")throw new HttpsError("failed-precondition","此門票不是 QR 入園票。");
 const ref=db.ref(`tickets/${id}`);const result=await ref.transaction(cur=>{if(!cur||cur.status!=="valid"||cur.paymentStatus!=="paid")return;cur.status="used";cur.usedAt=Date.now();cur.usedBy=req.auth.uid;return cur;});
 if(!result.committed)throw new HttpsError("failed-precondition","門票已使用或無效。");
 await db.ref("checkins").push({ticketId:id,method:"qr",gate:String(req.data.gate||"GATE-01"),employeeUid:req.auth.uid,at:Date.now()});
 await log(req.auth.uid,"ticket.qr_redeemed",{ticketId:id});return {ok:true,ticketId:id};
});

// Face redemption requires verified provider liveness + match result, validated server-to-server.
// Not exposed as a client-trustable callable in this starter.
exports.bootstrapAdmin=onRequest({region:REGION,secrets:["BOOTSTRAP_SECRET"]},async(req,res)=>{
 if(req.method!=="POST")return res.status(405).send("Method not allowed");
 if(process.env.BOOTSTRAP_ENABLED!=="true")return res.status(403).send("Bootstrap disabled");
 const supplied=req.get("x-bootstrap-secret")||(req.body&&req.body.secret);
 if(!supplied||supplied!==process.env.BOOTSTRAP_SECRET.value())return res.status(403).send("Forbidden");
 try{const id=employeeId(req.body.employeeId),password=String(req.body.password||"");if(password.length<16)return res.status(400).json({error:"管理員密碼至少 16 個字元。"});
 const u=await getAuth().createUser({email:emailFor(id),password,displayName:String(req.body.displayName||"Park Administrator")});
 await getAuth().setCustomUserClaims(u.uid,{staff:true,role:"admin",employeeId:id});
 await db.ref(`staff/${u.uid}`).set({employeeId:id,displayName:u.displayName,role:"admin",active:true,createdAt:Date.now()});
 return res.json({ok:true,employeeId:id});}catch(e){return res.status(400).json({error:e.message||"初始化失敗"});}
});
