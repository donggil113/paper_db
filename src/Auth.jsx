// 로그인 화면 — 이 사이트의 현관. 로그인해야만 서재가 열린다.
import { useState } from "react";
import { BookOpen, Loader2, LogIn, Mail, KeyRound, UserPlus } from "lucide-react";

export default function Auth({ supabase, toast }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim();
    if (!mail || !password) { toast("이메일과 비밀번호를 입력하세요.", "error"); return; }
    if (mode === "signup" && password.length < 6) { toast("비밀번호는 6자 이상이어야 합니다.", "error"); return; }

    setBusy(true);
    setNotice(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (error) throw error;
        // 로그인 성공 시 App 의 onAuthStateChange 가 화면을 바꾼다
      } else {
        const { data, error } = await supabase.auth.signUp({ email: mail, password });
        if (error) throw error;
        if (data.session) {
          toast("가입이 완료되었습니다.");
        } else {
          // 이메일 인증이 켜진 프로젝트
          setNotice(`${mail} 으로 인증 메일을 보냈습니다. 메일의 링크를 눌러 인증한 뒤 로그인하세요.`);
          setMode("login");
        }
      }
    } catch (err) {
      toast(translateAuthError(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="au">
      <style>{styles}</style>
      <div className="au-card">
        <div className="au-brand">
          <span className="au-logo"><BookOpen size={26} /></span>
          <h1>논문 서재</h1>
          <p>읽은 논문을 차례대로 정리하고, 요약본을 분야·주제별로 모아 봅니다.</p>
        </div>

        <div className="au-toggle">
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setNotice(null); }}>로그인</button>
          <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => { setMode("signup"); setNotice(null); }}>회원가입</button>
        </div>

        {notice && <p className="au-notice">{notice}</p>}

        <form className="au-form" onSubmit={submit}>
          <label>
            <span><Mail size={13} /> 이메일</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="me@example.com" autoFocus />
          </label>
          <label>
            <span><KeyRound size={13} /> 비밀번호</span>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "6자 이상" : "비밀번호"}
            />
          </label>
          <button type="submit" className="au-submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="au-spin" /> : mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
            {busy ? "잠시만요…" : mode === "login" ? "로그인" : "가입하고 시작하기"}
          </button>
        </form>

        <p className="au-foot">기록은 계정별로 분리 저장되며 <b>본인에게만</b> 보입니다.</p>
      </div>
    </div>
  );
}

// Supabase 인증 오류 메시지를 한국어로
function translateAuthError(err) {
  const msg = String(err?.message || err);
  if (/Invalid login credentials/i.test(msg)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (/Email not confirmed/i.test(msg)) return "이메일 인증이 아직 완료되지 않았습니다. 받은 메일의 링크를 눌러 주세요.";
  if (/User already registered|already been registered/i.test(msg)) return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (/Password should be at least/i.test(msg)) return "비밀번호가 너무 짧습니다. 6자 이상으로 입력하세요.";
  if (/rate limit|Too many/i.test(msg)) return "요청이 너무 잦습니다. 잠시 후 다시 시도하세요.";
  if (/Signups not allowed|signup is disabled/i.test(msg)) return "이 프로젝트는 회원가입이 막혀 있습니다. Supabase 설정에서 가입을 허용하세요.";
  return msg;
}

const styles = `
.au { min-height:100vh; display:grid; place-items:center; padding:24px;
  background:radial-gradient(1100px 520px at 50% -8%, #e0e7ff 0%, rgba(224,231,255,0) 62%), #f6f7fb; }
.au * { box-sizing:border-box; }
.au-card { width:min(420px,100%); background:#fff; border:1px solid #e5eaf3; border-radius:22px; padding:32px 28px 26px;
  box-shadow:0 26px 70px rgba(15,23,42,.10); }
.au-brand { display:grid; justify-items:center; text-align:center; gap:6px; margin-bottom:22px; }
.au-logo { width:54px; height:54px; border-radius:17px; display:grid; place-items:center; color:#fff;
  background:linear-gradient(135deg,#6366f1,#4f46e5); box-shadow:0 14px 28px rgba(79,70,229,.28); margin-bottom:4px; }
.au-brand h1 { margin:0; font-size:23px; letter-spacing:-.04em; color:#18213a; }
.au-brand p { margin:0; color:#64748b; font-size:13px; line-height:1.6; max-width:300px; }
.au-toggle { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:4px; background:#f1f5f9; border-radius:12px; margin-bottom:18px; }
.au-toggle button { height:36px; border:0; border-radius:9px; background:transparent; color:#64748b; font-weight:800; font-size:13.5px;
  font-family:inherit; cursor:pointer; }
.au-toggle button.on { background:#fff; color:#4f46e5; box-shadow:0 2px 8px rgba(15,23,42,.08); }
.au-notice { margin:0 0 16px; padding:11px 13px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:11px;
  color:#047857; font-size:12.5px; line-height:1.6; }
.au-form { display:grid; gap:13px; }
.au-form label { display:grid; gap:6px; }
.au-form label span { display:flex; align-items:center; gap:5px; font-size:12.5px; font-weight:800; color:#334155; }
.au-form input { width:100%; height:44px; border:1px solid #e5eaf3; border-radius:12px; padding:0 13px; font-size:14.5px;
  font-family:inherit; color:#1e293b; outline:none; background:#fff; }
.au-form input:focus { border-color:#a5b4fc; box-shadow:0 0 0 3px rgba(99,102,241,.12); }
.au-submit { height:46px; margin-top:5px; border:0; border-radius:12px; font-family:inherit; font-weight:850; font-size:14.5px;
  color:#fff; background:linear-gradient(135deg,#6366f1,#4f46e5); box-shadow:0 12px 26px rgba(79,70,229,.26);
  display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; }
.au-submit:disabled { opacity:.6; cursor:not-allowed; }
.au-spin { animation:au-rot 1s linear infinite; }
@keyframes au-rot { to { transform:rotate(360deg); } }
.au-foot { margin:18px 0 0; text-align:center; color:#94a3b8; font-size:12px; line-height:1.6; }
.au-foot b { color:#64748b; }
`;
