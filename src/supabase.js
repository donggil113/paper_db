import { createClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 대시보드의 "API URL"(https://<ref>.supabase.co/rest/v1/)을 그대로 붙여 넣는 실수가 잦다.
// supabase-js 는 뒤 경로를 스스로 붙이므로 끝의 /rest/v1 과 슬래시를 떼어 낸다.
function normalizeUrl(v) {
  return (v ?? "").toString().trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "").replace(/\/+$/, "");
}

export const supabaseUrl = normalizeUrl(rawUrl);
const supabaseKey = (rawKey ?? "").toString().trim();

// 설정이 잘못된 유형을 구분해 둔다 — App 의 안내 화면이 무엇을 고쳐야 하는지 알려 준다
export const configIssue = (() => {
  if (!supabaseUrl && !supabaseKey) return "missing-both";
  if (!supabaseUrl) return "missing-url";
  if (!supabaseKey) return "missing-key";
  // 주소는 https://<프로젝트>.supabase.co 형태여야 한다 (경로가 붙으면 안 됨)
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(supabaseUrl)) return "bad-url";
  // 키 자리에 주소를 넣은 경우
  if (/^https?:\/\//i.test(supabaseKey) || /supabase\.(co|in)/i.test(supabaseKey)) return "key-is-url";
  // 키는 JWT(eyJ…) 또는 새 형식(sb_publishable_…) — 어느 쪽이든 충분히 길다
  if (supabaseKey.length < 30) return "key-too-short";
  return null;
})();

export const supabase = configIssue ? null : createClient(supabaseUrl, supabaseKey);
