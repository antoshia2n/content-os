// 段 5：型の差し込み。{{cursor}} の印は 1 つだけ。差し込んだあと印を消し、その位置にカーソルを置く
export const CURSOR_MARK='{{cursor}}';
export const TEMPLATE_KINDS=[['body','本文'],['memo','メモ'],['closing','締め']];
const PIN='\uE000'; // 差し込み中だけ使う目印（私用の文字。画面にも保存にも残さない）

export function templatesFor(templates,side,postType){
  const kinds=side==='memo'?['memo']:['body','closing'];
  return templates.filter(t=>kinds.includes(t.kind)&&(!t.post_type||t.post_type===postType));
}

// テキスト欄（メモ）：選択範囲に差し込み、新しい文字と印の位置を返す
export function insertIntoText(text,start,end,content){
  const raw=content||'';
  const at=raw.indexOf(CURSOR_MARK);
  const clean=raw.split(CURSOR_MARK).join('');
  const next=text.slice(0,start)+clean+text.slice(end);
  const pos=start+(at<0?clean.length:at);
  return {text:next,pos};
}

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function toHtml(content){
  const first=content.indexOf(CURSOR_MARK);
  let s=content;
  if(first>=0)s=s.slice(0,first)+PIN+s.slice(first+CURSOR_MARK.length).split(CURSOR_MARK).join('');
  else s=s+PIN;
  const lines=s.split('\n');
  if(lines.length===1)return {html:esc(lines[0]),block:false};
  return {html:lines.map(l=>`<p>${l?esc(l):'<br>'}</p>`).join(''),block:true};
}

// 本文（contentEditable）：range の位置へ差し込む。atEnd なら本文の末尾へ足す。
// 差し込んだあと目印を消してそこにカーソルを置き、新しい本文の HTML を返す
export function insertIntoBody(editor,range,content,atEnd){
  if(!editor)return null;
  const {html,block}=toHtml(content||'');
  editor.focus();
  const sel=window.getSelection();
  let r;
  if(atEnd||!range||!editor.contains(range.commonAncestorContainer)){
    r=document.createRange();r.selectNodeContents(editor);r.collapse(false);
  }else r=range;
  sel.removeAllRanges();sel.addRange(r);
  if(atEnd&&block){
    // 末尾の段落の中ではなく、本文の後ろに新しい段落として足す
    editor.insertAdjacentHTML('beforeend',html);
  }else if(atEnd){
    editor.insertAdjacentHTML('beforeend',`<p>${html}</p>`);
  }else{
    document.execCommand('insertHTML',false,html);
  }
  const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
  let node,hit=null;
  while((node=walker.nextNode())){const i=node.data.indexOf(PIN);if(i>=0){hit=[node,i];break;}}
  if(hit){
    const [n,i]=hit;n.deleteData(i,1);
    const c=document.createRange();c.setStart(n,i);c.collapse(true);
    sel.removeAllRanges();sel.addRange(c);
    (n.parentElement||editor).scrollIntoView?.({block:'nearest'});
  }
  return editor.innerHTML;
}
