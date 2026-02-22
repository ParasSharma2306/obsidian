// Constants
const BATCH_SIZE = 50;
const COLORS = ['#e542a3', '#1f7aec', '#d44638', '#2ecc71', '#f39c12', '#9b59b6', '#3498db', '#1abc9c'];

// State
let globalMessages = [];
let messageOnlyCount = 0;
let myName = '';
let renderRange = { start: 0, end: 0 };
let colorMap = {};
let searchResultsIDs = [];
let searchPointer = -1;
let inferredDateOrder = 'DMY';
let profileObjectUrl = '';

// UI selector
const $ = (id) => document.getElementById(id);

// Initialization
window.onload = () => {
    const loader = $('loader');
    const bar = document.querySelector('.fill');
    const sidebar = $('sidebar');

    if (bar) {
        setTimeout(() => {
            bar.style.width = '100%';
        }, 100);
    }

    if (loader) {
        setTimeout(() => {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }, 800);
    }

    if (sidebar && window.innerWidth <= 800) {
        setSidebarState(true);
    }
};

window.addEventListener('resize', () => {
    if (window.innerWidth > 800) {
        setSidebarState(false);
    }
});

const dateJumpAction = $('date-jump-action');
if (dateJumpAction) {
    dateJumpAction.addEventListener('click', handleDateJumpAction);
}

const dateSheetEl = $('date-sheet');
const dateSheetInputEl = $('date-sheet-input');
const dateSheetCancelEl = $('date-sheet-cancel');
const dateSheetApplyEl = $('date-sheet-apply');

if (dateSheetEl) {
    dateSheetEl.addEventListener('click', (event) => {
        if (event.target === dateSheetEl) {
            closeDateSheet();
        }
    });
}

if (dateSheetCancelEl) {
    dateSheetCancelEl.addEventListener('click', closeDateSheet);
}

if (dateSheetApplyEl) {
    dateSheetApplyEl.addEventListener('click', applyDateSheetSelection);
}

if (dateSheetInputEl) {
    dateSheetInputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            applyDateSheetSelection();
        }
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dateSheetEl && !dateSheetEl.hidden) {
        closeDateSheet();
    }
});

// File input listener
const fileInputEl = $('file-input');
if (fileInputEl) {
    fileInputEl.addEventListener('change', (e) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const fileName = e.target.files[0].name;
        const dropTarget = $('drop-target');
        if (!dropTarget) return;

        const dropP = dropTarget.querySelector('p');
        const dropI = dropTarget.querySelector('i');

        if (dropP) {
            dropP.innerHTML = `<strong>${escapeHtml(fileName)}</strong><br><span style="font-size:12px;opacity:0.7">Ready</span>`;
        }

        if (dropI) {
            dropI.className = 'ph-fill ph-check-circle';
            dropI.style.color = '#00a884';
        }

        dropTarget.style.borderColor = '#00a884';
        dropTarget.style.background = 'rgba(0, 168, 132, 0.1)';
    });
}

// Core process
async function initViewer() {
    const fileInput = $('file-input');
    const nameInput = $('display-name');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast('Please select a file');
        return;
    }

    if (!nameInput || !nameInput.value.trim()) {
        showToast('Enter your display name');
        return;
    }

    myName = nameInput.value.trim();

    if (window.innerWidth <= 800) {
        setSidebarState(false);
    }

    const file = fileInput.files[0];
    let rawText = '';

    try {
        if (file.name.toLowerCase().endsWith('.zip')) {
            if (typeof JSZip === 'undefined') {
                throw new Error('Zip support is not available right now. Please refresh and try again.');
            }

            const zip = new JSZip();
            const contents = await zip.loadAsync(file);
            const chatFile = Object.keys(contents.files).find(
                (n) => n.toLowerCase().endsWith('.txt') && !n.startsWith('__MACOSX')
            );

            if (!chatFile) {
                throw new Error('No .txt file found in ZIP');
            }

            rawText = await contents.files[chatFile].async('string');
        } else {
            rawText = await readFile(file);
        }

        parseChatData(rawText);

        if (messageOnlyCount === 0) {
            showToast('No messages could be parsed. Check export format and display name.');
            return;
        }

        updateUIState(file.name);
    } catch (e) {
        showToast(`Error: ${e.message}`);
        console.error(e);
    }
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result || '');
        reader.onerror = () => reject(new Error('Unable to read file'));
        reader.readAsText(file, 'utf-8');
    });
}

// Parsing engine
function parseChatData(text) {
    globalMessages = [];
    messageOnlyCount = 0;
    colorMap = {};

    const lines = text.split(/\r?\n/);
    const regex = /^\[?(\d{1,4}[/-]\d{1,2}[/-]\d{1,4},?\s\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s(?:-\s)?([^:]+):\s(.*)$/;

    let lastDate = '';
    let mediaCount = 0;
    const senderStats = {};
    let lastMessageRef = null;

    lines.forEach((line, idx) => {
        const match = line.match(regex);

        if (match) {
            const rawTime = match[1].trim();
            const sender = match[2].trim();
            let content = match[3] || '';
            const dateStr = extractDatePart(rawTime);

            if (dateStr && dateStr !== lastDate) {
                globalMessages.push({ type: 'date', content: dateStr, id: `sys-${idx}` });
                lastDate = dateStr;
            }

            if (/^<media omitted>$/i.test(content.trim())) {
                content = '[Media omitted]';
                mediaCount += 1;
            }

            senderStats[sender] = (senderStats[sender] || 0) + 1;
            messageOnlyCount += 1;

            const message = {
                type: 'msg',
                id: idx,
                time: extractTimePart(rawTime),
                sender,
                content,
                isMe: isMeSender(sender)
            };

            globalMessages.push(message);
            lastMessageRef = message;
            return;
        }

        // Multiline continuation from WhatsApp exports
        if (lastMessageRef) {
            lastMessageRef.content += `\n${line}`;
        }
    });

    const dateLabels = globalMessages
        .filter((entry) => entry.type === 'date')
        .map((entry) => entry.content);
    inferredDateOrder = inferDateOrder(dateLabels);

    generateStats(senderStats, mediaCount);

    renderRange = {
        start: Math.max(0, globalMessages.length - BATCH_SIZE),
        end: globalMessages.length
    };

    renderChatList();
    scrollToBottom();
}

// Analytics
function generateStats(senders, media) {
    const totalEl = $('stat-total');
    const mediaEl = $('stat-media');
    const list = $('stats-list');

    if (totalEl) totalEl.innerText = messageOnlyCount.toLocaleString();
    if (mediaEl) mediaEl.innerText = media.toLocaleString();

    if (!list) return;

    const sorted = Object.entries(senders).sort((a, b) => b[1] - a[1]);
    const statsHtml = sorted.map(([name, count]) => {
        const pct = messageOnlyCount > 0 ? ((count / messageOnlyCount) * 100).toFixed(1) : '0.0';
        return `
            <div class="stat-row">
                <div class="stat-header">
                    <span class="stat-name">${escapeHtml(name)}</span>
                    <span class="stat-pct">${pct}% (${count})</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-val" style="width:${pct}%"></div>
                </div>
            </div>`;
    }).join('');

    list.innerHTML = statsHtml;
}

// Rendering
function renderChatList() {
    const list = $('message-list');
    if (!list) return;

    const slice = globalMessages.slice(renderRange.start, renderRange.end);
    let lastSender = null;
    const rows = [];

    slice.forEach((item) => {
        if (item.type === 'date') {
            rows.push(`<div class="system-msg sticky-date" id="msg-${item.id}">${escapeHtml(item.content)}</div>`);
            lastSender = null;
            return;
        }

        const isFirst = item.sender !== lastSender;
        const tailClass = isFirst ? (item.isMe ? 'tail-out' : 'tail-in') : '';
        const rowClass = `msg-row ${item.isMe ? 'sent' : 'received'} ${isFirst ? 'tail' : ''} ${tailClass}`;
        const nameHtml = !item.isMe && isFirst
            ? `<div class="sender" style="color:${getColor(item.sender)}">${escapeHtml(item.sender)}</div>`
            : '';

        const bodyHtml = formatMessageContent(item.content);
        const readTick = item.isMe ? '<i class="ph-bold ph-checks" style="color:#53bdeb"></i>' : '';

        const html = `
            <div class="${rowClass}" id="msg-${item.id}">
                <div class="bubble">
                    ${nameHtml}
                    <span class="msg-text">${bodyHtml}</span>
                    <div class="meta">
                        <span>${escapeHtml(item.time)}</span>
                        ${readTick}
                    </div>
                </div>
            </div>`;

        rows.push(html);
        lastSender = item.sender;
    });

    list.innerHTML = rows.join('');
}

// Lazy load
const viewport = $('viewport');
if (viewport) {
    viewport.addEventListener('scroll', (e) => {
        const el = e.target;

        if (el.scrollTop === 0 && renderRange.start > 0) {
            const oldHeight = el.scrollHeight;
            renderRange.start = Math.max(0, renderRange.start - BATCH_SIZE);
            renderChatList();
            const newHeight = el.scrollHeight;
            el.scrollTop = newHeight - oldHeight;
        }

        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20 && renderRange.end < globalMessages.length) {
            renderRange.end = Math.min(globalMessages.length, renderRange.end + BATCH_SIZE);
            renderChatList();
        }
    });
}

function scrollToBottom() {
    const v = $('viewport');
    if (v) v.scrollTop = v.scrollHeight;
}

function jumpToBottom() {
    closeMenu();

    if (globalMessages.length > 0) {
        renderRange.start = Math.max(0, globalMessages.length - BATCH_SIZE);
        renderRange.end = globalMessages.length;
        renderChatList();
    }

    requestAnimationFrame(() => {
        scrollToBottom();
    });
}

// Search
function handleSearch(query) {
    const liveSearch = $('live-search');
    const normalized = (query || '').trim().toLowerCase();

    if (!normalized || normalized.length < 2) {
        searchResultsIDs = [];
        searchPointer = -1;
        if ($('search-counter')) $('search-counter').innerText = '';
        renderChatList();
        return;
    }

    searchResultsIDs = globalMessages
        .filter((m) => m.type === 'msg' && m.content.toLowerCase().includes(normalized))
        .map((m) => m.id);

    const count = searchResultsIDs.length;
    if (count === 0) {
        searchPointer = -1;
        if ($('search-counter')) $('search-counter').innerText = 'No matches';
        return;
    }

    searchPointer = 0;
    jumpToMessage(searchResultsIDs[searchPointer]);

    if ($('search-counter')) {
        $('search-counter').innerText = `${searchPointer + 1}/${count}`;
    }

    if (liveSearch && liveSearch.value !== query) {
        liveSearch.value = query;
    }
}

function navSearch(dir) {
    if (searchResultsIDs.length === 0) return;

    if (dir === 'up') {
        searchPointer -= 1;
    } else {
        searchPointer += 1;
    }

    if (searchPointer < 0) searchPointer = searchResultsIDs.length - 1;
    if (searchPointer >= searchResultsIDs.length) searchPointer = 0;

    jumpToMessage(searchResultsIDs[searchPointer]);

    if ($('search-counter')) {
        $('search-counter').innerText = `${searchPointer + 1}/${searchResultsIDs.length}`;
    }
}

function jumpToMessage(msgId) {
    const idx = globalMessages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;

    renderRange.start = Math.max(0, idx - 40);
    renderRange.end = Math.min(globalMessages.length, idx + 40);
    renderChatList();

    setTimeout(() => {
        const el = document.getElementById(`msg-${msgId}`);
        if (!el) return;

        el.scrollIntoView({ block: 'center', behavior: 'auto' });

        const txt = el.querySelector('.msg-text');
        const queryInput = $('live-search');
        const query = (queryInput?.value || '').trim();

        if (!txt || !query) return;

        const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
        txt.innerHTML = txt.innerText.replace(regex, '<span class="hl focus">$1</span>');
    }, 50);
}

// Utilities
function formatMessageContent(text) {
    const escaped = escapeHtml(text || '');

    return escaped
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\*(.*?)\*/g, '<strong>$1</strong>');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDatePart(rawTime) {
    return rawTime.match(/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/)?.[0] || '';
}

function extractTimePart(rawTime) {
    return rawTime.match(/\d{1,2}:\d{2}(?::\d{2})?\s?(?:[APap][Mm])?/)?.[0] || rawTime;
}

function isMeSender(sender) {
    return sender.toLowerCase() === myName.toLowerCase() || sender === 'You';
}

function getColor(name) {
    if (!colorMap[name]) {
        let hash = 0;
        for (let i = 0; i < name.length; i += 1) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        colorMap[name] = COLORS[Math.abs(hash) % COLORS.length];
    }
    return colorMap[name];
}

function parseExportDateLabel(label) {
    return parseLabelWithOrder(label, inferredDateOrder);
}

function parseLabelWithOrder(label, order) {
    const rawParts = (label || '').split(/[/-]/).map((part) => part.trim());
    if (rawParts.length !== 3) return null;

    const [aRaw, bRaw, cRaw] = rawParts;
    const a = parseInt(aRaw, 10);
    const b = parseInt(bRaw, 10);
    const c = parseInt(cRaw, 10);
    if ([a, b, c].some((n) => Number.isNaN(n))) return null;

    if (order === 'YMD') {
        if (aRaw.length !== 4) return null;
        return createDateStrict(normalizeYear(a), b, c);
    }
    if (order === 'MDY') {
        return createDateStrict(normalizeYear(c), a, b);
    }
    return createDateStrict(normalizeYear(c), b, a);
}

function normalizeYear(year) {
    if (year >= 100) return year;
    return year >= 70 ? year + 1900 : year + 2000;
}

function createDateStrict(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const date = new Date(year, month - 1, day);
    if (
        date.getFullYear() !== year
        || date.getMonth() !== month - 1
        || date.getDate() !== day
    ) {
        return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
}

function inferDateOrder(dateLabels) {
    const labels = (dateLabels || []).filter(Boolean);
    if (labels.length === 0) return getTieBreakDateOrder();

    const candidates = ['DMY', 'MDY', 'YMD'];
    let bestOrder = getTieBreakDateOrder();
    let bestScore = -Infinity;

    candidates.forEach((order) => {
        const score = scoreDateOrder(labels, order);
        if (score > bestScore) {
            bestScore = score;
            bestOrder = order;
        }
    });

    return bestOrder;
}

function scoreDateOrder(labels, order) {
    let valid = 0;
    let invalid = 0;
    let monotonic = 0;
    let prevMs = null;

    labels.forEach((label) => {
        const date = parseLabelWithOrder(label, order);
        if (!date) {
            invalid += 1;
            return;
        }

        valid += 1;
        const ms = date.getTime();
        if (prevMs !== null) {
            monotonic += ms >= prevMs ? 1 : -1;
        }
        prevMs = ms;
    });

    return (valid * 4) + (monotonic * 2) - (invalid * 6);
}

function getTieBreakDateOrder() {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    return locale.toLowerCase().startsWith('en-us') ? 'MDY' : 'DMY';
}

function updateUIState(filename) {
    if ($('upload-panel')) $('upload-panel').classList.add('hidden');
    if ($('chat-list-panel')) $('chat-list-panel').classList.remove('hidden');
    if ($('empty-state')) $('empty-state').classList.add('hidden');

    const cleanName = filename.replace(/(_chat\.txt|WhatsApp Chat with |\.\w+$)/g, '').trim() || 'Chat History';

    if ($('sidebar-title')) $('sidebar-title').innerText = cleanName;
    if ($('header-name')) $('header-name').innerText = cleanName;
    if ($('header-meta')) $('header-meta').innerText = `${messageOnlyCount.toLocaleString()} messages`;
    if ($('sidebar-sub')) $('sidebar-sub').innerText = 'Loaded successfully';
}

// UI toggles
function openDrawer(id) {
    const drawer = $(`${id}-drawer`);
    if (drawer) drawer.classList.add('open');
}

function closeDrawer(id) {
    const drawer = $(`${id}-drawer`);
    if (drawer) drawer.classList.remove('open');
}

function toggleSidebar() {
    const sidebar = $('sidebar');
    if (!sidebar) return;

    const willOpen = !sidebar.classList.contains('active');
    setSidebarState(willOpen);
}

function setSidebarState(isOpen) {
    const sidebar = $('sidebar');
    const backdrop = $('sidebar-backdrop');

    if (sidebar) {
        sidebar.classList.toggle('active', isOpen);
    }

    if (backdrop) {
        backdrop.classList.toggle('active', isOpen);
    }
}

function handleChatSelect() {
    if (window.innerWidth > 800) return;

    const sidebar = $('sidebar');
    if (sidebar?.classList.contains('active')) {
        setSidebarState(false);
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-theme');
}

function toggleSearch() {
    const bar = $('search-toolbar');
    const input = $('live-search');

    if (!bar) return;

    bar.classList.toggle('active');
    if (bar.classList.contains('active')) {
        if (input) input.focus();
        return;
    }

    if (input) input.value = '';
    searchResultsIDs = [];
    searchPointer = -1;

    if ($('search-counter')) $('search-counter').innerText = '';

    renderRange = {
        start: Math.max(0, globalMessages.length - BATCH_SIZE),
        end: globalMessages.length
    };

    renderChatList();
    scrollToBottom();
}

function showToast(msg) {
    const toast = $('toast');
    if (!toast) return;

    toast.innerText = msg;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

async function copyUPI() {
    try {
        await navigator.clipboard.writeText('paras2326@fam');
        showToast('UPI ID copied');
    } catch (error) {
        showToast('Could not copy UPI ID');
        console.error(error);
    }
}

const pfpInput = $('pfp-upload');
if (pfpInput) {
    pfpInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (profileObjectUrl) {
            URL.revokeObjectURL(profileObjectUrl);
        }

        const objectUrl = URL.createObjectURL(file);
        profileObjectUrl = objectUrl;

        if ($('my-pfp-img')) $('my-pfp-img').src = objectUrl;
        if ($('drawer-pfp-img')) $('drawer-pfp-img').src = objectUrl;

        const headerPfp = document.querySelector('.header-pfp');
        if (headerPfp) headerPfp.src = objectUrl;
    });
}

function closeMenu() {
    const menu = $('header-menu');
    if (!menu) return;

    menu.classList.remove('show');
    document.removeEventListener('click', closeMenuOutside);
    document.removeEventListener('keydown', closeMenuOnEscape);
}

function toggleMenu() {
    const menu = $('header-menu');
    if (!menu) return;

    const willOpen = !menu.classList.contains('show');
    if (!willOpen) {
        closeMenu();
        return;
    }

    menu.classList.add('show');
    document.addEventListener('click', closeMenuOutside);
    document.addEventListener('keydown', closeMenuOnEscape);
}

function closeMenuOutside(e) {
    const menu = $('header-menu');
    const button = document.querySelector('.menu-container button');

    if (!menu || !button) return;
    if (!menu.contains(e.target) && !button.contains(e.target)) {
        closeMenu();
    }
}

function closeMenuOnEscape(e) {
    if (e.key === 'Escape') {
        if (dateSheetEl && !dateSheetEl.hidden) {
            closeDateSheet();
            return;
        }
        closeMenu();
    }
}

function handleDateJumpAction(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    triggerDateJump();
}

function triggerDateJump() {
    closeMenu();

    if (globalMessages.length === 0) {
        showToast('Load a chat first');
        return;
    }

    openDateSheet();
}

function openDateSheet() {
    if (!dateSheetEl || !dateSheetInputEl) return;

    dateSheetInputEl.value = '';
    dateSheetEl.hidden = false;
    requestAnimationFrame(() => {
        dateSheetEl.classList.add('open');
    });

    setTimeout(() => {
        try {
            dateSheetInputEl.focus({ preventScroll: true });
        } catch (error) {
            // Best effort only.
        }
    }, 40);
}

function closeDateSheet() {
    if (!dateSheetEl) return;

    dateSheetEl.classList.remove('open');
    setTimeout(() => {
        if (!dateSheetEl.classList.contains('open')) {
            dateSheetEl.hidden = true;
        }
    }, 160);
}

function applyDateSheetSelection() {
    const selectedDate = dateSheetInputEl?.value || '';
    if (!selectedDate) {
        showToast('Select a date');
        return;
    }

    closeDateSheet();
    handleDateSelection(selectedDate);
}

function handleDateSelection(dateVal) {
    const dateInput = $('date-jumper');
    if (dateInput) {
        dateInput.classList.remove('open');
    }
    closeDateSheet();

    if (!dateVal || globalMessages.length === 0) return;

    const targetDate = new Date(`${dateVal}T00:00:00`);
    if (Number.isNaN(targetDate.getTime())) {
        showToast('Invalid date format');
        return;
    }

    targetDate.setHours(0, 0, 0, 0);

    const targetMs = targetDate.getTime();
    let exactIndex = -1;
    let bestBeforeIndex = -1;
    let bestBeforeMs = -Infinity;
    let bestAfterIndex = -1;
    let bestAfterMs = Infinity;

    for (let i = 0; i < globalMessages.length; i += 1) {
        const entry = globalMessages[i];
        if (entry.type !== 'date') continue;

        const parsed = parseExportDateLabel(entry.content);
        if (!parsed) continue;

        const ms = parsed.getTime();
        if (ms === targetMs && exactIndex === -1) {
            exactIndex = i;
        }

        if (ms <= targetMs && ms > bestBeforeMs) {
            bestBeforeMs = ms;
            bestBeforeIndex = i;
        }

        if (ms >= targetMs && ms < bestAfterMs) {
            bestAfterMs = ms;
            bestAfterIndex = i;
        }
    }

    // Never jump ahead automatically.
    const bestIndex = exactIndex !== -1 ? exactIndex : bestBeforeIndex;
    if (bestIndex === -1) {
        if (bestAfterIndex !== -1) {
            showToast('No messages on/before selected date');
        } else {
            showToast('No valid date markers found in chat');
        }
        return;
    }

    // Start rendering exactly from the matched date marker so jump lands at day start.
    renderRange.start = Math.max(0, bestIndex);
    renderRange.end = Math.min(globalMessages.length, bestIndex + (BATCH_SIZE * 2));
    renderChatList();

    setTimeout(() => {
        const firstMessageIndex = findFirstMessageIndexForDate(bestIndex);
        const targetIndex = firstMessageIndex !== -1 ? firstMessageIndex : bestIndex;
        const targetId = `msg-${globalMessages[targetIndex].id}`;
        const el = document.getElementById(targetId);

        if (el) {
            el.scrollIntoView({ block: 'start', behavior: 'auto' });
            const jumpDateLabel = globalMessages[bestIndex].content;
            if (exactIndex !== -1) {
                showToast(`Jumped to ${jumpDateLabel}`);
            } else {
                showToast(`Closest previous date: ${jumpDateLabel}`);
            }
        } else {
            showToast('Date loaded but could not scroll to marker');
        }
    }, 60);
}

function findFirstMessageIndexForDate(dateMarkerIndex) {
    for (let i = dateMarkerIndex + 1; i < globalMessages.length; i += 1) {
        const entry = globalMessages[i];
        if (entry.type === 'date') return -1;
        if (entry.type === 'msg') return i;
    }
    return -1;
}
