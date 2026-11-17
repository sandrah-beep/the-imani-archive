import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req:Request){
 const signature=req.headers.get("verif-hash");
 if(!process.env.FLW_SECRET_HASH||signature!==process.env.FLW_SECRET_HASH)return NextResponse.json({error:"Invalid signature"},{status:401});
 const event=await req.json();
 if(event?.event==="charge.completed"&&event?.data?.status==="successful"){
  const txRef=event.data.tx_ref as string;
  const verify=await fetch(`https://api.flutterwave.com/v3/transactions/${event.data.id}/verify`,{headers:{Authorization:`Bearer ${process.env.FLW_SECRET_KEY}`}});
  const verified=await verify.json();
  if(verify.ok&&verified?.data?.status==="successful"&&verified.data.tx_ref===txRef&&verified.data.currency==="UGX"){
   const orderId=String(verified.data.meta?.order_id||txRef.replace("imani-",""));
   const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
   await sb.from("orders").update({payment_status:"paid",order_status:"confirmed"}).eq("id",orderId).eq("payment_status","pending");
  }
 }
 return NextResponse.json({received:true});
}
