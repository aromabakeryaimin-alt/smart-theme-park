import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";
export const app=initializeApp(firebaseConfig),auth=getAuth(app),functions=getFunctions(app,"asia-southeast1");
export const call=(name,data)=>httpsCallable(functions,name)(data);
export function employeeEmail(employeeId){const id=String(employeeId||"").trim().toUpperCase();if(!/^[A-Z0-9_-]{3,24}$/.test(id))throw new Error("員工編號格式不正確。");return `staff-${id.toLowerCase()}@staff.smartthemepark.invalid`;}
export async function staffLogin(employeeId,password){const c=await signInWithEmailAndPassword(auth,employeeEmail(employeeId),password);const t=await c.user.getIdTokenResult(true);if(t.claims.staff!==true||!["admin","counter","gate","supervisor","finance"].includes(t.claims.role)){await signOut(auth);throw new Error("帳戶沒有有效員工權限。");}return t.claims;}
export function requireRole(roles,callback){return onAuthStateChanged(auth,async user=>{if(!user)return callback(null,null);const t=await user.getIdTokenResult();callback(user,roles.includes(t.claims.role)?t.claims:null);});}
