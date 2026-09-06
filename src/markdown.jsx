// 아주 작은 마크다운 렌더러 — 요약본·메모 표시용
// 지원: 제목(#~####), 글머리 목록(-,*,•), 번호 목록(1.), 인용(>), 코드 블록(```), 구분선(---),
//       **굵게**, *기울임*, `코드`, [텍스트](주소), 주소 자동 링크
// innerHTML 을 쓰지 않고 React 엘리먼트로 변환하므로 사용자가 쓴 텍스트가 스크립트로 실행될 일이 없다.

const SAFE_HREF = /^(https?:|mailto:)/i;

function renderInline(text) {
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*|https?:\/\/[^\s<>)]+)/g;
  const parts = [];
  let last = 0;
  let key = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      parts.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("[")) {
      const i = tok.indexOf("](");
      const label = tok.slice(1, i);
      const href = tok.slice(i + 2, -1);
      parts.push(SAFE_HREF.test(href)
        ? <a key={key++} href={href} target="_blank" rel="noreferrer">{label}</a>
        : <span key={key++}>{label}</span>);
    } else if (tok.startsWith("http")) {
      parts.push(<a key={key++} href={tok} target="_blank" rel="noreferrer">{tok}</a>);
    } else {
      parts.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const HEADING = /^(#{1,4})\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const QUOTE = /^>\s?/;
const FENCE = /^```/;
const RULE = /^(-{3,}|\*{3,}|_{3,})\s*$/;

function isSpecial(line) {
  return HEADING.test(line) || BULLET.test(line) || NUMBERED.test(line) || QUOTE.test(line) || FENCE.test(line) || RULE.test(line);
}

function parseBlocks(text) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (FENCE.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    if (RULE.test(line)) { blocks.push({ type: "hr" }); i++; continue; }

    const h = HEADING.exec(line);
    if (h) { blocks.push({ type: "h", level: h[1].length, text: h[2] }); i++; continue; }

    if (BULLET.test(line)) {
      const items = [];
      while (i < lines.length && BULLET.test(lines[i])) items.push(lines[i++].replace(BULLET, ""));
      blocks.push({ type: "ul", items });
      continue;
    }
    if (NUMBERED.test(line)) {
      const items = [];
      while (i < lines.length && NUMBERED.test(lines[i])) items.push(lines[i++].replace(NUMBERED, ""));
      blocks.push({ type: "ol", items });
      continue;
    }
    if (QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && QUOTE.test(lines[i])) buf.push(lines[i++].replace(QUOTE, ""));
      blocks.push({ type: "quote", lines: buf });
      continue;
    }

    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) buf.push(lines[i++]);
    blocks.push({ type: "p", lines: buf });
  }
  return blocks;
}

function Lines({ lines }) {
  return lines.map((l, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {renderInline(l)}
    </span>
  ));
}

export function Markdown({ text, className }) {
  if (text == null || !String(text).trim()) return null;
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h": {
            const Tag = `h${Math.min(b.level + 2, 6)}`; // # → h3 (페이지 제목 계층을 침범하지 않도록 한 단계 낮춤)
            return <Tag key={i}>{renderInline(b.text)}</Tag>;
          }
          case "ul": return <ul key={i}>{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>;
          case "ol": return <ol key={i}>{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>;
          case "quote": return <blockquote key={i}><Lines lines={b.lines} /></blockquote>;
          case "code": return <pre key={i}><code>{b.text}</code></pre>;
          case "hr": return <hr key={i} />;
          default: return <p key={i}><Lines lines={b.lines} /></p>;
        }
      })}
    </div>
  );
}
