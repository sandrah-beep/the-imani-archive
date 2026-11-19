"use client";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { formatUGX } from "@/lib/format";
import type { Product, CartLine } from "@/lib/types";

const categories = [
  { id: "lip_sets", title: "Lip sets", sub: "Your perfect lip combo", icon: "💋" },
  { id: "archive_sets", title: "Archive sets", sub: "Little colour stories", icon: "🎀" },
  { id: "accessories", title: "Accessories", sub: "The finishing touches", icon: "✨" },
  { id: "clothing", title: "Clothing", sub: "One-of-a-kind finds", icon: "👗" }
];
const filters = [{id:"all",label:"All the things"},...categories.map(c=>({id:c.id,label:c.title}))];

export default function Home() {
  const [products,setProducts] = useState<Product[]>([]);
  const [filter,setFilter] = useState("all");
  const [cart,setCart] = useState<CartLine[]>([]);
  const [bagOpen,setBagOpen] = useState(false);
  const [loading,setLoading] = useState(true);
  const [checkoutOpen,setCheckoutOpen] = useState(false);
  const [message,setMessage] = useState("");
  const [customer,setCustomer] = useState({name:"",phone:"",email:"",address:"",district:"",notes:"",paymentNetwork:"MTN",paymentPhone:""});
  const supabase = useMemo(()=>createSupabaseBrowser(),[]);
  const total = cart.reduce((sum,line)=>sum+Number(line.product.price)*line.quantity,0);

  useEffect(()=>{ (async()=>{
    const {data,error}=await supabase.from("products").select("*").eq("is_available",true).order("created_at",{ascending:false});
    if(!error && data) setProducts(data as Product[]);
    setLoading(false);
  })(); },[supabase]);

  const visible = products.filter(p=>filter==="all"||p.category===filter);
  function add(product:Product){setCart(old=>{const found=old.find(x=>x.product.id===product.id);return found?old.map(x=>x.product.id===product.id?{...x,quantity:x.quantity+1}:x):[...old,{product,quantity:1}]});setBagOpen(true)}
  function qty(id:string,delta:number){setCart(old=>old.map(x=>x.product.id===id?{...x,quantity:x.quantity+delta}:x).filter(x=>x.quantity>0))}
  async function submitOrder(e:React.FormEvent){
    e.preventDefault();setMessage("Preparing your order…");
    try{
      const response=await fetch("/api/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({customer,items:cart.map(x=>({product_id:x.product.id,quantity:x.quantity}))})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Could not start checkout.");
      if(data.payment_link) window.location.href=data.payment_link;
      else setMessage("Your order request was received. Payment setup is not enabled yet — please contact the shop before paying.");
    }catch(err){setMessage(err instanceof Error?err.message:"Something went wrong.");}
  }

  return <>
    <div className="announcement">A little something cute is always a good idea ✿</div>
    <header><nav className="nav"><a className="brand" href="#">THE IMANI ARCHIVE<small>AN ARCHIVE OF ALL THINGS CUTE</small></a><div className="navlinks"><a href="#collections">Collections</a><a href="#shop">Shop all</a><a href="#story">Our story</a><a href="#contact">Contact</a></div><button className="bag" onClick={()=>setBagOpen(true)}>♡ Bag ({cart.reduce((n,x)=>n+x.quantity,0)})</button></nav></header>
    <main>
      <section className="hero"><div className="hero-inner"><div className="hero-copy"><div className="eyebrow">A little archive of lovely things</div><h1>Find your next <em>favourite</em> thing.</h1><p>Curated pieces, beauty treats and little treasures to make the everyday feel a little more you. Because every girl deserves something cute.</p><a className="btn" href="#shop">Explore the archive ↗</a></div><div className="hero-art"><div className="hero-stamp">cute things<br/>inside ✿</div><div className="vessels"><div className="vessel"/><div className="vessel"/><div className="vessel"/></div></div></div></section>
      <div className="marquee">♡ CURATED PIECES　✿　LITTLE TREASURES　✿　EVERYDAY BEAUTY　✿　MADE FOR THE GIRLS</div>
      <section className="section" id="collections"><div className="section-head"><div className="eyebrow">A collection for every mood</div><h2>Explore the archive.</h2><p>From your everyday lip combo to the finishing touch your outfit was missing.</p></div><div className="categories">{categories.map(c=><a className="category" href="#shop" key={c.id} onClick={()=>setFilter(c.id)}><span className="symbol">{c.icon}</span><h3>{c.title}<small>{c.sub}</small></h3></a>)}</div></section>
      <section className="shop" id="shop"><div className="section"><div className="section-head"><div className="eyebrow">Handpicked with love</div><h2>Little things to love.</h2><p>Browse a few favourites from our world. New treasures can find their way into the archive anytime.</p></div><div className="filters">{filters.map(f=><button key={f.id} className={filter===f.id?"active":""} onClick={()=>setFilter(f.id)}>{f.label}</button>)}</div><div className="products">{loading?<p className="empty">Opening the archive…</p>:visible.length===0?<p className="empty">No products here just yet. Check back for new treasures ♡</p>:visible.map(p=><article className="product-card" key={p.id}><div className="product-image">{p.image_url?<img src={p.image_url} alt={p.name}/>:<span className="placeholder">{p.category==="lip_sets"?"💄":p.category==="archive_sets"?"🎀":p.category==="clothing"?"👗":"✨"}</span>}<button className="add" onClick={()=>add(p)} aria-label={`Add ${p.name}`}>+</button></div><div className="product-info"><h3>{p.name}</h3><p>{p.short_description||p.description||"A little something cute."}</p><span className="price">{formatUGX(Number(p.price))}</span></div></article>)}</div></div></section>
      <section className="section" id="story"><div className="story"><div className="story-art"><strong>all things<br/>cute ♡</strong></div><div className="story-copy"><div className="eyebrow">A little about us</div><h2>Not just things.<br/><em>A feeling.</em></h2><p>The Imani Archive is a growing collection of curated pieces, beauty favourites and little things that make getting dressed up and showing up feel special.</p><p>We believe cute things should feel accessible, personal and fun. Think of us as your little corner of the internet for finding something you didn't know you needed.</p></div></div><div className="values"><div className="value"><b>Curated</b><span>Thoughtfully picked pieces</span></div><div className="value"><b>Playful</b><span>Room for your personality</span></div><div className="value"><b>Accessible</b><span>Cute things for every girl</span></div></div></section>
      <section className="section" id="contact"><div className="newsletter"><div className="eyebrow">Love a little update?</div><h2>Stay in the loop, lovely.</h2><p>For new drops, archive finds and all things cute.</p><p>Questions? Contact us through our social pages.</p></div></section>
    </main>
    <footer><div className="footer-inner"><div><div className="footer-logo">The Imani Archive</div><p>Curated pieces for the girls. A little something cute is always a good idea.</p></div><div className="footer-links"><a href="#collections">Collections</a><a href="#shop">Shop all</a><a href="#story">Our story</a><a href="#contact">Contact</a><a href="/admin">Admin</a></div></div><div className="copyright">© {new Date().getFullYear()} The Imani Archive. Made with a little extra love.</div></footer>
    {bagOpen&&<div style={{position:"fixed",inset:0,zIndex:30,background:"#24151d88",display:"flex",justifyContent:"flex-end"}} onClick={()=>setBagOpen(false)}><aside style={{background:"var(--cream)",width:"min(440px,94vw)",height:"100%",padding:24,overflow:"auto"}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{font:"28px 'Playfair Display',serif"}}>Your little bag ♡</h2><button className="bag" onClick={()=>setBagOpen(false)}>Close</button></div>{cart.length===0?<p className="notice">Your bag is waiting for something cute.</p>:<>{cart.map(line=><div key={line.product.id} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"14px 0",borderBottom:"1px solid var(--line)"}}><div><b>{line.product.name}</b><div className="notice">{formatUGX(Number(line.product.price))}</div></div><div style={{display:"flex",gap:9,alignItems:"center"}}><button className="bag" onClick={()=>qty(line.product.id,-1)}>−</button>{line.quantity}<button className="bag" onClick={()=>qty(line.product.id,1)}>+</button></div></div>)}<h3>Total: {formatUGX(total)}</h3><button className="btn" onClick={()=>setCheckoutOpen(true)}>Continue to checkout</button></>}</aside></div>}
    {checkoutOpen&&<div style={{position:"fixed",inset:0,zIndex:40,background:"#24151d99",display:"grid",placeItems:"center",padding:15}}><div className="panel" style={{width:"min(560px,100%)",maxHeight:"92vh",overflow:"auto"}}><div style={{display:"flex",justifyContent:"space-between"}}><h2 style={{font:"28px 'Playfair Display',serif"}}>Delivery details ♡</h2><button className="bag" onClick={()=>setCheckoutOpen(false)}>×</button></div><form className="form-grid" onSubmit={submitOrder}>{(["name","phone","email","address","district","notes"] as const).map(k=><label key={k} className={k==="address"||k==="notes"?"wide":""}>{({name:"Full name",phone:"Phone number",email:"Email address",address:"Delivery address",district:"District / area",notes:"Delivery instructions"} as any)[k]}<input required={k!=="email"&&k!=="notes"} type={k==="email"?"email":"text"} value={customer[k]} onChange={e=>setCustomer({...customer,[k]:e.target.value})}/></label>)}<label>Mobile Money network<select required value={customer.paymentNetwork} onChange={e=>setCustomer({...customer,paymentNetwork:e.target.value})}><option value="MTN">MTN Mobile Money</option><option value="Airtel">Airtel Money</option></select></label><label>Mobile Money number<input required type="tel" value={customer.paymentPhone} placeholder="e.g. 077... or 070..." onChange={e=>setCustomer({...customer,paymentPhone:e.target.value})}/></label><div className="wide"><p className="notice">Choose the network registered to the number you will use to pay.</p><button className="btn" type="submit">Place order request</button><p className="notice">{message}</p></div></form></div></div>}
  </>;
}
