import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {AdminAIDocuments} from '../../components/AdminAIDocuments';
import {AIAdvisor} from '../../components/AIAdvisor';
import {fetchBetterAuthSession,privateApiRequest} from '../../utils/privateApi';
import '../../index.css';
function StageApp(){
  const [id,setId]=useState<string>(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState('');
  const restore=()=>fetchBetterAuthSession().then(s=>setId(s?.user.id)).catch(()=>setError('Phiên staging chưa sẵn sàng.'));
  useEffect(()=>{void restore();},[]);
  return <main className="max-w-6xl mx-auto p-6"><h1 className="text-xl font-semibold">HUB Advisor — PR88 staging cách ly</h1><p>Chỉ kiểm thử. Không sử dụng tài khoản hoặc dữ liệu cá nhân production.</p>{!id?<form className="grid gap-3 max-w-sm mt-6" onSubmit={async e=>{e.preventDefault();try{await privateApiRequest('/api/auth/sign-in/email',{method:'POST',body:JSON.stringify({email,password})});setPassword('');await restore();}catch{setError('Đăng nhập staging không thành công.');}}}><label>Email kiểm thử<input aria-label="Email kiểm thử" value={email} onChange={e=>setEmail(e.target.value)} className="border p-2 w-full"/></label><label>Mật khẩu kiểm thử<input aria-label="Mật khẩu kiểm thử" type="password" value={password} onChange={e=>setPassword(e.target.value)} className="border p-2 w-full"/></label><button className="bg-blue-800 text-white rounded p-2">Đăng nhập staging</button>{error&&<p role="alert">{error}</p>}</form>:<><AdminAIDocuments/><AIAdvisor userId={id}/></>}</main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><StageApp/></BrowserRouter>);
