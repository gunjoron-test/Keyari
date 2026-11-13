// কেয়ারি রিচ-টেক্সট এডিটর — TinyMCE 6 (MIT) + InDesign/Word ধাঁচের টাইপোগ্রাফি টুল
import { esc, toBnDigits, fixPunctuation, smartQuotes, promptBox } from './util.js';

const TINY = 'https://cdnjs.cloudflare.com/ajax/libs/tinymce/6.8.3';
const LANG = 'https://cdn.jsdelivr.net/npm/tinymce-i18n@25.1.27/langs6/bn_BD.js';

export const FONTS = [
  ['নোটো সেরিফ বাই গুঞ্জরণ (সাইটের একমাত্র ফন্ট)', "'Noto Serif by Gunjoron', serif"],
  // নতুন ফন্ট যোগ করতে এখানে একটি সারি ও static/assets/css/fonts.css-এ @font-face যোগ করুন
];

/** styles.json → CSS (build.py-র style_css()-এর হুবহু অনুরূপ) */
export function stylesToCss(styles) {
  const out = [];
  const pre = { paragraph: '.ps-', character: '.cs-', table: 'table.ts-', cell: '.tc-' };
  for (const kind of Object.keys(pre)) {
    for (const st of styles?.[kind] || []) {
      const sel = pre[kind] + st.id;
      const decl = Object.entries(st.css || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}:${v}`).join(';');
      if (decl) out.push(`${sel}{${decl}}`);
      if (st.extra) out.push(st.extra.split('&').join(sel));
    }
  }
  return out.join('\n');
}

const ALIGNS = [
  ['left', 'বামে সারিবদ্ধ', { 'text-align': 'left', 'text-align-last': '' }],
  ['center', 'মাঝখানে', { 'text-align': 'center', 'text-align-last': '' }],
  ['right', 'ডানে সারিবদ্ধ', { 'text-align': 'right', 'text-align-last': '' }],
  ['justify', 'সমপ্রান্তিক — শেষ লাইন বামে', { 'text-align': 'justify', 'text-align-last': '' }],
  ['justify-center', 'সমপ্রান্তিক — শেষ লাইন মাঝে', { 'text-align': 'justify', 'text-align-last': 'center' }],
  ['justify-right', 'সমপ্রান্তিক — শেষ লাইন ডানে', { 'text-align': 'justify', 'text-align-last': 'right' }],
  ['justify-all', 'সব লাইন সমপ্রান্তিক', { 'text-align': 'justify', 'text-align-last': 'justify' }],
  ['start', 'বাঁধাইয়ের দিকে (start)', { 'text-align': 'start', 'text-align-last': '' }],
  ['end', 'বাঁধাইয়ের বিপরীতে (end)', { 'text-align': 'end', 'text-align-last': '' }],
];
const ICONS = {
  kpara: '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M10 4h9v2h-2v14h-2V6h-2v14h-2v-8a4 4 0 1 1 0-8z" fill="currentColor"/></svg>',
  kchar: '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 19 10.5 5h2L18 19h-2.2l-1.4-3.8H8.6L7.2 19H5zm4.3-5.7h4.4L11.5 7.6 9.3 13.3z" fill="currentColor"/><path d="M4 21h16" stroke="currentColor" stroke-width="1.5"/></svg>',
  kpoem: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 6h10M7 10h10M5 14h12M7 18h8"/></svg>',
  kscene: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>',
  kfoot: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8h10M4 12h8M4 16h6"/><path d="M17 5v5M15 7.5h4" /></svg>',
  kbox: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 10h8M8 14h5" stroke-linecap="round"/></svg>',
  kcols: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h6M4 10h6M4 14h6M4 18h6M14 6h6M14 10h6M14 14h6M14 18h6"/></svg>',
  kpaint: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="4" width="13" height="6" rx="1.5"/><path d="M17 7h3v5h-8v3"/><rect x="10.5" y="15" width="3" height="5" rx="1"/></svg>',
  kbn: '<svg width="24" height="24" viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="14" font-family="Noto Serif by Gunjoron, serif" font-weight="700" fill="currentColor">১২</text></svg>',
  kdrop: '<svg width="24" height="24" viewBox="0 0 24 24"><text x="3" y="17" font-size="17" font-family="serif" font-weight="700" fill="currentColor">অ</text><path d="M14 6h7M14 10h7M3 20h18M14 14h7" stroke="currentColor" stroke-width="1.6"/></svg>',
  kspace: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 4v16M5 7l3-3 3 3M5 17l3 3 3-3M14 8h6M14 12h6M14 16h6"/></svg>',
  kfirst: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 6h10M4 10h16M4 14h16M4 18h12M4 4v4l3-2z"/></svg>',
  kclean: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-9 9H5v-6z"/><path d="M5 13l6 6"/><path d="M15 20h5"/></svg>',
};

const unit = (v, def = 'em') => { v = String(v ?? '').trim(); if (!v) return ''; return /^-?\d*\.?\d+$/.test(v) ? v + def : v; };

function blocksOf(ed) {
  let bl = ed.selection.getSelectedBlocks().filter((b) => b && b.nodeName !== 'BODY');
  if (!bl.length) { const b = ed.dom.getParent(ed.selection.getNode(), ed.dom.isBlock); if (b && b.nodeName !== 'BODY') bl = [b]; }
  return bl;
}
function setStyles(ed, blocks, map) {
  ed.undoManager.transact(() => {
    blocks.forEach((b) => Object.entries(map).forEach(([k, v]) => ed.dom.setStyle(b, k, v === undefined ? '' : v)));
  });
  ed.nodeChanged(); ed.focus();
}

/** টেক্সট নোডে রূপান্তর (নির্বাচন থাকলে শুধু নির্বাচিত অংশে) */
function transformText(ed, fn) {
  const rng = ed.selection.getRng();
  const all = ed.selection.isCollapsed();
  const body = ed.getBody();
  const walker = ed.getDoc().createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let n, count = 0;
  ed.undoManager.transact(() => {
    while ((n = walker.nextNode())) {
      if (!all && !rng.intersectsNode(n)) continue;
      if (n.parentNode && /^(CODE|PRE|SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) continue;
      const nv = fn(n.nodeValue);
      if (nv !== n.nodeValue) { n.nodeValue = nv; count++; }
    }
  });
  ed.nodeChanged();
  return count;
}

export function cleanWordHtml(html, { keepFonts = false } = {}) {
  let h = html
    .replace(/<!--\[if[\s\S]*?endif\]-->/g, '')
    .replace(/<\/?o:p>/g, '')
    .replace(/<\/?(w|m|v):[^>]*>/g, '')
    .replace(/\sclass="?Mso[^"\s>]*"?/g, '')
    .replace(/\slang="[^"]*"/g, '');
  h = h.replace(/\sstyle="([^"]*)"/g, (m, s) => {
    const keep = s.split(';').map((x) => x.trim()).filter((d) => {
      if (!d) return false;
      const p = d.split(':')[0].trim().toLowerCase();
      if (p.startsWith('mso-') || p.startsWith('-ms-')) return false;
      if (!keepFonts && (p === 'font-family' || p === 'font-size' || p === 'line-height')) return false;
      if (['tab-stops', 'layout-grid-mode', 'text-autospace', 'page-break-after', 'font-kerning', 'punctuation-wrap'].includes(p)) return false;
      if (p === 'margin' || p === 'margin-bottom' || p === 'margin-top') return false;
      return true;
    });
    return keep.length ? ` style="${keep.join('; ')}"` : '';
  });
  h = h.replace(/<span>([\s\S]*?)<\/span>/g, '$1');
  return h;
}

// প্রতিটি টুলের উপর মাউস নিলে যে ব্যাখ্যা দেখায়: "নাম — কী কাজ করে (শর্টকাট)"
const TIPS = {
  undo: 'পূর্বাবস্থা — শেষ কাজটি ফিরিয়ে নেয় (Ctrl+Z)',
  redo: 'আবার করুন — ফিরিয়ে নেওয়া কাজটি আবার করে (Ctrl+Y)',
  kparastyle: 'অনুচ্ছেদ স্টাইল — একটি ক্লিকে অনুচ্ছেদের ধরন বসায়, যেমন কবিতা, উদ্ধৃতি, ড্রপ ক্যাপ, স্বাক্ষর',
  blocks: 'লেখার ধরন — সাধারণ অনুচ্ছেদ, শিরোনাম (২–৬), উদ্ধৃতি ইত্যাদি বাছুন',
  bold: 'মোটা অক্ষর (Ctrl+B)',
  italic: 'বাঁকা অক্ষর (Ctrl+I)',
  underline: 'নিচে দাগ (Ctrl+U)',
  kalign: 'সারিবদ্ধতা — বাম, মাঝ, ডান, সমপ্রান্তিক ও শেষ লাইনের বিভিন্ন ধরন',
  alignleft: 'বামে সারিবদ্ধ', aligncenter: 'মাঝখানে সারিবদ্ধ', alignright: 'ডানে সারিবদ্ধ', alignjustify: 'দুই পাশে সমান (জাস্টিফাই)',
  bullist: 'বুলেট তালিকা — প্রতিটি পয়েন্টের আগে বিন্দু',
  numlist: 'সংখ্যার তালিকা — ক্রমিক নম্বরসহ (বাংলা সংখ্যাও বাছা যায়)',
  link: 'লিংক — নির্বাচিত লেখাকে ওয়েব-ঠিকানার সাথে যুক্ত করে (Ctrl+K)',
  image: 'ছবি — লেখার ভেতরে ছবি বসায়, ক্যাপশনসহ',
  table: 'টেবিল — ছক বসায়; পরে সারি, কলাম ও স্টাইল বদলানো যায়',
  kfootnote: 'টীকা / ফুটনোট — লেখার শেষে ক্রমিক নম্বরসহ তথ্যসূত্র হয়ে যায় (Ctrl+Shift+F)',
  kmore: 'আরও টুল — অক্ষর, অনুচ্ছেদ, বিশেষ ব্লক ও বাংলা টুলের সারিগুলো দেখান বা লুকান',
  kcharstyle: 'অক্ষর স্টাইল — নির্বাচিত শব্দে সবুজ জোর, হাইলাইট, ঢেউ-দাগ ইত্যাদি বসায়',
  fontsize: 'লেখার আকার — নির্বাচিত অংশের অক্ষর ছোট বা বড় করে',
  forecolor: 'লেখার রং — নির্বাচিত অক্ষরের রং বদলায়',
  backcolor: 'হাইলাইট — লেখার পেছনে রঙিন জমিন দেয়',
  strikethrough: 'কাটা দাগ — লেখার মাঝ বরাবর দাগ',
  superscript: 'উপরে ছোট অক্ষর — যেমন x² বা টীকার সংখ্যা',
  subscript: 'নিচে ছোট অক্ষর — যেমন H₂O',
  kchar: 'অক্ষর বিন্যাস — ট্র্যাকিং, বেসলাইন, বিভিন্ন আন্ডারলাইন ও আরও (Ctrl+Shift+C)',
  kpaint: 'ফরম্যাট পেইন্টার — এক অনুচ্ছেদের বিন্যাস কপি করে আরেকটিতে বসায়',
  removeformat: 'ফরম্যাট মুছুন — নির্বাচিত লেখার সব সাজসজ্জা সরিয়ে সাধারণ করে',
  outdent: 'ইন্ডেন্ট কমান — অনুচ্ছেদ বাঁয়ে সরায়',
  indent: 'ইন্ডেন্ট বাড়ান — অনুচ্ছেদ ডানে সরায়',
  kfirstindent: 'প্রথম লাইন / ঝুলন্ত ইন্ডেন্ট — অনুচ্ছেদের শুরুর লাইনের ফাঁক',
  lineheight: 'লাইনের উচ্চতা — দুই লাইনের মাঝের ফাঁক',
  kspacing: 'অনুচ্ছেদের আগে/পরে ফাঁক',
  kdropcap: 'ড্রপ ক্যাপ — অনুচ্ছেদের প্রথম অক্ষর বড় করে (২–৪ লাইন)',
  kpara: 'অনুচ্ছেদ বিন্যাস — ইন্ডেন্ট, ফাঁক, রুল, শেডিং, কলাম সব এক জায়গায় (Ctrl+Shift+P)',
  blockquote: 'উদ্ধৃতি ব্লক — অন্যের কথা বা উদ্ধৃত অংশ আলাদা করে',
  kpullquote: 'পুল কোট — লেখার গুরুত্বপূর্ণ বাক্য বড় করে মাঝখানে',
  kpoem: 'কবিতা ব্লক — লাইন ভাঙতে Shift+Enter চাপুন',
  kscene: 'দৃশ্য-বিরতি (***) — গল্পে দৃশ্য বদলের চিহ্ন (Ctrl+Shift+8)',
  hr: 'আড়াআড়ি দাগ — অংশ আলাদা করার রেখা',
  kbox: 'বক্স — সম্পাদকের টীকা বা আলাদা তথ্যের রঙিন ঘর',
  kcols: 'কলাম — নির্বাচিত লেখা দুই বা তিন কলামে সাজায়',
  accordion: 'ভাঁজ করা অংশ — ক্লিকে খোলে ও বন্ধ হয়',
  anchor: 'অ্যাঙ্কর — লেখার ভেতরে একটি স্থানে সরাসরি লিংক দেওয়ার চিহ্ন',
  media: 'ভিডিও / মিডিয়া — ইউটিউব ইত্যাদির লিংক বসায়',
  charmap: 'বিশেষ চিহ্ন — ৳ ॥ ঃ ঁ ৎ, ড্যাশ, যুক্তাক্ষর ভাঙা (ZWNJ) ইত্যাদি',
  emoticons: 'ইমোজি বসান',
  insertdatetime: 'আজকের তারিখ বা সময় বসায়',
  kbn: 'বাংলা সংখ্যা — ইংরেজি সংখ্যা (123) বাংলায় (১২৩) বদলায়',
  kpunct: 'যতিচিহ্ন ঠিক করুন — দাঁড়ির আগের স্পেস, দ্বৈত স্পেস, ... → … ঠিক করে',
  kquotes: 'বাঁকা উদ্ধৃতিচিহ্ন — " " কে “ ” করে',
  kclean: 'Word পরিষ্কার — Word থেকে আসা বাড়তি ফন্ট ও ফরম্যাট মুছে ফেলে',
  searchreplace: 'খুঁজুন ও বদলান — পুরো লেখায় শব্দ খুঁজে বদলায় (Ctrl+F)',
  visualblocks: 'অনুচ্ছেদের সীমা দেখান — কাঠামো বুঝতে সাহায্য করে',
  visualchars: 'লুকানো চিহ্ন দেখান — স্পেস ও লাইন-ভাঙা চিহ্ন',
  code: 'HTML কোড দেখুন ও সম্পাদনা করুন (অভিজ্ঞদের জন্য)',
  preview: 'প্রিভিউ — লেখাটি কেমন দেখাবে তার নমুনা',
  ltr: 'বাম থেকে ডানে লেখা (বাংলা/ইংরেজি)',
  rtl: 'ডান থেকে বামে লেখা (আরবি, ফারসি, উর্দু)',
};

/**
 * এডিটর চালু করা
 * ctx = { styles, siteCss, pickMedia(type) → Promise<{url,alt}>, resolveImage(src) → Promise<blobUrl>, onChange(), height, mini }
 */
export async function createEditor(target, ctx) {
  await waitTiny();
  const styles = ctx.styles || {};
  const css = stylesToCss(styles);
  const paraStyles = styles.paragraph || [];
  const charStyles = styles.character || [];
  const mini = !!ctx.mini;

  const toolbar = mini ? [
    'undo redo | kparastyle blocks | bold italic underline | kalign | bullist numlist | link image | kfootnote kscene | removeformat code',
  ] : [
    // মূল সারি — সবচেয়ে বেশি যা লাগে
    'undo redo | kparastyle blocks | bold italic underline | kalign | bullist numlist | link image table | kfootnote | kmore',
    // "আরও টুল" খুললে নিচের সারিগুলো (প্রতিটির বাঁয়ে বিষয়ের নাম থাকে)
    'kcharstyle fontsize forecolor backcolor | strikethrough superscript subscript | kchar kpaint removeformat',
    'outdent indent kfirstindent | lineheight kspacing | kdropcap kpara',
    'blockquote kpullquote kpoem kscene hr | kbox kcols accordion | anchor media charmap emoticons insertdatetime',
    'kbn kpunct kquotes kclean | searchreplace visualblocks visualchars code preview | ltr rtl',
  ];
  const dark = document.documentElement.getAttribute('data-scheme') === 'dark';

  const [ed] = await tinymce.init({
    target,
    base_url: TINY, suffix: '.min',
    language: 'bn_BD', language_url: LANG,
    promotion: false, branding: false,
    skin: dark ? 'oxide-dark' : 'oxide',
    help_accessibility: false,
    height: ctx.height || (mini ? 420 : Math.max(460, window.innerHeight - 260)),
    min_height: 300,
    resize: true,
    menubar: mini ? false : 'file edit kview insert format table tools kbangla help',
    menu: {
      kview: { title: 'দৃশ্য', items: 'kfocusmenu | visualaid visualchars visualblocks | preview' },
      kbangla: { title: 'বাংলা ও টাইপোগ্রাফি', items: 'kpara kchar | kparastyles kcharstyles | kbnall kpunctall kquotesall | kcleanall | kfootnote kscene kpoem kpullquote kbox' },
    },
    plugins: 'advlist anchor autolink charmap code directionality help image insertdatetime link lists media nonbreaking pagebreak preview quickbars searchreplace table visualblocks visualchars wordcount accordion emoticons',
    toolbar, toolbar_mode: 'wrap', toolbar_sticky: true, toolbar_sticky_offset: 60,
    content_css: [ctx.fontsCss, ctx.siteCss],
    content_style: `${css}
      html{background:#fff}
      *:focus,*:focus-visible,body.entry-content:focus{outline:none!important;box-shadow:none!important}
      body.entry-content{max-width:760px;margin:28px auto 80px;padding:0 28px;background:#fff;color:#29294B;font-family:'Noto Serif by Gunjoron',serif}
      body.entry-content p{margin:0 0 1.6em}
      .fn-ref{color:#00A664;font-weight:700;cursor:help;border-bottom:1px dotted #00A664}
      .fn-ref::after{content:" ✱";font-size:.7em}
      .k-box,.k-cols-2,.k-cols-3{outline:1px dashed #CCEDE0;outline-offset:4px}
      img[data-mce-selected]{outline:3px solid #00A664}
      .mce-content-body [data-mce-selected="inline-boundary"]{background:#CCEDE0}
      ${ctx.justify === false ? 'body.entry-content p{text-align:left}' : ''}`,
    body_class: 'entry-content',
    font_family_formats: FONTS.map(([n, v]) => `${n}=${v}`).join('; '),
    font_size_formats: '11px 12px 13px 14px 15px 16px 17px 18px 20px 22px 24px 28px 32px 36px 42px 48px 60px',
    line_height_formats: '1 1.15 1.3 1.4 1.5 1.6 1.75 1.9 2 2.2 2.5 3',
    block_formats: 'অনুচ্ছেদ=p; শিরোনাম ২=h2; শিরোনাম ৩=h3; শিরোনাম ৪=h4; শিরোনাম ৫=h5; শিরোনাম ৬=h6; উদ্ধৃতি=blockquote; প্রিফরম্যাটেড=pre; ঠিকানা=address; ডিভ=div',
    style_formats: [
      { title: 'অনুচ্ছেদ স্টাইল', items: paraStyles.map((s) => ({ title: s.name, selector: 'p,h1,h2,h3,h4,h5,h6,div,blockquote,li', classes: 'ps-' + s.id })) },
      { title: 'অক্ষর স্টাইল', items: charStyles.map((s) => ({ title: s.name, inline: 'span', classes: 'cs-' + s.id })) },
      { title: 'বিশেষ', items: [
        { title: 'চিহ্নিত (মার্ক)', inline: 'mark' },
        { title: 'কোড', inline: 'code' },
        { title: 'উদ্ধৃতির উৎস (cite)', inline: 'cite' },
        { title: 'সংক্ষেপ (abbr)', inline: 'abbr' },
        { title: 'ছোট লেখা (small)', inline: 'small' },
      ] },
    ],
    style_formats_autohide: true,
    table_class_list: [{ title: 'ডিফল্ট', value: '' }, ...(styles.table || []).map((s) => ({ title: s.name, value: 'ts-' + s.id }))],
    table_cell_class_list: [{ title: 'কোনোটি নয়', value: '' }, ...(styles.cell || []).map((s) => ({ title: s.name, value: 'tc-' + s.id }))],
    table_row_class_list: [{ title: 'কোনোটি নয়', value: '' }, { title: 'হাইলাইট সারি', value: 'tc-highlight' }],
    table_advtab: true, table_cell_advtab: true, table_row_advtab: true, table_appearance_options: true,
    table_use_colgroups: true, table_resize_bars: true, table_sizing_mode: 'relative',
    table_default_attributes: {}, table_default_styles: { 'border-collapse': 'collapse', width: '100%' },
    table_toolbar: 'tableprops tabledelete | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol | tablemergecells tablesplitcells | tablecellprops tablecellvalign tablecellbackgroundcolor | tablerowheader tablecolheader tablecaption',
    advlist_number_styles: 'default,bengali,decimal,lower-alpha,upper-alpha,lower-roman,upper-roman,lower-greek',
    advlist_bullet_styles: 'default,disc,circle,square',
    image_caption: true, image_advtab: true, image_title: true, image_description: true, image_dimensions: true,
    image_class_list: [
      { title: 'স্বাভাবিক', value: '' }, { title: 'মাঝখানে', value: 'aligncenter' },
      { title: 'বামে ভাসমান', value: 'alignleft' }, { title: 'ডানে ভাসমান', value: 'alignright' },
    ],
    file_picker_types: 'image media',
    file_picker_callback: (cb, value, meta) => { ctx.pickMedia && ctx.pickMedia(meta.filetype).then((r) => r && cb(r.url, { alt: r.alt || '', title: r.alt || '' })); },
    automatic_uploads: false, paste_data_images: true, images_reuse_filename: true,
    paste_preprocess: (e, args) => { args.content = cleanWordHtml(args.content); },
    paste_webkit_styles: 'color background-color text-align text-indent margin-left font-weight font-style text-decoration',
    paste_remove_styles_if_webkit: false,
    convert_urls: false, relative_urls: false, remove_script_host: false,
    entity_encoding: 'raw',
    extended_valid_elements: 'sup[class|id|data-note|title],span[class|style|title|lang|dir],p[class|style|lang|dir|id|title],div[class|style|id|lang|dir],figure[class|style|id],figcaption[class|style],mark[class],cite,abbr[title]',
    invalid_elements: 'script,iframe[srcdoc],object,embed',
    browser_spellcheck: true, contextmenu: 'link image table kpara kchar',
    quickbars_selection_toolbar: 'bold italic underline | kcharstyle | quicklink blockquote | kfootnote',
    quickbars_insert_toolbar: 'quickimage quicktable | kscene kpoem hr',
    charmap_append: [
      [0x09F3, 'টাকা ৳'], [0x0964, 'দাঁড়ি ।'], [0x0965, 'দুই দাঁড়ি ॥'], [0x0983, 'বিসর্গ ঃ'], [0x0981, 'চন্দ্রবিন্দু ঁ'],
      [0x09CE, 'খণ্ড-ত ৎ'], [0x09FA, 'ঈশ্বার ৺'], [0x200C, 'ZWNJ — যুক্তাক্ষর ভাঙা'], [0x200D, 'ZWJ — যুক্তাক্ষর জোড়া'],
      [0x2014, 'এম ড্যাশ —'], [0x2013, 'এন ড্যাশ –'], [0x2026, 'এলিপসিস …'], [0x2018, 'বাম একক উদ্ধৃতি ‘'],
      [0x2019, 'ডান একক উদ্ধৃতি ’'], [0x201C, 'বাম দ্বৈত উদ্ধৃতি “'], [0x201D, 'ডান দ্বৈত উদ্ধৃতি ”'], [0x00A0, 'নন-ব্রেকিং স্পেস'],
      [0x2009, 'পাতলা স্পেস'], [0x00AD, 'সফট হাইফেন'], [0x2022, 'বুলেট •'], [0x2042, 'অ্যাস্টেরিজম ⁂'], [0x2766, 'ফুল ❦'],
    ],
    insertdatetime_formats: ['%d/%m/%Y', '%H:%M', '%Y-%m-%d'],
    help_tabs: ['shortcuts', 'keyboardnav'],
    setup: (ed) => setupKeyari(ed, ctx, paraStyles, charStyles),
    init_instance_callback: (ed) => {
      // এখনো ডিপ্লয় না হওয়া ছবি API থেকে দেখানো
      ed.getDoc().addEventListener('error', (e) => {
        const img = e.target;
        if (img.tagName !== 'IMG' || img.dataset.kTried) return;
        img.dataset.kTried = '1';
        const src = img.getAttribute('data-mce-src') || img.getAttribute('src');
        ctx.resolveImage && ctx.resolveImage(src).then((u) => { if (u) { img.setAttribute('data-mce-src', src); img.src = u; } });
      }, true);
    },
  });
  ed.on('input change undo redo SetContent ExecCommand', () => ctx.onChange && ctx.onChange());
  return ed;
}

function waitTiny() {
  return new Promise((res, rej) => {
    let n = 0;
    (function t() { if (window.tinymce) return res(); if (++n > 200) return rej(new Error('এডিটর (TinyMCE) লোড হয়নি — ইন্টারনেট সংযোগ দেখুন')); setTimeout(t, 50); })();
  });
}

function setupKeyari(ed, ctx, paraStyles, charStyles) {
  Object.entries(ICONS).forEach(([k, v]) => ed.ui.registry.addIcon(k, v));

  // ---------- "আরও টুল": নিচের সারিগুলো খোলা/বন্ধ, বিষয়ের লেবেল ও হোভার-ব্যাখ্যা ----------
  const moreKey = 'keyari-editor-more';
  const rowsCfg = [].concat(ed.getParam('toolbar') || []);
  const ROW_LABELS = ['', 'অক্ষর', 'অনুচ্ছেদ', 'ব্লক ও সন্নিবেশ', 'বাংলা ও সম্পাদনা'];
  const getRows = () => [...ed.getContainer().querySelectorAll('.tox-editor-header .tox-toolbar')];
  const setTip = (el, tip) => {
    el.setAttribute('title', tip); el.setAttribute('aria-label', tip);
  };
  const applyTips = () => {
    getRows().forEach((row, ri) => {
      const tokens = (rowsCfg[ri] || '').split(/\s+/).filter((t) => t && t !== '|');
      const items = [...row.querySelectorAll(':scope > .tox-toolbar__group > *')];
      if (items.length !== tokens.length) return;
      items.forEach((el, i) => { const tip = TIPS[tokens[i]]; if (tip) setTip(el, tip); });
    });
  };
  const decorate = () => {
    getRows().forEach((row, ri) => {
      if (ri === 0 || row.querySelector('.k-rowlabel')) return;
      row.classList.add('k-sub-row');
      const l = document.createElement('span'); l.className = 'k-rowlabel'; l.textContent = ROW_LABELS[ri] || '';
      row.insertBefore(l, row.firstChild);
    });
  };
  const applyMore = (open) => {
    decorate();
    getRows().slice(1).forEach((r) => { r.style.display = open ? '' : 'none'; });
    ed.getContainer().classList.toggle('k-more-open', open);
    window.dispatchEvent(new Event('resize'));
  };
  ed.on('init', () => {
    let o = false; try { o = !!localStorage.getItem(moreKey); } catch (x) { /* */ }
    setTimeout(() => { applyMore(o); applyTips(); }, 80);
    ed.on('NodeChange', () => applyTips());
  });
  ed.ui.registry.addToggleButton('kmore', {
    icon: 'more-drawer', text: 'আরও টুল', tooltip: TIPS.kmore,
    onAction: (api) => {
      const open = !ed.getContainer().classList.contains('k-more-open');
      try { localStorage.setItem(moreKey, open ? '1' : ''); } catch (x) { /* */ }
      applyMore(open); api.setActive(open);
    },
    onSetup: (api) => { let o = false; try { o = !!localStorage.getItem(moreKey); } catch (x) { /* */ } api.setActive(o); return () => {}; },
  });
  ed.ui.registry.addButton('kfocus', { icon: 'fullscreen', text: 'ফোকাস মোড', tooltip: 'পুরো পর্দায় মনোযোগ দিয়ে লিখুন', onAction: () => ctx.toggleFocus && ctx.toggleFocus() });
  ed.ui.registry.addMenuItem('kfocusmenu', { icon: 'fullscreen', text: 'ফোকাস মোড (পুরো পর্দা)', onAction: () => ctx.toggleFocus && ctx.toggleFocus() });

  // ---------- অনুচ্ছেদ স্টাইল (প্যারাগ্রাফ স্টাইল শিট) ----------
  const applyPara = (id) => {
    const bl = blocksOf(ed);
    ed.undoManager.transact(() => bl.forEach((b) => {
      [...b.classList].filter((c) => c.startsWith('ps-')).forEach((c) => b.classList.remove(c));
      if (id) b.classList.add('ps-' + id);
      if (!b.className) b.removeAttribute('class');
    }));
    ed.nodeChanged(); ed.focus();
  };
  const paraItems = () => [
    { type: 'menuitem', text: '— কোনো স্টাইল নয় (মূল) —', onAction: () => applyPara('') },
    ...paraStyles.map((s) => ({ type: 'menuitem', text: s.name, onAction: () => applyPara(s.id) })),
    { type: 'separator' },
    { type: 'menuitem', text: 'ওভাররাইড মুছুন (শুধু স্টাইল রাখুন)', onAction: () => { const bl = blocksOf(ed); ed.undoManager.transact(() => bl.forEach((b) => b.removeAttribute('style'))); ed.nodeChanged(); } },
    { type: 'menuitem', text: 'স্টাইল শিট সম্পাদনা…', onAction: () => ctx.openStyles && ctx.openStyles() },
  ];
  ed.ui.registry.addMenuButton('kparastyle', {
    text: 'অনুচ্ছেদ স্টাইল', tooltip: 'অনুচ্ছেদ স্টাইল (Paragraph Styles)',
    fetch: (cb) => cb(paraItems()),
    onSetup: (api) => {
      const h = () => {
        const b = ed.dom.getParent(ed.selection.getNode(), ed.dom.isBlock);
        const c = b && [...b.classList].find((x) => x.startsWith('ps-'));
        const st = c && paraStyles.find((s) => 'ps-' + s.id === c);
        api.setText && api.setText(st ? '¶ ' + st.name : 'অনুচ্ছেদ স্টাইল');
      };
      ed.on('NodeChange', h); return () => ed.off('NodeChange', h);
    },
  });
  ed.ui.registry.addNestedMenuItem('kparastyles', { text: 'অনুচ্ছেদ স্টাইল', getSubmenuItems: paraItems });

  // ---------- অক্ষর স্টাইল ----------
  ed.on('init', () => charStyles.forEach((s) => ed.formatter.register('cs_' + s.id, { inline: 'span', classes: 'cs-' + s.id })));
  const charItems = () => [
    ...charStyles.map((s) => ({ type: 'togglemenuitem', text: s.name, onAction: () => { ed.formatter.toggle('cs_' + s.id); ed.focus(); }, onSetup: (api) => { api.setActive(ed.formatter.match('cs_' + s.id)); return () => {}; } })),
    { type: 'separator' },
    { type: 'menuitem', text: 'অক্ষর ফরম্যাট মুছুন', onAction: () => ed.execCommand('RemoveFormat') },
  ];
  ed.ui.registry.addMenuButton('kcharstyle', { text: 'অক্ষর স্টাইল', tooltip: 'অক্ষর স্টাইল (Character Styles)', fetch: (cb) => cb(charItems()) });
  ed.ui.registry.addNestedMenuItem('kcharstyles', { text: 'অক্ষর স্টাইল', getSubmenuItems: charItems });

  // ---------- সারিবদ্ধতা (সব ধরন) ----------
  ed.ui.registry.addMenuButton('kalign', {
    icon: 'align-justify', tooltip: 'সারিবদ্ধতা — সব ধরন',
    fetch: (cb) => cb(ALIGNS.map(([k, label, map]) => ({ type: 'menuitem', text: label, onAction: () => setStyles(ed, blocksOf(ed), map) }))),
  });

  // ---------- প্রথম লাইন ইন্ডেন্ট ----------
  ed.ui.registry.addMenuButton('kfirstindent', {
    icon: 'kfirst', tooltip: 'প্রথম লাইন / ঝুলন্ত ইন্ডেন্ট',
    fetch: (cb) => cb([
      ['কোনো ইন্ডেন্ট নয়', { 'text-indent': '0', 'padding-left': '' }],
      ['প্রথম লাইন ১ em', { 'text-indent': '1em', 'padding-left': '' }],
      ['প্রথম লাইন ২ em', { 'text-indent': '2em', 'padding-left': '' }],
      ['প্রথম লাইন ৩ em', { 'text-indent': '3em', 'padding-left': '' }],
      ['ঝুলন্ত ইন্ডেন্ট ২ em', { 'text-indent': '-2em', 'padding-left': '2em' }],
      ['স্টাইল অনুযায়ী (মুছুন)', { 'text-indent': '', 'padding-left': '' }],
    ].map(([t, m]) => ({ type: 'menuitem', text: t, onAction: () => setStyles(ed, blocksOf(ed), m) }))),
  });

  // ---------- অনুচ্ছেদের আগে/পরে ফাঁক ----------
  ed.ui.registry.addMenuButton('kspacing', {
    icon: 'kspace', tooltip: 'অনুচ্ছেদের আগে/পরে ফাঁক',
    fetch: (cb) => cb([
      { type: 'nestedmenuitem', text: 'পরে ফাঁক', getSubmenuItems: () => ['0', '0.4em', '0.8em', '1em', '1.6em', '2em', '3em'].map((v) => ({ type: 'menuitem', text: v === '0' ? 'শূন্য' : v, onAction: () => setStyles(ed, blocksOf(ed), { 'margin-bottom': v }) })) },
      { type: 'nestedmenuitem', text: 'আগে ফাঁক', getSubmenuItems: () => ['0', '0.4em', '0.8em', '1em', '1.6em', '2em', '3em'].map((v) => ({ type: 'menuitem', text: v === '0' ? 'শূন্য' : v, onAction: () => setStyles(ed, blocksOf(ed), { 'margin-top': v }) })) },
      { type: 'menuitem', text: 'ফাঁক স্টাইল অনুযায়ী (মুছুন)', onAction: () => setStyles(ed, blocksOf(ed), { 'margin-top': '', 'margin-bottom': '' }) },
    ]),
  });

  // ---------- ড্রপ ক্যাপ ----------
  const dropcap = (n) => {
    const bl = blocksOf(ed);
    ed.undoManager.transact(() => bl.forEach((b) => { ['dropcap-2', 'dropcap-3', 'dropcap-4'].forEach((c) => b.classList.remove(c)); if (n) b.classList.add('dropcap-' + n); if (!b.className) b.removeAttribute('class'); }));
    ed.nodeChanged();
  };
  ed.ui.registry.addMenuButton('kdropcap', {
    icon: 'kdrop', tooltip: 'ড্রপ ক্যাপ',
    fetch: (cb) => cb([['নেই', 0], ['২ লাইন', 2], ['৩ লাইন', 3], ['৪ লাইন', 4]].map(([t, n]) => ({ type: 'menuitem', text: t, onAction: () => dropcap(n) }))),
  });

  // ---------- অনুচ্ছেদ বিন্যাস প্যানেল (InDesign Paragraph panel) ----------
  const openPara = () => {
    const bl = blocksOf(ed);
    if (!bl.length) return;
    const b = bl[0], g = (p) => ed.dom.getStyle(b, p) || '';
    const ta = g('text-align'), tal = g('text-align-last');
    const align = ta === 'justify' ? (tal === 'center' ? 'justify-center' : tal === 'right' ? 'justify-right' : tal === 'justify' ? 'justify-all' : 'justify') : (ta || '');
    const dc = ['2', '3', '4'].find((n) => b.classList.contains('dropcap-' + n)) || '';
    ed.windowManager.open({
      title: 'অনুচ্ছেদ বিন্যাস',
      size: 'medium',
      body: {
        type: 'tabpanel',
        tabs: [
          { name: 'indent', title: 'ইন্ডেন্ট ও ফাঁক', items: [
            { type: 'htmlpanel', html: '<p style="margin:0 0 8px;color:#666;font-size:13px">মান লিখুন: <b>2</b> = 2em, অথবা <b>12px</b>, <b>1.5em</b>, <b>5%</b>। ফাঁকা রাখলে স্টাইল শিটের মান থাকবে।</p>' },
            { type: 'grid', columns: 2, items: [
              { type: 'input', name: 'ml', label: 'বাম ইন্ডেন্ট' }, { type: 'input', name: 'mr', label: 'ডান ইন্ডেন্ট' },
              { type: 'input', name: 'ti', label: 'প্রথম লাইন ইন্ডেন্ট (ঋণাত্মক = ঝুলন্ত)' }, { type: 'input', name: 'lh', label: 'লাইনের উচ্চতা (যেমন 1.9)' },
              { type: 'input', name: 'mt', label: 'আগে ফাঁক' }, { type: 'input', name: 'mb', label: 'পরে ফাঁক' },
            ] },
          ] },
          { name: 'just', title: 'সারিবদ্ধতা ও শব্দ', items: [
            { type: 'selectbox', name: 'align', label: 'সারিবদ্ধতা', items: [{ text: 'স্টাইল অনুযায়ী', value: '' }, ...ALIGNS.map(([v, t]) => ({ text: t, value: v }))] },
            { type: 'grid', columns: 2, items: [
              { type: 'input', name: 'ls', label: 'অক্ষর-ফাঁক / ট্র্যাকিং (যেমন 0.05em)' }, { type: 'input', name: 'ws', label: 'শব্দ-ফাঁক (যেমন 0.1em)' },
              { type: 'selectbox', name: 'hy', label: 'হাইফেনেশন', items: [{ text: 'স্টাইল অনুযায়ী', value: '' }, { text: 'স্বয়ংক্রিয়', value: 'auto' }, { text: 'শুধু সফট হাইফেন', value: 'manual' }, { text: 'বন্ধ', value: 'none' }] },
              { type: 'selectbox', name: 'wsp', label: 'লাইন ভাঙন', items: [{ text: 'স্বাভাবিক', value: '' }, { text: 'সব স্পেস ও লাইন অক্ষুণ্ণ (কবিতা)', value: 'pre-wrap' }, { text: 'লাইন ভাঙবে না', value: 'nowrap' }] },
              { type: 'selectbox', name: 'tt', label: 'অক্ষর রূপান্তর (ইংরেজি)', items: [{ text: 'নেই', value: '' }, { text: 'সব বড় হাতের', value: 'uppercase' }, { text: 'সব ছোট হাতের', value: 'lowercase' }, { text: 'প্রতিটি শব্দের প্রথম অক্ষর বড়', value: 'capitalize' }] },
              { type: 'selectbox', name: 'dir', label: 'লেখার দিক', items: [{ text: 'স্বয়ংক্রিয়', value: '' }, { text: 'বাম→ডান', value: 'ltr' }, { text: 'ডান→বাম (আরবি/ফারসি/উর্দু)', value: 'rtl' }] },
            ] },
          ] },
          { name: 'drop', title: 'ড্রপ ক্যাপ ও নিয়ন্ত্রণ', items: [
            { type: 'selectbox', name: 'dc', label: 'ড্রপ ক্যাপ', items: [{ text: 'নেই', value: '' }, { text: '২ লাইন', value: '2' }, { text: '৩ লাইন', value: '3' }, { text: '৪ লাইন', value: '4' }] },
            { type: 'checkbox', name: 'keep', label: 'অনুচ্ছেদ ভাঙবে না (কলাম/প্রিন্টে একসাথে থাকবে)' },
            { type: 'checkbox', name: 'sc', label: 'স্মল ক্যাপস (ইংরেজি অক্ষরে)' },
            { type: 'grid', columns: 2, items: [{ type: 'input', name: 'orph', label: 'অরফান (ন্যূনতম শেষ লাইন)' }, { type: 'input', name: 'wid', label: 'উইডো (ন্যূনতম প্রথম লাইন)' }] },
          ] },
          { name: 'rule', title: 'রুল ও শেডিং', items: [
            { type: 'grid', columns: 2, items: [
              { type: 'selectbox', name: 'rt', label: 'উপরের রুল', items: [{ text: 'নেই', value: '' }, { text: 'সরু (১px)', value: '1px solid' }, { text: 'মাঝারি (২px)', value: '2px solid' }, { text: 'মোটা (৪px)', value: '4px solid' }, { text: 'ডট', value: '2px dotted' }, { text: 'ড্যাশ', value: '2px dashed' }, { text: 'দ্বৈত', value: '4px double' }] },
              { type: 'selectbox', name: 'rb', label: 'নিচের রুল', items: [{ text: 'নেই', value: '' }, { text: 'সরু (১px)', value: '1px solid' }, { text: 'মাঝারি (২px)', value: '2px solid' }, { text: 'মোটা (৪px)', value: '4px solid' }, { text: 'ডট', value: '2px dotted' }, { text: 'ড্যাশ', value: '2px dashed' }, { text: 'দ্বৈত', value: '4px double' }] },
              { type: 'selectbox', name: 'rl', label: 'বাম রুল (উদ্ধৃতির মতো)', items: [{ text: 'নেই', value: '' }, { text: 'সরু', value: '2px solid' }, { text: 'মোটা', value: '4px solid' }] },
              { type: 'colorinput', name: 'rc', label: 'রুলের রং' },
              { type: 'colorinput', name: 'bg', label: 'শেডিং (পটভূমির রং)' },
              { type: 'input', name: 'pad', label: 'ভেতরের ফাঁক (padding, যেমন 1em)' },
              { type: 'input', name: 'rad', label: 'কোণা গোল (যেমন 12px)' },
            ] },
          ] },
          { name: 'cols', title: 'কলাম', items: [
            { type: 'grid', columns: 2, items: [
              { type: 'selectbox', name: 'cc', label: 'কলাম সংখ্যা', items: [{ text: 'এক (স্বাভাবিক)', value: '' }, { text: 'দুই', value: '2' }, { text: 'তিন', value: '3' }, { text: 'চার', value: '4' }] },
              { type: 'input', name: 'cg', label: 'কলামের মাঝে ফাঁক (যেমন 2em)' },
            ] },
            { type: 'checkbox', name: 'crule', label: 'কলামের মাঝে রুল (দাগ)' },
          ] },
        ],
      },
      initialData: {
        ml: g('margin-left'), mr: g('margin-right'), ti: g('text-indent'), lh: g('line-height'), mt: g('margin-top'), mb: g('margin-bottom'),
        align, ls: g('letter-spacing'), ws: g('word-spacing'), hy: g('hyphens'), wsp: g('white-space'), tt: g('text-transform'), dir: b.getAttribute('dir') || '',
        dc, keep: g('break-inside') === 'avoid', sc: g('font-variant') === 'small-caps', orph: g('orphans'), wid: g('widows'),
        rt: (g('border-top').match(/^\S+\s+\S+/) || [''])[0], rb: (g('border-bottom').match(/^\S+\s+\S+/) || [''])[0], rl: (g('border-left').match(/^\S+\s+\S+/) || [''])[0],
        rc: (g('border-top') || g('border-bottom') || g('border-left')).replace(/^\S+\s+\S+\s*/, ''), bg: g('background-color'), pad: g('padding'), rad: g('border-radius'),
        cc: g('column-count'), cg: g('column-gap'), crule: !!g('column-rule'),
      },
      buttons: [{ type: 'cancel', text: 'বাতিল' }, { type: 'submit', text: 'প্রয়োগ করুন', primary: true }],
      onSubmit: (api) => {
        const d = api.getData();
        const al = ALIGNS.find(([k]) => k === d.align);
        const color = d.rc || '#CCEDE0';
        const map = {
          'margin-left': unit(d.ml), 'margin-right': unit(d.mr), 'text-indent': unit(d.ti), 'line-height': d.lh, 'margin-top': unit(d.mt), 'margin-bottom': unit(d.mb),
          'text-align': al ? al[2]['text-align'] : '', 'text-align-last': al ? al[2]['text-align-last'] : '',
          'letter-spacing': unit(d.ls), 'word-spacing': unit(d.ws), hyphens: d.hy, '-webkit-hyphens': d.hy, 'white-space': d.wsp, 'text-transform': d.tt,
          'break-inside': d.keep ? 'avoid' : '', 'font-variant': d.sc ? 'small-caps' : '', orphans: d.orph, widows: d.wid,
          'border-top': d.rt ? `${d.rt} ${color}` : '', 'border-bottom': d.rb ? `${d.rb} ${color}` : '', 'border-left': d.rl ? `${d.rl} ${color}` : '',
          'background-color': d.bg, padding: unit(d.pad), 'border-radius': unit(d.rad, 'px'),
          'column-count': d.cc, 'column-gap': d.cc ? unit(d.cg) : '', 'column-rule': d.cc && d.crule ? `1px solid ${color}` : '',
        };
        ed.undoManager.transact(() => bl.forEach((el) => {
          Object.entries(map).forEach(([k, v]) => ed.dom.setStyle(el, k, v || ''));
          if (d.dir) el.setAttribute('dir', d.dir); else el.removeAttribute('dir');
          ['dropcap-2', 'dropcap-3', 'dropcap-4'].forEach((c) => el.classList.remove(c));
          if (d.dc) el.classList.add('dropcap-' + d.dc);
          if (!el.className) el.removeAttribute('class');
          if (!el.getAttribute('style')) el.removeAttribute('style');
        }));
        ed.nodeChanged(); api.close(); ed.focus();
      },
    });
  };
  ed.ui.registry.addButton('kpara', { icon: 'kpara', tooltip: 'অনুচ্ছেদ বিন্যাস (ইন্ডেন্ট, ফাঁক, সারিবদ্ধতা, রুল, কলাম…)', onAction: openPara });
  ed.ui.registry.addMenuItem('kpara', { icon: 'kpara', text: 'অনুচ্ছেদ বিন্যাস…', onAction: openPara });

  // ---------- অক্ষর বিন্যাস প্যানেল (InDesign Character panel) ----------
  const openChar = () => {
    if (ed.selection.isCollapsed()) { ed.notificationManager.open({ text: 'আগে কিছু লেখা নির্বাচন করুন', type: 'warning', timeout: 2500 }); return; }
    const n = ed.selection.getNode(), cs = ed.getWin().getComputedStyle(n);
    ed.windowManager.open({
      title: 'অক্ষর বিন্যাস',
      body: { type: 'panel', items: [
        { type: 'grid', columns: 2, items: [
          { type: 'selectbox', name: 'ff', label: 'ফন্ট', items: [{ text: 'অপরিবর্তিত', value: '' }, ...FONTS.map(([t, v]) => ({ text: t, value: v }))] },
          { type: 'input', name: 'fs', label: 'আকার (যেমন 18px বা 1.2em)' },
          { type: 'selectbox', name: 'fw', label: 'পুরুত্ব (ওজন)', items: [{ text: 'অপরিবর্তিত', value: '' }, ...['100', '200', '300', '400', '500', '600', '700', '800', '900'].map((w) => ({ text: w + (w === '400' ? ' (সাধারণ)' : w === '700' ? ' (বোল্ড)' : ''), value: w }))] },
          { type: 'selectbox', name: 'fst', label: 'ভঙ্গি', items: [{ text: 'অপরিবর্তিত', value: '' }, { text: 'সোজা', value: 'normal' }, { text: 'ইটালিক', value: 'italic' }, { text: 'অবলিক', value: 'oblique' }] },
          { type: 'input', name: 'ls', label: 'ট্র্যাকিং / অক্ষর-ফাঁক (যেমন 0.1em)' },
          { type: 'input', name: 'ws', label: 'শব্দ-ফাঁক (যেমন 0.2em)' },
          { type: 'input', name: 'bs', label: 'বেসলাইন শিফট (যেমন 3px বা -2px)' },
          { type: 'selectbox', name: 'tt', label: 'কেস (ইংরেজি)', items: [{ text: 'অপরিবর্তিত', value: '' }, { text: 'স্মল ক্যাপস', value: 'small-caps' }, { text: 'সব বড় হাতের', value: 'uppercase' }, { text: 'সব ছোট হাতের', value: 'lowercase' }] },
          { type: 'selectbox', name: 'ud', label: 'আন্ডারলাইন', items: [{ text: 'অপরিবর্তিত', value: '' }, { text: 'সাধারণ', value: 'solid' }, { text: 'ডট', value: 'dotted' }, { text: 'ড্যাশ', value: 'dashed' }, { text: 'দ্বৈত', value: 'double' }, { text: 'ঢেউ', value: 'wavy' }, { text: 'কাটা দাগ (স্ট্রাইক)', value: 'strike' }, { text: 'উপরে দাগ', value: 'over' }] },
          { type: 'colorinput', name: 'udc', label: 'আন্ডারলাইনের রং' },
          { type: 'colorinput', name: 'c', label: 'লেখার রং' },
          { type: 'colorinput', name: 'bg', label: 'হাইলাইট / পটভূমি' },
          { type: 'selectbox', name: 'ker', label: 'কার্নিং', items: [{ text: 'অপরিবর্তিত', value: '' }, { text: 'স্বয়ংক্রিয়', value: 'auto' }, { text: 'বন্ধ', value: 'none' }] },
          { type: 'selectbox', name: 'lig', label: 'যুক্তাক্ষর / লিগেচার', items: [{ text: 'অপরিবর্তিত', value: '' }, { text: 'স্বাভাবিক', value: 'normal' }, { text: 'বন্ধ', value: 'none' }] },
        ] },
        { type: 'htmlpanel', html: `<p style="margin:8px 0 0;color:#666;font-size:12.5px">বর্তমান: ${esc(cs.fontSize)}, ওজন ${esc(cs.fontWeight)}, ট্র্যাকিং ${esc(cs.letterSpacing)}</p>` },
      ] },
      buttons: [{ type: 'cancel', text: 'বাতিল' }, { type: 'submit', text: 'প্রয়োগ করুন', primary: true }],
      onSubmit: (api) => {
        const d = api.getData(), st = {};
        if (d.ff) st['font-family'] = d.ff;
        if (d.fs) st['font-size'] = unit(d.fs, 'px');
        if (d.fw) st['font-weight'] = d.fw;
        if (d.fst) st['font-style'] = d.fst;
        if (d.ls) st['letter-spacing'] = unit(d.ls);
        if (d.ws) st['word-spacing'] = unit(d.ws);
        if (d.bs) { st['position'] = 'relative'; st['top'] = /^-/.test(d.bs) ? unit(d.bs.slice(1), 'px') : '-' + unit(d.bs, 'px'); }
        if (d.tt === 'small-caps') st['font-variant'] = 'small-caps'; else if (d.tt) st['text-transform'] = d.tt;
        if (d.ud === 'strike') st['text-decoration'] = 'line-through';
        else if (d.ud === 'over') st['text-decoration'] = 'overline';
        else if (d.ud) { st['text-decoration'] = `underline ${d.ud}${d.udc ? ' ' + d.udc : ''}`; st['text-underline-offset'] = '4px'; }
        if (d.c) st['color'] = d.c;
        if (d.bg) st['background-color'] = d.bg;
        if (d.ker) st['font-kerning'] = d.ker;
        if (d.lig) st['font-variant-ligatures'] = d.lig;
        if (Object.keys(st).length) {
          ed.formatter.register('kchar_tmp', { inline: 'span', styles: st });
          ed.formatter.apply('kchar_tmp');
        }
        api.close(); ed.focus();
      },
    });
  };
  ed.ui.registry.addButton('kchar', { icon: 'kchar', tooltip: 'অক্ষর বিন্যাস (ফন্ট, ট্র্যাকিং, বেসলাইন, আন্ডারলাইন…)', onAction: openChar });
  ed.ui.registry.addMenuItem('kchar', { icon: 'kchar', text: 'অক্ষর বিন্যাস…', onAction: openChar });

  // ---------- ফরম্যাট পেইন্টার ----------
  let painter = null;
  ed.ui.registry.addToggleButton('kpaint', {
    icon: 'kpaint', tooltip: 'ফরম্যাট পেইন্টার — বর্তমান অনুচ্ছেদের বিন্যাস কপি করে পরের ক্লিক করা অনুচ্ছেদে বসান',
    onAction: (api) => {
      if (painter) { painter = null; api.setActive(false); return; }
      const b = ed.dom.getParent(ed.selection.getNode(), ed.dom.isBlock);
      if (!b) return;
      painter = { cls: b.className, style: b.getAttribute('style') || '', api };
      api.setActive(true);
      ed.notificationManager.open({ text: 'এখন যে অনুচ্ছেদে ক্লিক করবেন, তাতে এই বিন্যাস বসবে', type: 'info', timeout: 2500 });
    },
  });
  ed.on('click', () => {
    if (!painter) return;
    const b = ed.dom.getParent(ed.selection.getNode(), ed.dom.isBlock);
    if (b) ed.undoManager.transact(() => {
      if (painter.cls) b.className = painter.cls; else b.removeAttribute('class');
      if (painter.style) b.setAttribute('style', painter.style); else b.removeAttribute('style');
    });
    painter.api.setActive(false); painter = null; ed.nodeChanged();
  });

  // ---------- বিশেষ ব্লক ----------
  const insertBlock = (html) => { ed.insertContent(html); ed.focus(); };
  const kpoem = () => {
    if (!ed.selection.isCollapsed()) { applyPara('poem'); return; }
    insertBlock('<p class="ps-poem-title">কবিতার শিরোনাম</p><p class="ps-poem">প্রথম লাইন<br>দ্বিতীয় লাইন<br>তৃতীয় লাইন</p><p></p>');
  };
  ed.ui.registry.addButton('kpoem', { icon: 'kpoem', tooltip: 'কবিতা (নির্বাচিত অংশে কবিতা স্টাইল, নয়তো নতুন কবিতা ব্লক) — লাইন ভাঙতে Shift+Enter', onAction: kpoem });
  ed.ui.registry.addMenuItem('kpoem', { icon: 'kpoem', text: 'কবিতা ব্লক', onAction: kpoem });
  const kscene = () => insertBlock('<p class="ps-scene-break">***</p><p></p>');
  ed.ui.registry.addButton('kscene', { icon: 'kscene', tooltip: 'দৃশ্য-বিরতি (***)', onAction: kscene });
  ed.ui.registry.addMenuItem('kscene', { icon: 'kscene', text: 'দৃশ্য-বিরতি (***)', onAction: kscene });
  const kpull = () => (ed.selection.isCollapsed() ? insertBlock('<p class="ps-pullquote">গুরুত্বপূর্ণ উদ্ধৃতি এখানে লিখুন</p><p></p>') : applyPara('pullquote'));
  ed.ui.registry.addButton('kpullquote', { icon: 'quote', text: 'পুল', tooltip: 'পুল কোট', onAction: kpull });
  ed.ui.registry.addMenuItem('kpullquote', { icon: 'quote', text: 'পুল কোট', onAction: kpull });

  ed.on('init', () => {
    ed.formatter.register('kbox', { block: 'div', classes: 'k-box', wrapper: true, merge_siblings: false });
    ed.formatter.register('kcols2', { block: 'div', classes: 'k-cols-2', wrapper: true, merge_siblings: false });
    ed.formatter.register('kcols3', { block: 'div', classes: 'k-cols-3', wrapper: true, merge_siblings: false });
  });
  const kbox = () => { ed.formatter.toggle('kbox'); ed.focus(); };
  ed.ui.registry.addButton('kbox', { icon: 'kbox', tooltip: 'বক্স / সম্পাদকের টীকা (নির্বাচিত অনুচ্ছেদগুলো বক্সে)', onAction: kbox });
  ed.ui.registry.addMenuItem('kbox', { icon: 'kbox', text: 'বক্সে রাখুন', onAction: kbox });
  ed.ui.registry.addMenuButton('kcols', {
    icon: 'kcols', tooltip: 'কলামে সাজান',
    fetch: (cb) => cb([
      { type: 'menuitem', text: 'দুই কলাম', onAction: () => ed.formatter.toggle('kcols2') },
      { type: 'menuitem', text: 'তিন কলাম', onAction: () => ed.formatter.toggle('kcols3') },
    ]),
  });

  // ---------- টীকা / ফুটনোট ----------
  const kfoot = async () => {
    const cur = ed.dom.getParent(ed.selection.getNode(), 'sup.fn-ref');
    const v = await promptBox(cur ? 'টীকা সম্পাদনা' : 'টীকা / ফুটনোট যোগ', 'টীকার লেখা (প্রকাশের সময় লেখার শেষে ক্রমিক নম্বরসহ তালিকা হবে)', cur ? cur.getAttribute('data-note') : '', { multiline: true });
    if (v === null) return;
    if (cur) { if (v.trim()) cur.setAttribute('data-note', v.trim()); else ed.dom.remove(cur); }
    else if (v.trim()) { ed.selection.collapse(false); ed.insertContent(`<sup class="fn-ref" data-note="${esc(v.trim())}" title="${esc(v.trim())}">*</sup>&nbsp;`); }
    ed.focus();
  };
  ed.ui.registry.addButton('kfootnote', { icon: 'kfoot', tooltip: 'টীকা / ফুটনোট', onAction: kfoot });
  ed.ui.registry.addMenuItem('kfootnote', { icon: 'kfoot', text: 'টীকা / ফুটনোট…', onAction: kfoot });

  // ---------- বাংলা টুল ----------
  const report = (n, what) => ed.notificationManager.open({ text: n ? `${n}টি জায়গায় ${what}` : 'বদলানোর মতো কিছু পাওয়া যায়নি', type: n ? 'success' : 'info', timeout: 2200 });
  const kbn = () => report(transformText(ed, toBnDigits), 'ইংরেজি সংখ্যা বাংলা হলো');
  const kpunct = () => report(transformText(ed, fixPunctuation), 'যতিচিহ্ন/স্পেস ঠিক হলো');
  const kquotes = () => report(transformText(ed, smartQuotes), 'উদ্ধৃতিচিহ্ন বাঁকা হলো');
  const kclean = () => {
    ed.undoManager.transact(() => { ed.setContent(cleanWordHtml(ed.getContent())); });
    ed.notificationManager.open({ text: 'Word/অন্য সাইটের অপ্রয়োজনীয় ফরম্যাট (ফন্ট, mso-স্টাইল) মুছে ফেলা হলো', type: 'success', timeout: 2500 });
  };
  ed.ui.registry.addButton('kbn', { icon: 'kbn', tooltip: 'ইংরেজি সংখ্যা → বাংলা সংখ্যা (নির্বাচিত অংশে, নয়তো পুরো লেখায়)', onAction: kbn });
  ed.ui.registry.addButton('kpunct', { text: '।', tooltip: 'যতিচিহ্ন সংশোধন: দাঁড়ির আগের স্পেস, দ্বৈত স্পেস, ... → …', onAction: kpunct });
  ed.ui.registry.addButton('kquotes', { text: '“ ”', tooltip: 'সোজা উদ্ধৃতিচিহ্ন → বাঁকা (‘ ’ “ ”)', onAction: kquotes });
  ed.ui.registry.addButton('kclean', { icon: 'kclean', tooltip: 'Word-এর ফরম্যাট পরিষ্কার', onAction: kclean });
  ed.ui.registry.addMenuItem('kbnall', { icon: 'kbn', text: 'ইংরেজি সংখ্যা → বাংলা', onAction: kbn });
  ed.ui.registry.addMenuItem('kpunctall', { text: 'যতিচিহ্ন ও স্পেস সংশোধন', onAction: kpunct });
  ed.ui.registry.addMenuItem('kquotesall', { text: 'বাঁকা উদ্ধৃতিচিহ্ন', onAction: kquotes });
  ed.ui.registry.addMenuItem('kcleanall', { icon: 'kclean', text: 'Word-এর ফরম্যাট পরিষ্কার', onAction: kclean });

  // কি-বোর্ড শর্টকাট
  ed.addShortcut('meta+shift+p', 'অনুচ্ছেদ বিন্যাস', openPara);
  ed.addShortcut('meta+shift+c', 'অক্ষর বিন্যাস', openChar);
  ed.addShortcut('meta+shift+f', 'টীকা', kfoot);
  ed.addShortcut('meta+shift+8', 'দৃশ্য-বিরতি', kscene);
}
