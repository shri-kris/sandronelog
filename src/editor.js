// Turns a plain <textarea> into a lightweight code editor: Tab/Shift-Tab
// indentation and a syntax-highlight overlay (a <pre> painted behind a
// transparent-text textarea, kept in sync on input + scroll).

const INDENT = "    ";           // 4 spaces, matching the generated code
const DEDENT_RE = /^( {1,4}|\t)/; // remove up to one indent level

function indentSelection(ta, dedent) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  const lineEnd = value.indexOf("\n", e);
  const blockEnd = lineEnd === -1 ? value.length : lineEnd;
  const before = value.slice(0, lineStart);
  const lines = value.slice(lineStart, blockEnd).split("\n");
  const after = value.slice(blockEnd);

  if (dedent) {
    let removedFirst = 0, removedTotal = 0;
    const out = lines.map((ln, i) => {
      const m = ln.match(DEDENT_RE); const rm = m ? m[0].length : 0;
      if (i === 0) removedFirst = rm; removedTotal += rm;
      return ln.slice(rm);
    });
    ta.value = before + out.join("\n") + after;
    ta.selectionStart = Math.max(lineStart, s - removedFirst);
    ta.selectionEnd = Math.max(lineStart, e - removedTotal);
  } else {
    ta.value = before + lines.map((ln) => INDENT + ln).join("\n") + after;
    ta.selectionStart = s + INDENT.length;
    ta.selectionEnd = e + INDENT.length * lines.length;
  }
}

function onKeydown(e, ta) {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const { selectionStart: s, selectionEnd: en } = ta;
  if (!e.shiftKey && s === en) {
    // no selection: insert one indent at the caret
    const v = ta.value;
    ta.value = v.slice(0, s) + INDENT + v.slice(en);
    ta.selectionStart = ta.selectionEnd = s + INDENT.length;
  } else {
    indentSelection(ta, e.shiftKey);
  }
  // programmatic edits don't fire 'input'; dispatch so state + overlay update
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

// Wrap `ta` with a highlight overlay and wire up Tab handling. `highlightFn`
// maps source text -> highlighted HTML. Returns a sync() to repaint after the
// textarea's value is set programmatically (e.g. on tab switch).
export function attachCodeEditor(ta, highlightFn) {
  const wrap = document.createElement("div");
  wrap.className = "code-edit-wrap";
  ta.parentNode.insertBefore(wrap, ta);

  const pre = document.createElement("pre");
  pre.className = "code-edit-hl sv";
  pre.setAttribute("aria-hidden", "true");
  wrap.append(pre, ta);

  const sync = () => {
    // trailing newline keeps the last (possibly empty) line aligned with caret
    pre.innerHTML = highlightFn(ta.value) + "\n";
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  };
  const syncScroll = () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; };

  ta.addEventListener("input", sync);
  ta.addEventListener("scroll", syncScroll);
  ta.addEventListener("keydown", (e) => onKeydown(e, ta));
  ta.__sync = sync;   // let callers repaint after setting .value directly
  sync();
  return sync;
}
