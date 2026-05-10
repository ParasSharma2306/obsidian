(function () {
  /* ── Patterns ── */
  const MSG = [
    /^\[(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\]\s(.+?):\s([\s\S]*)$/,
    /^(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\s-\s(.+?):\s([\s\S]*)$/,
  ];
  const SYS = [
    /^\[(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\]\s([^:]+)$/,
    /^(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\s-\s([^:]+)$/,
  ];
  const MEDIA_EXT = /\.(jpg|jpeg|png|gif|webp|heic|mp4|mov|avi|mkv|mp3|m4a|ogg|opus|aac|wav|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|vcf|zip|rar|webm)\s*(\(file attached\))?$/i;
  const OMITTED   = /<.*(omitted|attached).*>/i;
  const DELETED   = /^<This message was deleted>$/;

  /* ── Parse ── */
  function parseLine(line) {
    for (const p of MSG) {
      const m = line.match(p);
      if (m) return { date: m[1], time: m[2], sender: m[3].trim(), text: m[4], type: 'msg' };
    }
    for (const p of SYS) {
      const m = line.match(p);
      if (m) return { date: m[1], time: m[2], sender: null, text: m[3], type: 'sys' };
    }
    return null;
  }

  function parse(raw) {
    const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const msgs = [];
    let cur = null;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const p = parseLine(line);
      if (p) { if (cur) msgs.push(cur); cur = { ...p }; }
      else if (cur) cur.text += '\n' + line;
    }
    if (cur) msgs.push(cur);
    return msgs.map(m => ({ ...m, mediaInfo: m.type === 'msg' ? detectMedia(m.text) : null }));
  }

  function senders(msgs) {
    const s = new Set();
    msgs.forEach(m => { if (m.sender) s.add(m.sender); });
    return [...s];
  }

  /* ── Media detection ── */
  function detectMedia(text) {
    const t = text.trim();
    if (/^Location:/i.test(t)) return { kind: 'location', filename: null };
    if (OMITTED.test(t)) {
      const lo = t.toLowerCase();
      if (/image|photo/.test(lo))  return { kind: 'image',   filename: null };
      if (/video/.test(lo))        return { kind: 'video',   filename: null };
      if (/audio|voice|ptt/.test(lo)) return { kind: 'audio', filename: null };
      if (/sticker/.test(lo))      return { kind: 'sticker', filename: null };
      if (/gif/.test(lo))          return { kind: 'gif',     filename: null };
      if (/document/.test(lo))     return { kind: 'doc',     filename: null };
      if (/contact|vcf/.test(lo))  return { kind: 'contact', filename: null };
      return { kind: 'media', filename: null };
    }
    const m = t.match(MEDIA_EXT);
    if (!m) return null;
    const fname = t.replace(/\s*\(file attached\)\s*$/i, '').trim();
    const ext = m[1].toLowerCase();
    if (/^(jpg|jpeg|png|gif|webp|heic)$/.test(ext))         return { kind: 'image',   filename: fname, ext };
    if (/^(mp4|mov|avi|mkv|webm)$/.test(ext))               return { kind: 'video',   filename: fname, ext };
    if (/^(mp3|m4a|ogg|opus|aac|wav)$/.test(ext))           return { kind: 'audio',   filename: fname, ext };
    if (/^(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)$/.test(ext)) return { kind: 'doc', filename: fname, ext };
    if (/^vcf$/.test(ext))                                   return { kind: 'contact', filename: fname, ext };
    return { kind: 'media', filename: fname, ext };
  }

  /* ── Helpers ── */
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  function fmtDate(d) {
    try {
      const p = d.split(/[\/\.\-]/);
      let y = parseInt(p[2]); if (y < 100) y += 2000;
      const date = new Date(y, parseInt(p[1])-1, parseInt(p[0]));
      const diff = Math.floor((Date.now()-date)/86400000);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Yesterday';
      return date.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
    } catch { return d; }
  }

  function mkDateSep(dateStr) {
    const el = document.createElement('div');
    el.className = 'wa-date-sep'; el.dataset.date = dateStr;
    el.innerHTML = `<span>${fmtDate(dateStr)}</span>`;
    return el;
  }

  function highlightText(text, query) {
    if (!query) return esc(text);
    const parts = text.split(new RegExp(`(${escRe(query)})`, 'i'));
    return parts.map((p, i) => i % 2 === 1 ? `<mark class="search-hl">${esc(p)}</mark>` : esc(p)).join('');
  }

  /* ── Media renderer ── */
  function waveformHtml(n=18) {
    const h = [4,7,10,14,18,12,16,20,14,10,18,22,16,10,14,8,12,6];
    return h.slice(0,n).map(v=>`<div class="wa-audio-bar" style="height:${v}px"></div>`).join('');
  }
  function docCls(ext) {
    const e=(ext||'').toLowerCase();
    return e==='pdf'?'pdf':/^docx?$/.test(e)?'doc':/^xlsx?$/.test(e)?'xls':/^pptx?$/.test(e)?'ppt':'other';
  }
  function docLbl(ext) { return (ext||'FILE').toUpperCase().slice(0,4); }

  function renderMedia(info, mediaMap) {
    const url = info.filename && mediaMap ? mediaMap.get(info.filename) : null;
    switch (info.kind) {
      case 'image':
        if (url) return `<div class="wa-img-wrap" onclick="openLightbox('${url}')"><img src="${url}" alt="${esc(info.filename||'Image')}" loading="lazy"></div>`;
        return `<div class="wa-img-placeholder"><div class="media-icon">🖼️</div><div class="media-label">${esc(info.filename||'Image')}</div></div>`;
      case 'video':
        if (url) return `<div class="wa-video-wrap"><video controls src="${url}" preload="metadata" playsinline></video></div>`;
        return `<div class="wa-video-placeholder"><div class="play-btn">▶</div><div style="font-size:.72rem;opacity:.6;margin-top:.25rem">${esc(info.filename||'Video')}</div></div>`;
      case 'audio': {
        const id='wa-a-'+Math.random().toString(36).slice(2);
        if (url) return `<div class="wa-audio-wrap" id="${id}"><audio src="${url}"></audio><button class="wa-audio-play" onclick="toggleAudio('${id}')">▶</button><div class="wa-audio-waveform">${waveformHtml()}</div><span class="wa-audio-dur">0:00</span></div>`;
        return `<div class="wa-audio-wrap"><div class="wa-audio-play" style="opacity:.5">🎤</div><div class="wa-audio-waveform">${waveformHtml()}</div><span class="wa-audio-dur">—</span></div>`;
      }
      case 'doc': {
        const cls=docCls(info.ext), lbl=docLbl(info.ext), name=info.filename||'Document';
        const href=url?`href="${url}" download="${esc(name)}" target="_blank"`:'';
        return `<a class="wa-doc-wrap" ${href} style="text-decoration:none"><div class="wa-doc-icon ${cls}">${lbl}</div><div class="wa-doc-info"><div class="wa-doc-name">${esc(name)}</div><div class="wa-doc-type">${url?'Tap to open':'Document'}</div></div></a>`;
      }
      case 'contact':
        return `<div class="wa-contact"><div class="wa-contact-icon">👤</div><div class="wa-contact-info"><div class="name">${esc(info.filename||'Contact')}</div><div class="type">Contact card</div></div></div>`;
      case 'sticker': return `<div class="wa-sticker">🎭</div>`;
      case 'gif':     return `<div class="wa-media-pill">🎞️ GIF</div>`;
      case 'location':
        return `<div class="wa-location"><div class="wa-location-map">📍</div><div class="wa-location-label">Location shared</div></div>`;
      default:
        return `<div class="wa-media-pill">📎 ${esc(info.filename||'Attachment')}</div>`;
    }
  }

  /* ── Build a single message row DOM node ── */
  function buildRow(msg, myName, mediaMap, searchQuery) {
    const row = document.createElement('div');
    if (msg.type === 'sys') {
      row.className = 'msg-row system';
      const txt = DELETED.test(msg.text.trim()) ? '<em>This message was deleted</em>' : esc(msg.text);
      row.innerHTML = `<div class="bubble">${txt}</div>`;
      return row;
    }
    const sent = msg.sender === myName;
    row.className = `msg-row ${sent ? 'sent' : 'received'}`;
    let inner = '';
    if (!sent && msg.sender) inner += `<div class="bubble-name">${esc(msg.sender)}</div>`;

    let bodyHtml;
    if (msg.mediaInfo) {
      bodyHtml = renderMedia(msg.mediaInfo, mediaMap);
      const rawText = msg.text.replace(/\s*\(file attached\)\s*$/i,'').trim();
      const isFname = msg.mediaInfo.filename && rawText === msg.mediaInfo.filename;
      if (!isFname && !OMITTED.test(rawText) && rawText && rawText !== msg.text.split('\n')[0]) {
        bodyHtml += `<div class="wa-caption">${highlightText(rawText, searchQuery)}</div>`;
      }
    } else {
      bodyHtml = `<span class="bubble-text">${highlightText(msg.text, searchQuery).replace(/\n/g,'<br>')}</span>`;
    }

    const meta = `<div class="bubble-meta"><span class="bubble-time">${esc(msg.time)}</span>${sent?'<span class="bubble-ticks">✓✓</span>':''}</div>`;
    const isSticker = msg.mediaInfo?.kind === 'sticker';
    inner += isSticker
      ? `<div class="bubble wa-sticker">${bodyHtml}${meta}</div>`
      : `<div class="bubble">${bodyHtml}${meta}</div>`;
    row.innerHTML = inner;
    return row;
  }

  /* ── renderRange ──
     msgs:        array to render from
     start/end:   slice indices
     myName:      sender name for sent/received
     container:   DOM element to render into
     mediaMap:    Map of filename→blobURL
     prepend:     if true, insert before existing content
     prevDate:    date of message just before 'start' (to avoid duplicate date separators)
     searchQuery: string to highlight ('' = none)
  */
  function renderRange(msgs, start, end, myName, container, mediaMap, prepend, prevDate, searchQuery) {
    prepend = prepend || false;
    prevDate = prevDate || null;
    searchQuery = (searchQuery || '').toLowerCase();

    const frag = document.createDocumentFragment();
    let lastDate = prevDate;

    for (let i = start; i < Math.min(end, msgs.length); i++) {
      const msg = msgs[i];
      if (msg.date !== lastDate) {
        lastDate = msg.date;
        frag.appendChild(mkDateSep(msg.date));
      }
      frag.appendChild(buildRow(msg, myName, mediaMap, searchQuery));
    }

    if (prepend) {
      // Remove duplicate date separator at the junction
      const firstExisting = container.querySelector('.wa-date-sep');
      if (firstExisting && lastDate === firstExisting.dataset.date) firstExisting.remove();
      container.insertBefore(frag, container.firstChild);
    } else {
      container.appendChild(frag);
    }

    return lastDate; // caller can store this for next prepend
  }

  window.WhatsAppParser = { parse, senders, renderRange, fmtDate };
})();
