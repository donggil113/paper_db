// 논문 서재 — 앱 셸
// 로그인 여부에 따라 로그인 화면(Auth)과 서재(Papers)를 가른다.
import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, AlertCircle, LogOut, Settings } from "lucide-react";
import { supabase } from "./supabase.js";
import Auth from "./Auth.jsx";
import Papers from "./Papers.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  // supabase 는 모듈 상수 — 없으면 처음부터 준비 완료(안내 화면)로 시작한다
  const [ready, setReady] = useState(!supabase);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "ok") => {
    setToast({ message, type, key: Date.now() });
    window.setTimeout(() => setToast((t) => (t && Date.now() - t.key >= 2700 ? null : t)), 2800);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
    const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    showToast("로그아웃했습니다.");
  }

  const user = session?.user || null;

  return (
    <>
      <style>{styles}</style>
      {!supabase ? (
        <EnvSetup />
      ) : !ready ? (
        <div className="app-boot">불러오는 중…</div>
      ) : !user ? (
        <Auth supabase={supabase} toast={showToast} />
      ) : (
        <div className="app">
          <header className="app-bar">
            <div className="app-bar-inner">
              <div className="app-brand">
                <span className="app-logo"><BookOpen size={19} /></span>
                <div className="app-brand-text">
                  <strong>논문 서재</strong>
                  <span>읽은 논문을 차례대로 정리하고 요약본을 모아 봅니다</span>
                </div>
              </div>
              <div className="app-user">
                <span className="app-email" title={user.email}>{user.email}</span>
                <button type="button" onClick={logout} title="로그아웃"><LogOut size={15} /> 로그아웃</button>
              </div>
            </div>
          </header>
          <main className="app-main">
            {/* key: 계정이 바뀌면 서재 상태를 완전히 초기화한다 */}
            <Papers key={user.id} supabase={supabase} userId={user.id} toast={showToast} />
          </main>
        </div>
      )}

      {toast && (
        <div className={`app-toast ${toast.type}`}>
          {toast.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{toast.message}</span>
        </div>
      )}
    </>
  );
}

// .env 가 없을 때의 안내 화면
function EnvSetup() {
  return (
    <div className="app-env">
      <div className="app-env-card">
        <Settings size={30} />
        <h1>Supabase 설정이 필요합니다</h1>
        <p>아래 두 값을 환경변수로 넣어야 서재가 열립니다.</p>
        <pre>{`VITE_SUPABASE_URL=https://<프로젝트>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>`}</pre>
        <ul>
          <li><b>내 컴퓨터에서 실행 중이라면</b> — 프로젝트 폴더에 <code>.env</code> 파일을 만들어 두 줄을 넣고 개발 서버를 다시 시작하세요.</li>
          <li><b>배포된 사이트라면</b> — 호스팅(Vercel 등)의 Environment Variables 에 넣은 뒤 <b>반드시 다시 배포</b>하세요. 이 값은 빌드할 때 코드에 박히므로 저장만 해서는 반영되지 않습니다.</li>
        </ul>
        <p className="dim">값은 Supabase 대시보드 → Project Settings → Data API / API Keys 에서 확인할 수 있습니다. 자세한 순서는 저장소의 README.md 를 참고하세요.</p>
      </div>
    </div>
  );
}

const styles = `
.app { min-height:100vh; display:flex; flex-direction:column; }
.app-boot { min-height:100vh; display:grid; place-items:center; color:#64748b; font-size:14px; }
.app-bar { position:sticky; top:0; z-index:40; background:rgba(255,255,255,.86); backdrop-filter:blur(10px);
  border-bottom:1px solid #e5eaf3; }
.app-bar-inner { max-width:1360px; margin:0 auto; padding:11px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
.app-brand { display:flex; align-items:center; gap:11px; min-width:0; }
.app-logo { width:38px; height:38px; flex:0 0 38px; border-radius:12px; display:grid; place-items:center; color:#fff;
  background:linear-gradient(135deg,#6366f1,#4f46e5); box-shadow:0 10px 20px rgba(79,70,229,.24); }
.app-brand-text strong { display:block; font-size:16px; letter-spacing:-.03em; color:#18213a; }
.app-brand-text span { display:block; margin-top:2px; color:#7b879c; font-size:12px; }
.app-user { display:flex; align-items:center; gap:10px; min-width:0; }
.app-email { color:#64748b; font-size:12.5px; font-weight:700; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.app-user button { height:34px; padding:0 12px; border:1px solid #e5eaf3; background:#fff; border-radius:10px; color:#475569;
  font-family:inherit; font-weight:800; font-size:12.5px; display:inline-flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap; }
.app-user button:hover { border-color:#c7d2fe; color:#4f46e5; }
.app-main { flex:1; max-width:1360px; width:100%; margin:0 auto; padding:22px 24px 40px; }

.app-toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:90; display:flex; align-items:center; gap:9px;
  padding:13px 18px; border-radius:999px; color:#fff; font-weight:800; font-size:13.5px; box-shadow:0 18px 34px rgba(15,23,42,.22); }
.app-toast.ok { background:#059669; }
.app-toast.error { background:#e11d48; }

.app-env { min-height:100vh; display:grid; place-items:center; padding:24px; }
.app-env-card { width:min(520px,100%); background:#fff; border:1px solid #e5eaf3; border-radius:20px; padding:34px 30px;
  box-shadow:0 20px 56px rgba(15,23,42,.08); display:grid; gap:12px; justify-items:start; color:#4f46e5; }
.app-env-card h1 { margin:0; font-size:20px; letter-spacing:-.03em; color:#18213a; }
.app-env-card p { margin:0; color:#475569; font-size:13.5px; line-height:1.7; }
.app-env-card p.dim { color:#94a3b8; font-size:12.5px; }
.app-env-card code { background:#f1f5f9; padding:1px 6px; border-radius:5px; font-size:.92em; color:#334155; }
.app-env-card pre { width:100%; margin:0; background:#0f172a; color:#e2e8f0; padding:14px 16px; border-radius:12px;
  font-size:12.5px; line-height:1.6; overflow:auto; }
.app-env-card ul { margin:0; padding-left:19px; display:grid; gap:7px; color:#475569; font-size:13px; line-height:1.65; }
.app-env-card li b { color:#334155; }

@media (max-width: 820px) {
  .app-bar-inner { padding:10px 14px; gap:10px; }
  .app-brand-text span { display:none; }
  .app-email { display:none; }
  .app-main { padding:14px 14px 32px; }
}
`;
