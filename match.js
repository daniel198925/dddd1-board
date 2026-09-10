// ══════════════════════════════════════════════
//  match.js — 團 → 行程檔案配對（唯一真相來源，2026-09-08 自 dynamic.html 抽出）
//  前端：dynamic.html 以 <script src="./match.js?v=N"> 載入（函式掛在 window）
//  後端／測試：Node require() 直接引用同一份
//  ⚠ 改了這支要同步把 dynamic.html 裡的 ?v= 加一，瀏覽器快取才會換新
//  ⚠ findLineFolder / findFolderDeep 第一個參數是「檔案樹」（原本讀全域 FILETREE，抽出後改參數）
// ══════════════════════════════════════════════
(function (g) {
'use strict';

// ── 團 → 行程檔案配對（使用者 2026-07-20：點團自動列出相關行程，不用一層層點）──
// 檔名命名很規律：0701~1024=精彩北越5日-星宇航空-台北出發。用團型/天數/出發地/航空/期間評分。
// 團型 → 檔名可能出現的字（檔名跟漢書團型名不完全一致時補；沒列的用團型名本身比對）
const TT_ALIAS = {
  夜臥沙: ['夜臥', '沙壩', '火車'], 快閃: ['快閃'], 精彩: ['精彩'], 豪華: ['豪華'],
  超值: ['超值'], 尊爵: ['尊爵'], 尊: ['尊爵', '尊'],
  賞櫻: ['櫻花', '賞櫻'], 賞楓: ['賞楓', '楓'], 滑雪: ['滑雪'], 冰釣: ['冰釣'],
  樹冰: ['樹冰'], 鐵道楓: ['鐵道'], 奧入楓: ['奧入'], 雪壁: ['雪壁', '雪璧'], 雪璧: ['雪壁', '雪璧'],
};
// 郵輪各線直接展開自己那艘船的資料夾（子夾巢狀在「17.日韓郵輪行程」底下，要遞迴找）。
//   歌詩達不變（明年那艘船不來，維持指到整個郵輪行程夾）。使用者 2026-07-23
const LINE_FOLDER_ALIAS = { 歌詩達: '日韓郵輪', MSC: 'MSC榮耀', 麗星輪: '麗星探索' };
const _cleanFolder = s => s.replace(/^[0-9.\s]+/, '').replace(/\s/g, '');
function findFolderDeep(tree, keyword) {   // 整棵樹遞迴找第一個名稱含 keyword 的資料夾
  let hit = null;
  const walk = ns => { for (const c of ns || []) { if (hit) return; if (isNoiseFolder(c.name)) continue; if (_cleanFolder(c.name).includes(keyword)) { hit = c; return; } walk(c.children); } };   // 舊/下架夾整棵跳過（Codex 審查 #7）
  walk(tree.children);
  return hit;
}
function findLineFolder(tree, lineName) {
  // 找對應這條產品線的第一層資料夾（檔名前綴 06.河內 對到 dt_tours 的 ln=河內）
  // ⚠ 每條線在雲端都有精確資料夾（含 A/B）：長程A→15.長程A、長程B→16.長程B。
  //   一定要「精確比對」優先，否則「長程B」會誤中排在前面的「15.長程A」→整條長程B全掛。
  const clean = _cleanFolder;
  const alias = LINE_FOLDER_ALIAS[lineName];             // 郵輪：可能是巢狀子夾，遞迴找
  if (alias) { const f = findFolderDeep(tree, alias); if (f) return f; }
  const ln = lineName.replace(/\s/g, '');
  const exact = (tree.children || []).find(c => clean(c.name) === ln);
  if (exact) return exact;
  // 過渡（2026-09-10 漢書大搬檔）：新線「大陸C」還沒有正式雲端資料夾（產品部整理中），
  //   先用「大陸A＋大陸B 合併」當虛擬資料夾搜（產品本來就從那兩夾分出來）。
  //   ⚠ 大陸C 只認「精確」資料夾名（上面的 exact）——「04.大陸C(更新中)」這種半成品
  //     若被下面的模糊比對搶走，330 團會配到還沒放行程的空夾（會診抓出的隱患）。
  //   ⚠ A、B 兩夾要都在才合併；缺一邊寧可回報找不到，也不悄悄只搜半邊。
  //   等正式「04.大陸C」建好，exact 先中，這段自動退役。
  if (ln === '大陸C') {
    const kids = (tree.children || []).filter(c => /大陸[AB]$/.test(clean(c.name)));
    if (kids.length === 2) return { name: '大陸A＋大陸B（大陸C 資料夾建好前暫用）', children: kids, files: [] };
    return null;
  }
  return (tree.children || []).find(c => clean(c.name).includes(ln))
    || (tree.children || []).find(c => c.name.includes(lineName))
    || null;
}
// 掃這個資料夾下所有 PDF，回傳「最相符」那幾個的 id（分數夠高才標，避免亂標）
// 雜項過濾（讓畫面像舊系統一樣清爽，只留正式行程）——保守：只藏最明確的
//   資料夾：圖片/素材/照片…等非行程夾，或複製/副本/備份夾
//   檔案：複製/副本/舊版/作廢…（「舊金山」的「舊」不會誤中，因為只認「(舊)」「舊版」等）
// 非行程資料夾：① 素材夾 ② 舊版夾 ③ 下架/待修夾 ④ 飯店景點等參考資料夾
//   ⚠「下架行程」底下有 309 支已下架的行程，混進來會被業務誤選、甚至被系統標星送給客人（2026-07-30 稽核發現）
//   OLD／舊行程一律不上（使用者 2026-07-30 指示，不開例外）。
//   ⚠ 已知副作用：產品部把現行的「香港進出」桂林行程放在 2.桂林/OLD/香港進出(可北.中.高)/ 裡，
//     藏了 OLD 之後 6 團 HKG6JX 會找不到行程 → 解法是請產品部把該資料夾搬出 OLD，不是放寬這裡。
//   \bold\b 只會中資料夾名剛好叫 OLD 的，不會誤傷 Golden（前後須為非英文字）
const isNoiseFolder = name => /圖片|素材|照片|相片|海報|文宣|封面|備份|複製|副本|舊(?!金山)|下架|待修|資訊|圖庫|\bold\b/i.test(name);
//   ⚠ ~$開頭是 Word 開檔時產生的暫存鎖定檔（~$杜鵑花貴州八日遊.doc），不是行程
const isNoiseFile = name => /^~\$|複製|副本|[-\s]copy|\(舊\)|舊版|舊檔|作廢|勿用|停售|停用|不用|草稿|test/i.test(name);

// ── 哪些檔案算「行程」──（使用者 2026-07-30：西葡明明 3 支行程卻只出現 1 支）
//   ⚠ 絕對不能用副檔名判斷：雲端很多真 PDF 的檔名沒有 .pdf，用 /\.pdf$/ 會把它們整個藏起來。
//   同步時已把 Drive 的真實格式記在 k（p=PDF、w=Word）；舊的檔案樹還沒有 k 就退回看副檔名。
const fKind = f => f.k || (/\.pdf$/i.test(f.n) ? 'p' : /\.docx?$/i.test(f.n) ? 'w' : '');
// 判斷 PDF 和 Word 是不是同一份行程：去副檔名後只留文字和數字。
//   標點也要去掉——同一份行程存兩次常常差一個點（0901起..超值 vs 0901起.超值），
//   不去掉就認不出是同一份，Word 副本會留下來變成清單重複、還會多搶一顆星
//   ⚠ 「+」「/」要保留（全形轉半形後比）：雪+墨 和 雪墨 是不同行程，全剝光會把 Word 版誤殺（Codex 審查 #6）
const fBase = n => n.replace(/\.(pdf|docx?)$/i, '').replace(/＋/g, '+').replace(/[／∕]/g, '/').replace(/[^\p{L}\p{N}+/]/gu, '');
// 一份行程通常 PDF／Word 各存一份（檔名只差副檔名，有的甚至完全同名）→ 只留 PDF 那份，
//   清單才不會整個重複一倍；「只有 Word 沒有 PDF」的行程照樣留著，不然業務就看不到了
function itinFiles(files) {
  const ok = (files || []).filter(f => fKind(f) && !isNoiseFile(f.n));
  const pdfBase = new Set(ok.filter(f => fKind(f) === 'p').map(f => fBase(f.n)));
  return ok.filter(f => fKind(f) === 'p' || !pdfBase.has(fBase(f.n)));
}

// 全形正規化：漢書「雪＋墨」的全形＋、全形／要對得上資料夾「雪+墨」的半形
const nz = s => (s || '').replace(/＋/g, '+').replace(/／/g, '/').replace(/　/g, '');
// 全形數字→半形（航班選項代號：漢書寫 ２、檔名可能寫 (２) 或 (2)）
const half = s => (s || '').replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).trim();
// 團型名正規化：去掉「無購物」的 Ｎ 尾標（漢書寫「精彩Ｎ／超值Ｎ」，檔名只寫「精彩／超值」＋另寫 NS無購物）。
//   不去掉的話，精彩Ｎ 對不上檔名「精彩」，同區塊四個團型全同分→我的「同分過多不標」保險害它一個都不標
const ttNorm = s => nz(s || '').replace(/[ＮN]$/, '');
function bestMatchIds(folder, t) {
  // 帶著「所在資料夾路徑」一起評分——時段（午/早/晚）常寫在資料夾名（酷航(午晚)），不在檔名
  const all = [];
  const walk = (n, path) => {
    for (const f of itinFiles(n.files)) all.push({ f, path });
    for (const c of n.children || []) if (!isNoiseFolder(c.name)) walk(c, path + '/' + c.name);
  };
  walk(folder, folder.name);
  const pw = t.p ? nz(t.p) : '', cw = t.ds ? nz(t.ds) : '';
  let best = -1;
  const scored = all.map(x => {
    const fnN = nz(x.f.n), pathN = nz(x.path);
    // 目的地比對要「去掉所有空白」——資料夾名常寫「桂  林」「重 慶」，含空白比不上「桂林」。
    //   airlineConflict 不能用去空白版：航空代碼要靠空格當邊界（"賞楓 CI八日"）
    const fnS = fnN.replace(/\s+/g, ''), pathS = pathN.replace(/\s+/g, '');
    const sc = scoreFile(t, x.f, x.path);
    // 目的地關卡（2026-09-05 補強，Codex 審查 #2＋實測黃山被星到山東檔）：
    //   大區詞(ds=江南/澳門…)只認「檔名」——子路線改版後整個資料夾路徑都含大區詞，靠路徑過關等於沒關。
    //   產品詞(p)仍可用路徑過關（西葡的檔名只寫西班牙葡萄牙，靠「15.西葡」資料夾名才對得上）。
    const dh = (!pw && !cw) ? true
      : !!((pw && (fnS.includes(pw) || pathS.includes(pw))) || (cw && fnS.includes(cw)));
    const alBad = airlineConflict(t, fnN, pathN);                   // 標了別家航空＝不能配（硬條件）
    if (sc > best && !alBad && dh) best = sc;   // 沒過目的地/航空關卡的不參與「最高分」，免得墊高門檻（Codex 審查 #1）
    return { id: x.f.id, sc, dh, alBad };
  });
  const ids = new Set();
  // 分數夠高「且最佳檔真的對到目的地、航空也沒衝突」才標
  //   （擋掉靠團型/天數亂配：美西 vs 紐西蘭都叫國家公園；JX 星宇團被配到 AK 亞航八日）
  if (best >= 18) for (const s of scored) if (s.sc === best && s.dh && !s.alBad) ids.add(s.id);
  // 同分太多＝系統其實分不出來（例：團型空白時，精彩/豪華/超值/樹冰…全部同分）。
  //   標一堆星等於沒篩選還誤導業務，不如不標，讓業務自己挑。（使用者 2026-07-21）
  //   以前是「同分太多就一個都不標」，等於業務完全沒線索。改成照樣標出來但打上 tie 記號，
  //   畫面會提示「有 N 份同分、請自行確認」，比沉默好（使用者 2026-07-30）
  if (ids.size > 3) ids.tie = true;
  return ids;
}
function inFilePeriod(nm, dt) {
  if (!dt) return null;
  const md = +dt.slice(5, 7) * 100 + +dt.slice(8, 10);
  let m = nm.match(/(\d{2})(\d{2})[~\-](\d{2})(\d{2})/);
  if (m) { const s = +m[1] * 100 + +m[2], e = +m[3] * 100 + +m[4]; return s <= e ? (md >= s && md <= e) : (md >= s || md <= e); }
  if ((m = nm.match(/(\d{2})(\d{2})\s*起/))) return md >= +m[1] * 100 + +m[2];
  if ((m = nm.match(/(\d{2})(\d{2})\s*前/))) return md <= +m[1] * 100 + +m[2];
  return null;
}
// 天數轉中文（首爾等線檔名寫「五日」不是「5日」）：5→五、10→十、12→十二、15→十五
const _CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function dayCN(n) { if (n <= 10) return _CN[n]; if (n < 20) return '十' + _CN[n - 10]; return _CN[Math.floor(n / 10)] + '十' + (n % 10 ? _CN[n % 10] : ''); }
// 航空簡稱（檔名常寫「華航」「星宇」而非全名或代碼；使用者 2026-07-20 指正）
const AL_SHORT = {
  CI: '華航', JX: '星宇', BR: '長榮', TR: '酷航', IT: '虎航', B7: '立榮', AE: '華信', UO: '香港快運',
  CX: '國泰', CA: '國航', MU: '東方', CZ: '南方', MF: '廈航', HU: '海航', HO: '吉祥', FM: '上航',
  JL: '日航', NH: '全日空', MM: '樂桃', KE: '大韓', OZ: '韓亞', TG: '泰航', SL: '獅航', VZ: '越捷',
  SQ: '新航', MH: '馬航', VN: '越航', VJ: '越捷', PR: '菲航', EK: '阿聯酋', QR: '卡達', TK: '土航',
  NX: '澳航', ZE: '易斯達', '7C': '濟州', TW: '德威', BX: '釜山',
  AK: '亞航', FD: '亞航', D7: '亞航',   // AirAsia 集團（AK馬亞航/FD泰亞航/D7），檔名多寫「亞航」
};
// 簡稱同時是「地名」的航空：濟州航空(7C)/釜山航空(BX) 的簡稱就是地名濟州/釜山，
//   幾乎每個濟州/釜山行程檔都有這兩字，用文字比對會把整個韓國誤判成航空衝突（使用者 2026-07-23）。
//   → 這種只用「代碼」(7C/BX) 比對，不用文字。
const AMBIG_AIRLINE = new Set(['濟州', '釜山']);
// 航空衝突：明確標了「別家」航空（不是這團的）→ 硬條件，直接不配（使用者 2026-07-22：JX 星宇團被配到 AK 亞航）
//   2026-09-05 改分層（Codex 審查 #4）：檔名優先——檔名明寫別家，就算路徑（資料夾名）有自家也救不了；
//   檔名沒表態才輪到路徑。不然「JX資料夾裡的華航CI檔」會因路徑有星宇而漏判。
function airlineConflict(t, fnN, pathN) {
  // 航空代碼以解析欄位 t.al 為準，團號切位只當備援（Codex 審查 #3：團號格式一變就切錯）
  const alCode = (half(t.al || '').toUpperCase() || (t.c || '').slice(-8, -6));
  if (!/^[A-Z0-9]{2}$/.test(alCode)) return false;
  const codeRe = c => new RegExp('[＝=(\\-\\s／/]' + c + '(?![A-Za-z0-9])');
  const anBare = t.an ? t.an.replace('航空', '') : '';
  const myShort = AL_SHORT[alCode];
  // 這團自己的航空有出現（全名/簡稱/代碼）？地名型簡稱只認代碼，不認文字
  const mine = h => (anBare && !AMBIG_AIRLINE.has(anBare) && h.includes(anBare))
      || (myShort && !AMBIG_AIRLINE.has(myShort) && h.includes(myShort))
      || codeRe(alCode).test(h);
  // 明確標了別家航空？共用同簡稱的不算（AK/FD 都「亞航」）；地名型簡稱只用代碼
  const others = h => Object.entries(AL_SHORT).some(([c, sn]) => {
    if (c === alCode || (sn && sn === myShort)) return false;
    if (codeRe(c).test(h)) return true;
    return sn && !AMBIG_AIRLINE.has(sn) && h.includes(sn);
  });
  if (mine(fnN)) return false;         // 檔名有自家 → 沒衝突
  if (others(fnN)) return true;        // 檔名明寫別家 → 衝突（路徑救不了）
  if (mine(pathN || '')) return false; // 檔名沒表態 → 看路徑
  return others(pathN || '');
}
function scoreFile(t, f, path) {
  let s = 0; const nm = f.n;
  const hay = nz(nm + ' ' + (path || ''));   // 檔名＋所在資料夾（時段常在資料夾名）；全形正規化對得上「雪+墨」
  // 目的地／路線（最強訊號）：檔名或所在資料夾含這團目的地 → 大加分。
  //   產品線名（雪+墨、美西）比國家名（澳洲）精確 → 權重更高，才能跟隔壁同國團分清楚。
  //   否則「國家公園」「精彩」這種主題字會跨國亂配（美西 vs 紐西蘭都叫國家公園）
  const pw = t.p ? nz(t.p) : '', cw = t.ds ? nz(t.ds) : '';
  if (pw && hay.includes(pw)) s += 14;
  else if (cw && hay.includes(cw)) s += 10;
  // 航班選項代號（北疆/南疆等一個團型多條航線）：漢書團號前綴 ２/大 ↔ 行程檔名開頭 (２)/(大)。
  //   業務就是照漢書代號命名檔案（(２)…北疆CZ(深圳轉)13天），對得上就是同一條航線，最精準。
  //   使用者 2026-07-21 指出：前面那個數字就是配上方第幾個航班。
  if (t.op) {
    const om = nm.match(/^\s*[（(]([^)）]{1,3})[)）]/);
    if (om) s += half(om[1]) === half(t.op) ? 16 : -12;   // 有標代號卻不是這條 → 壓下去
  }
  const myTT = ttNorm(t.tt);
  const al = TT_ALIAS[t.tt] || (myTT ? [myTT] : []);
  if (al.some(a => nm.includes(a))) s += 10;
  // 同區塊有多個團型時要分乾淨（芬蘭：玻璃屋／破冰船／破＋玻）。
  //   「玻璃屋」是「破冰船+玻璃屋」的子字串，光用包含比對會兩個都中（使用者 2026-07-21 回報）
  if (t.tt && t.alt) {
    const names = t.alt.map(a => ttNorm(a[0])).filter(Boolean);
    const solo = names.filter(n => !/[＋+]/.test(n));
    if (/[＋+]/.test(myTT)) {
      // 組合團型：漢書寫縮寫「破＋玻」，檔名寫全名「破冰船+玻璃屋」→ 用同區塊選項還原縮寫
      const full = myTT.split(/[＋+]/).filter(Boolean).map(p => solo.find(n => n.startsWith(p)) || p);
      if (full.length > 1 && full.every(f => nm.includes(f))) s += 12;
    } else if (solo.some(n => n !== myTT && nm.includes(n))) {
      s -= 12;   // 檔名出現同區塊「別的」團型 → 是別的商品或組合行程，不是這團
    }
  }
  // 班機時段（使用者 2026-07-20）：午班→午晚、晚班→午晚、早班→早午。
  //   ⚠ 精確比對時段組合（午晚/早午）或括號單一時段（(午)/（午）），
  //   不能用「午班」模糊比對——「早午班機」資料夾含「午班」會誤中！
  if (t.fl) {
    const combo = { 午: '午晚', 晚: '午晚', 早: '早午', 夜: '午晚' }[t.fl];
    const match = hay.includes(combo) || hay.includes('(' + t.fl + ')') || hay.includes('（' + t.fl + '）');
    const anyTime = /午晚|早午|\([早午晚夜]\)|（[早午晚夜]）/.test(hay);
    if (match) s += 6;
    else if (anyTime) s -= 10;   // 有明確時段卻不是這團的（午班配到早午）→ 壓下
  } else if (/午晚/.test(hay)) {
    // 團號前沒有「午」記號＝走漢書的預設班機，不是「午」那組。
    //   （東京 TR：預設 TR866 0645去/TR867 1230回＝早午；有「午」記號才是 TR874 1530去/TR875 2115回＝午晚）
    //   使用者 2026-07-21 指正：沒標記的團被配到午晚行程是錯的。
    s -= 10;
  }
  // 天數：阿拉伯/中文 ×「日」或「天」，另認泰國常見的「6D4N」＝6天4夜（使用者 2026-07-21）
  if (t.dy) {
    const cn = dayCN(t.dy);
    if (new RegExp(`(?:^|\\D)(?:${t.dy}\\s*(?:日|天|D\\s*\\d+\\s*N)|${cn}(?:日|天))`).test(nm)) s += 8;
  }
  // 出發地：台北是預設（檔名多半不寫）；高雄/台中出發的檔案會明寫「高出」「高／」「亞航高出」
  const OTHER_DEP = /高雄|高出|高／|高\/|台中|中出/;
  if (t.dp && t.dp !== '台北') {
    if (hay.includes(t.dp) || (t.dp === '高雄' && /高出|高／|高\//.test(hay))) s += 5;
  } else if (OTHER_DEP.test(hay)) s -= 12;   // 台北的團配到「高雄出發」→ 明確不符，壓下去
  else s += 2;
  // 航空：對到 +4；別家航空 −12（而且 bestMatchIds 會直接不標星，硬條件）。
  //   航空常寫在資料夾名（曼谷＝CI／九州-JX星宇），所以比對 hay 不是 nm
  const alCode = (half(t.al || '').toUpperCase() || t.c.slice(-8, -6));   // 航空以解析欄位為準，團號切位當備援（Codex 審查 #3）
  const anBare = t.an ? t.an.replace('航空', '') : '';
  if ((anBare && hay.includes(anBare)) || (AL_SHORT[alCode] && hay.includes(AL_SHORT[alCode]))
      || (/^[A-Z0-9]{2}$/.test(alCode) && new RegExp('[＝=(\\-\\s／/]' + alCode + '(?![A-Za-z0-9])').test(hay))) s += 4;
  else if (airlineConflict(t, hay)) s -= 12;
  const p = inFilePeriod(nm, t.dt);
  if (p === true) s += 3; else if (p === false) s -= 6;         // 期間明確不符 → 壓下去
  return s;
}

const MATCH = { nz, half, ttNorm, dayCN, inFilePeriod, isNoiseFolder, isNoiseFile, fKind, fBase, itinFiles,
  TT_ALIAS, LINE_FOLDER_ALIAS, findFolderDeep, findLineFolder, AL_SHORT, AMBIG_AIRLINE, airlineConflict, scoreFile, bestMatchIds };
Object.assign(g, MATCH);
if (typeof module !== 'undefined' && module.exports) module.exports = MATCH;
})(typeof window !== 'undefined' ? window : globalThis);
