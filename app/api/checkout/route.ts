import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
export async function POST(req:Request){
 try{
  const body=await req.json();const c=body.customer;const items=body.items;
  if(!c?.name||!c?.phone||!c?.address||!c?.district||!Array.isArray(items)||!items.length)return NextResponse.json({error:"Please complete your delivery details and bag."},{status:400});
  const ids=items.map((x:any)=>x.product_id);if(ids.some((x:any)=>typeof x!=="string"))return NextResponse.json({error:"Invalid products."},{status:400});
  const sb=admin();const {data:products,error}=await sb.from("products").select("id,name,price,stock_quantity,is_available").in("id",ids);
  if(error||!products||products.length!==ids.length)return NextResponse.json({error:"One or more products are no longer available."},{status:400});
  const lines=items.map((i:any)=>{const p=products.find(x=>x.id===i.product_id);if(!p||!p.is_available||i.quantity<1||i.quantity>p.stock_quantity)throw new Error("A product is unavailable or has insufficient stock.");return {product_id:p.id,product_name:p.name,quantity:i.quantity,unit_price:p.price,line_total:p.price*i.quantity};});
  const total=lines.reduce((s:any,x:any)=>s+x.line_total,0);
  const {data:order,error:orderError}=await sb.from("orders").insert({customer_name:c.name,phone:c.phone,email:c.email||null,delivery_address:c.address,district:c.district,delivery_notes:c.notes||null,total_amount:total,order_status:"new",payment_status:"pending"}).select("id").single();
  if(orderError||!order)return NextResponse.json({error:orderError?.message||"Could not create order."},{status:500});
  const {error:itemError}=await sb.from("order_items").insert(lines.map((x:any)=>({...x,order_id:order.id})));
  if(itemError){await sb.from("orders").delete().eq("id",order.id);return NextResponse.json({error:"Could not save order items."},{status:500});}
  if(!process.env.FLW_SECRET_KEY)return NextResponse.json({order_id:order.id,payment_link:null,message:"Payment provider not configured."});
  const site=process.env.NEXT_PUBLIC_SITE_URL||new URL(req.url).origin;
  const txRef=`imani-${order.id}`;
  const flw=await fetch("https://api.flutterwave.com/v3/payments",{method:"POST",headers:{"Authorization":`Bearer ${process.env.FLW_SECRET_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({tx_ref:txRef,amount:total,currency:"UGX",redirect_url:`${site}/payment/return`,customer:{email:c.email||"orders@theimaniarchive.com",phonenumber:c.phone,name:c.name},customizations:{title:"The Imani Archive",description:"Order payment"},meta:{order_id:order.id}})});
  const result=await flw.json();if(!flw.ok||result.status!=="success")return NextResponse.json({order_id:order.id,error:"Order saved, but payment could not be started. Please contact the shop."},{status:502});
  await sb.from("orders").update({payment_reference:txRef}).eq("id",order.id);
  return NextResponse.json({order_id:order.id,payment_link:result.data?.link});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unexpected checkout error."},{status:400});}
}
