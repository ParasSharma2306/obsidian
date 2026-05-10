(function () {
  function fix(s) {
    if (!s) return '';
    try { return decodeURIComponent(escape(s)); } catch { return s; }
  }

  function parse(raw) {
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch {
      throw new Error('Invalid JSON. Please select a valid Instagram messages JSON file.');
    }
    if (!data.messages || !Array.isArray(data.messages))
      throw new Error('This JSON does not look like an Instagram messages export (no "messages" array).');

    const title = fix(data.title || '');
    const participants = (data.participants || []).map(p => fix(p.name));
    const messages = [...data.messages].reverse().map(m => {
      const sender = fix(m.sender_name || '');
      const ts     = m.timestamp_ms || 0;
      const text   = fix(m.content || '');
      let media = null;
      if (m.photos?.length)           media = { kind: 'photo',   count: m.photos.length };
      else if (m.videos?.length)      media = { kind: 'video',   count: m.videos.length };
      else if (m.audio_files?.length) media = { kind: 'audio' };
      else if (m.gifs?.length)        media = { kind: 'gif' };
      else if (m.sticker)             media = { kind: 'sticker' };
      else if (m.share)               media = { kind: 'share', link: m.share.link||'', title: fix(m.share.share_text||m.share.text||'') };
      else if (m.story_share)         media = { kind: 'story' };
      else if (m.reel_share)          media = { kind: 'reel' };
      const reactions = (m.reactions||[]).map(r=>fix(r.reaction)).join('');
      return { sender, ts, text, media, reactions };
    });
    return { title, participants, messages };
  }

  /* ── Helpers ── */
  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true});
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    const diff = Math.floor((Date.now()-d)/86400000);
    if (diff===0) return 'Today';
    if (diff===1) return 'Yesterday';
    return d.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
  }
  function fmtDateKey(ts) { // YYYY-MM-DD key for grouping
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
  function highlightText(text, query) {
    if (!query) return esc(text);
    const parts = text.split(new RegExp(`(${escRe(query)})`, 'i'));
    return parts.map((p,i) => i%2===1 ? `<mark class="search-hl">${esc(p)}</mark>` : esc(p)).join('');
  }

  function mkDateSep(dateStr, ts) {
    const el = document.createElement('div');
    el.className = 'ig-date-sep'; el.dataset.date = dateStr;
    el.innerHTML = `<span>${fmtDate(ts)}</span>`;
    return el;
  }

  function waveformHtml(n=14) {
    const h=[4,8,12,16,20,14,18,22,16,12,20,14,10,6];
    return h.slice(0,n).map(v=>`<div class="ig-voice-bar" style="height:${v}px"></div>`).join('');
  }

  function renderMedia(m) {
    switch(m.kind) {
      case 'photo':
        return `<div class="ig-img-placeholder"><div class="media-icon">📷</div><div class="media-label">${m.count>1?m.count+' Photos':'Photo'}</div></div>`;
      case 'video':
        return `<div class="ig-video-placeholder"><div class="play-btn">▶</div><div style="font-size:.72rem;opacity:.6;margin-top:.25rem">Video</div></div>`;
      case 'audio': {
        const id='ig-a-'+Math.random().toString(36).slice(2);
        return `<div class="ig-voice-wrap" id="${id}"><button class="ig-voice-play" onclick="toggleAudio('${id}')">▶</button><div class="ig-voice-waveform">${waveformHtml()}</div></div>`;
      }
      case 'gif':
        return `<div class="ig-img-placeholder"><div class="media-icon">🎞️</div><div class="media-label">GIF</div></div>`;
      case 'sticker':
        return `<div style="font-size:3rem;padding:.25rem;line-height:1">🎭</div>`;
      case 'story':
        return `<div class="ig-share-card"><div class="ig-share-type">📖 Replied to a story</div></div>`;
      case 'reel':
        return `<div class="ig-share-card"><div class="ig-share-type">🎬 Shared a reel</div></div>`;
      case 'share': {
        const link = m.link ? `<a class="ig-share-card-link" href="${esc(m.link)}" target="_blank" rel="noopener">${esc(m.link.length>50?m.link.slice(0,50)+'…':m.link)}</a>` : '';
        const title = m.title ? `<div class="ig-share-card-title">${esc(m.title)}</div>` : '<div class="ig-share-card-title">Shared</div>';
        return `<div class="ig-share-card"><div class="ig-share-card-header"><div class="ig-share-card-icon">📎</div>${title}</div>${link}</div>`;
      }
      default:
        return `<div class="ig-img-placeholder"><div class="media-icon">📎</div><div class="media-label">Attachment</div></div>`;
    }
  }

  function buildRow(msg, myName, searchQuery) {
    if (!msg.text && !msg.media) return null;
    const sent = msg.sender === myName;
    const row = document.createElement('div');
    row.className = `ig-row ${sent ? 'sent' : 'received'}`;
    let html = '';
    if (!sent) html += `<div class="ig-name">${esc(msg.sender)}</div>`;
    if (msg.media) {
      html += renderMedia(msg.media);
      if (msg.text) html += `<div class="ig-bubble" style="margin-top:.25rem">${highlightText(msg.text, searchQuery).replace(/\n/g,'<br>')}</div>`;
    } else {
      html += `<div class="ig-bubble">${highlightText(msg.text, searchQuery).replace(/\n/g,'<br>')}</div>`;
    }
    if (msg.reactions) html += `<div class="ig-reactions">${msg.reactions}</div>`;
    html += `<div class="ig-time">${fmtTime(msg.ts)}</div>`;
    row.innerHTML = html;
    return row;
  }

  /* ── renderRange ──
     msgs:        array to render from
     start/end:   slice indices
     myName:      sender for sent/received classification
     container:   DOM element
     prepend:     insert before existing content
     prevDateKey: date key of last message before start (dedup separators)
     searchQuery: string to highlight
  */
  function renderRange(msgs, start, end, myName, container, prepend, prevDateKey, searchQuery) {
    prepend     = prepend || false;
    prevDateKey = prevDateKey || null;
    searchQuery = (searchQuery || '').toLowerCase();

    const frag = document.createDocumentFragment();
    let lastKey = prevDateKey;

    for (let i = start; i < Math.min(end, msgs.length); i++) {
      const msg = msgs[i];
      const key = fmtDateKey(msg.ts);
      if (key !== lastKey) {
        lastKey = key;
        frag.appendChild(mkDateSep(key, msg.ts));
      }
      const row = buildRow(msg, myName, searchQuery);
      if (row) frag.appendChild(row);
    }

    if (prepend) {
      const firstExisting = container.querySelector('.ig-date-sep');
      if (firstExisting && lastKey === firstExisting.dataset.date) firstExisting.remove();
      container.insertBefore(frag, container.firstChild);
    } else {
      container.appendChild(frag);
    }

    return lastKey;
  }

  function uniqueDates(msgs) { // returns [{key, label, ts}]
    const seen = new Set();
    const result = [];
    for (const m of msgs) {
      const key = fmtDateKey(m.ts);
      if (!seen.has(key)) { seen.add(key); result.push({ key, label: fmtDate(m.ts), ts: m.ts }); }
    }
    return result;
  }

  window.InstagramParser = { parse, renderRange, uniqueDates };
})();
