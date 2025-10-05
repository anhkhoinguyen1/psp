// import { base44 } from './base44Client';


// export const Patient = base44.entities.Patient;

// export const VitalReading = base44.entities.VitalReading;



// // auth sdk:
// export const User = base44.auth;
import { base44 } from "./base44Client";

const itemsOf = (res) => Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);

async function firstNonEmpty(paths){
  for (const p of paths){
    try{
      const r = await base44.fetch(p); 
      const it = itemsOf(r);
      if (it.length) return { path:p, items:it };
    }catch{}
  }
  return { path:null, items:[] };
}

const normalizeId = (x)=> x?.id ? x : x?._id ? ({...x, id:x._id}) : x?.uuid ? ({...x, id:x.uuid}) : x;
const normalizeRisk = (x)=>{
  let r = String(x?.risk_level ?? x?.risk ?? x?.severity ?? "").toLowerCase();
  if (!["high","moderate","low"].includes(r)) r = r==="h"||r==="3"?"high": r==="m"||r==="2"?"moderate":"low";
  return { ...x, risk_level:r };
};

let patientPathCache=null, vitalPathCache=null;

export const Patient = {
  async list(){
    // 공개 컬렉션 후보 경로
    const candidates = [
      "/collections/patients?limit=100",
      "/collections/Patients?limit=100",
      "/collections/patient?limit=100",
      "/collections/patient_records?limit=100",
      "/entities?type=patient&limit=100",
    ];
    let items = [];
    if (patientPathCache){
      try{ items = itemsOf(await base44.fetch(patientPathCache)); }catch{}
    }
    if (!items?.length){
      const r = await firstNonEmpty(candidates);
      patientPathCache = r.path;
      items = r.items;
    }
    return (items||[]).map(o=>{
      let x = normalizeRisk(normalizeId(o));
      return {
        id: x.id,
        name: x.name ?? x.full_name ?? x.patient_name ?? "Unnamed",
        room: x.room ?? x.room_no ?? x.bed ?? "—",
        age: x.age ?? null,
        height_cm: x.height_cm ?? x.height ?? null,
        weight_kg: x.weight_kg ?? x.weight ?? null,
        surgery: x.surgery ?? x.procedure ?? x.note ?? "",
        risk_level: x.risk_level,
        ...x,
      };
    });
  }
};

export const VitalReading = {
  async list(){
    const candidates = [
      "/collections/vital_readings?limit=500&sort=-created_date",
      "/collections/vitals?limit=500&sort=-created_date",
      "/collections/telemetry?limit=500&sort=-created_date",
      "/entities?type=vital_reading&limit=500&sort=-created_date",
    ];
    let items = [];
    if (vitalPathCache){
      try{ items = itemsOf(await base44.fetch(vitalPathCache)); }catch{}
    }
    if (!items?.length){
      const r = await firstNonEmpty(candidates);
      vitalPathCache = r.path;
      items = r.items;
    }
    return (items||[]).map(o=>{
      const x = normalizeId(o);
      const created = x.created_date ?? x.createdAt ?? x.created_at ?? x.ts ?? x.timestamp ?? null;
      const pid = x.patient_id ?? x.patientId ?? x.patient ?? x.pid ?? x.subject_id ?? null;
      return { id:x.id, patient_id:pid, created_date:created, type:x.type ?? x.kind ?? x.metric ?? "unknown", value:x.value ?? x.val ?? x.reading ?? null, ...x };
    });
  }
};

export const User = base44.auth; // 그대로
