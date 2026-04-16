const BATCH_SIZE = 60;
const COLORS = ["#e542a3", "#1f7aec", "#d44638", "#2ecc71", "#f39c12", "#9b59b6", "#3498db", "#1abc9c"];
const STORAGE_KEYS = {
    theme: "obsidian-theme"
};

const state = {
    messages: [],
    filteredMessages: [],
    messageOnlyCount: 0,
    myName: "",
    renderRange: { start: 0, end: 0 },
    colorMap: {},
    senderStats: {},
    mediaCount: 0,
    mediaStore: new Map(),
    mediaLookup: new Map(),
    mediaUrls: [],
    mediaMissingCount: 0,
    searchResults: [],
    searchPointer: -1,
    inferredDateOrder: "DMY",
    profileObjectUrl: "",
    activeTheme: "dark",
    activeMediaId: "",
    chatTitle: "Chat History",
    toastTimer: null,
    isSearchOpen: false,
    isLoading: false,
    mediaObserver: null
};

const $ = (id) => document.getElementById(id);
const q = (selector, root = document) => root.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
    bindUI();
    applySavedTheme();
    runLoader();

    // Force the sidebar menu to open by default on mobile screens
    if (window.innerWidth <= 800) {
        setSidebarState(true);
    }
});

window.addEventListener("resize", () => {
    if (window.innerWidth > 800) {
        setSidebarState(false);
    }
});

window.addEventListener("beforeunload", cleanupObjectUrls);

function bindUI() {
    $("open-profile")?.addEventListener("click", () => openDrawer("profile"));
    $("open-stats")?.addEventListener("click", () => openDrawer("stats"));
    $("open-info")?.addEventListener("click", () => openDrawer("info"));
    $("theme-toggle")?.addEventListener("click", toggleTheme);
    $("mobile-menu")?.addEventListener("click", toggleSidebar);
    $("sidebar-backdrop")?.addEventListener("click", toggleSidebar);
    $("chat-list-item")?.addEventListener("click", handleChatSelect);
    $("load-chat")?.addEventListener("click", initViewer);
    $("copy-upi")?.addEventListener("click", copyUPI);
    $("open-pfp-upload")?.addEventListener("click", () => $("pfp-upload")?.click());
    $("drop-target")?.addEventListener("click", () => $("file-input")?.click());
    $("file-input")?.addEventListener("change", handleFileInputChange);
    $("pfp-upload")?.addEventListener("change", handleProfilePictureChange);
    $("search-toggle")?.addEventListener("click", toggleSearch);
    $("search-close")?.addEventListener("click", toggleSearch);
    $("search-up")?.addEventListener("click", () => navSearch("up"));
    $("search-down")?.addEventListener("click", () => navSearch("down"));
    $("live-search")?.addEventListener("input", (event) => handleSearch(event.target.value));
    $("menu-toggle")?.addEventListener("click", toggleMenu);
    $("date-jump-action")?.addEventListener("click", handleDateJumpAction);
    $("jump-bottom-action")?.addEventListener("click", jumpToBottom);
    $("date-sheet-cancel")?.addEventListener("click", closeDateSheet);
    $("date-sheet-apply")?.addEventListener("click", applyDateSheetSelection);
    $("date-sheet")?.addEventListener("click", (event) => {
        if (event.target === $("date-sheet")) {
            closeDateSheet();
        }
    });
    $("date-sheet-input")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            applyDateSheetSelection();
        }
    });
    $("media-modal-close")?.addEventListener("click", closeMediaModal);
    $("media-modal-backdrop")?.addEventListener("click", closeMediaModal);
    $("viewport")?.addEventListener("scroll", handleViewportScroll);
    $("message-list")?.addEventListener("click", handleMessageListClick);
    $("display-name")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !state.isLoading) {
            initViewer();
        }
    });

    document.querySelectorAll("[data-drawer-close]").forEach((button) => {
        button.addEventListener("click", () => closeDrawer(button.dataset.drawerClose));
    });

    setupDropTarget();

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleGlobalKeydown);
}

function runLoader() {
    const loader = $("loader");
    const bar = q(".fill");

    if (bar) {
        window.setTimeout(() => {
            bar.style.width = "100%";
        }, 100);
    }

    if (loader) {
        window.setTimeout(() => {
            loader.style.opacity = "0";
            window.setTimeout(() => {
                loader.style.display = "none";
            }, 500);
        }, 800);
    }
}

function applySavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    if (saved === "light") {
        document.body.classList.add("light-theme");
        state.activeTheme = "light";
    } else {
        document.body.classList.remove("light-theme");
        state.activeTheme = "dark";
    }
    syncThemeButton();
}

function toggleTheme() {
    document.body.classList.toggle("light-theme");
    state.activeTheme = document.body.classList.contains("light-theme") ? "light" : "dark";
    localStorage.setItem(STORAGE_KEYS.theme, state.activeTheme);
    syncThemeButton();
}

function syncThemeButton() {
    const icon = q("#theme-toggle i");
    const themeColor = q('meta[name="theme-color"]');
    if (icon) {
        icon.className = state.activeTheme === "light" ? "ph ph-sun-dim" : "ph ph-moon-stars";
    }
    if (themeColor) {
        themeColor.setAttribute("content", state.activeTheme === "light" ? "#f0f2f5" : "#111b21");
    }
}

function setupDropTarget() {
    const dropTarget = $("drop-target");
    if (!dropTarget) return;

    ["dragenter", "dragover"].forEach((eventName) => {
        dropTarget.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropTarget.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        dropTarget.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropTarget.classList.remove("dragover");
        });
    });

    dropTarget.addEventListener("drop", (event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const fileInput = $("file-input");
        if (!fileInput) return;

        fileInput.files = files;
        reflectSelectedFile(files[0]);
    });
}

function handleFileInputChange(event) {
    const file = event.target.files?.[0];
    if (file) {
        reflectSelectedFile(file);
    }
}

function reflectSelectedFile(file) {
    const dropTarget = $("drop-target");
    if (!dropTarget) return;

    const icon = q("i", dropTarget);
    const label = q("p", dropTarget);

    dropTarget.classList.add("ready");
    if (icon) {
        icon.className = "ph-fill ph-check-circle";
        icon.style.color = "#00a884";
    }
    if (label) {
        label.innerHTML = `<strong>${escapeHtml(file.name)}</strong><br><span style="font-size:12px;opacity:0.7">Ready to load</span>`;
    }
}

async function initViewer() {
    if (state.isLoading) return;

    const fileInput = $("file-input");
    const nameInput = $("display-name");
    const file = fileInput?.files?.[0];
    const displayName = nameInput?.value.trim();

    if (!file) {
        showToast("Please select a file");
        return;
    }
    if (!displayName) {
        showToast("Enter your display name");
        return;
    }

    state.myName = displayName;
    
    // Specifically warn the user if it's a ZIP file since unzipping takes the longest
    const isZip = file.name.toLowerCase().endsWith(".zip");
    const initText = isZip ? "Unzipping and extracting media into memory... This might take a minute for large files." : "Reading text file...";
    
    setLoadingState(true, `Loading ${file.name}`, initText);
    
    // DOUBLE YIELD: Guarantees the browser paints the loading screen BEFORE JSZip freezes the computer
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => setTimeout(resolve, 60));

    cleanupMediaStore();
    resetChatState();

    if (window.innerWidth <= 800) {
        setSidebarState(false);
    }

    try {
        const { rawText, attachments } = await loadChatExport(file);
        
        updateLoadingCopy(
            attachments.length
                ? `Matched ${attachments.length.toLocaleString()} attachments. Parsing messages...`
                : "Parsing messages..."
        );
        
        // YIELD again to show the "Matched X attachments" text
        await new Promise(resolve => setTimeout(resolve, 30));
        
        buildMediaStore(attachments);
        await parseChatData(rawText);

        if (state.messageOnlyCount === 0) {
            showToast("No messages could be parsed. Check export format and display name.");
            return;
        }

        updateUIState(file.name);
        renderChatList();
        requestAnimationFrame(scrollToBottom);
        showToast(`Loaded ${state.messageOnlyCount.toLocaleString()} messages`);
    } catch (error) {
        console.error(error);
        showToast(`Error: ${error.message}`);
    } finally {
        setLoadingState(false);
    }
}

async function loadChatExport(file) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
        return {
            rawText: await readFileAsText(file),
            attachments: []
        };
    }

    if (typeof JSZip === "undefined") {
        throw new Error("Zip support is not available right now. Please refresh and try again.");
    }

    const zip = await new JSZip().loadAsync(file);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith("__MACOSX"));
    const chatEntry = entries.find((entry) => entry.name.toLowerCase().endsWith(".txt"));

    if (!chatEntry) {
        throw new Error("No .txt file found in ZIP");
    }

    const attachments = await Promise.all(
        entries
            .filter((entry) => entry.name !== chatEntry.name)
            .map(async (entry) => {
                const blob = await entry.async("blob");
                return {
                    name: baseName(entry.name),
                    path: entry.name,
                    blob
                };
            })
    );

    return {
        rawText: await chatEntry.async("string"),
        attachments
    };
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(String(event.target?.result || ""));
        reader.onerror = () => reject(new Error("Unable to read file"));
        reader.readAsText(file, "utf-8");
    });
}

function resetChatState() {
    state.messages = [];
    state.filteredMessages = [];
    state.messageOnlyCount = 0;
    state.colorMap = {};
    state.senderStats = {};
    state.mediaCount = 0;
    state.mediaMissingCount = 0;
    state.searchResults = [];
    state.searchPointer = -1;
    state.inferredDateOrder = "DMY";
    state.activeMediaId = "";
    disconnectMediaObserver();
    updateSearchCounter();
    $("message-list").innerHTML = "";
}

function cleanupMediaStore() {
    state.mediaUrls.forEach((url) => URL.revokeObjectURL(url));
    state.mediaUrls = [];
    state.mediaStore.clear();
    state.mediaLookup.clear();
    disconnectMediaObserver();
    closeMediaModal();
}

function cleanupObjectUrls() {
    cleanupMediaStore();
    if (state.profileObjectUrl) {
        URL.revokeObjectURL(state.profileObjectUrl);
        state.profileObjectUrl = "";
    }
}

function buildMediaStore(attachments) {
    attachments.forEach((attachment, index) => {
        const fileName = attachment.name;
        const mediaType = detectMediaType(fileName, attachment.blob.type);
        const objectUrl = URL.createObjectURL(attachment.blob);
        const id = `media-${index}-${normalizeLookupKey(fileName)}`;

        const media = {
            id,
            name: fileName,
            path: attachment.path,
            kind: mediaType.kind,
            mime: mediaType.mime,
            ext: mediaType.ext,
            size: attachment.blob.size,
            url: objectUrl,
            hasLoaded: false // State persistence for lazy loading
        };

        state.mediaStore.set(id, media);
        state.mediaUrls.push(objectUrl);

        const keys = new Set([
            normalizeLookupKey(fileName),
            normalizeLookupKey(attachment.path),
            normalizeLookupKey(stripAttachmentPrefix(fileName))
        ]);

        keys.forEach((key) => {
            if (key && !state.mediaLookup.has(key)) {
                state.mediaLookup.set(key, media);
            }
        });
    });
}

function createMessageEntry(index, rawTime, sender, rawContent) {
    const message = {
        type: "msg",
        id: `msg-${index}`,
        time: extractTimePart(rawTime),
        sender,
        isMe: isMeSender(sender),
        text: "",
        rawContent,
        mediaItems: []
    };

    const parsed = parseMessageContent(rawContent);
    message.text = parsed.text;
    message.mediaItems = parsed.mediaItems;

    state.senderStats[sender] = (state.senderStats[sender] || 0) + 1;
    state.messageOnlyCount += 1;
    state.mediaCount += parsed.mediaItems.length;
    state.mediaMissingCount += parsed.mediaItems.filter((item) => item.status === "missing").length;

    return message;
}

function extractAttachmentTokens(text) {
    const matches = [];
    const patterns = [
        /<attached:\s*([^>]+)>/gi,
        /\u200e?([^()\n]+?\.[a-z0-9]{2,5})\s+\((?:file attached|datei angehängt)\)/gi
    ];

    patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            matches.push({
                raw: match[0],
                fileName: match[1].trim()
            });
        }
    });

    return matches;
}

function looksLikeStandaloneAttachment(text) {
    const value = (text || "").trim();
    if (!value || /\s{2,}/.test(value)) return false;
    if (/^(https?:\/\/)/i.test(value)) return false;
    return /^[^\n]+\.(jpg|jpeg|png|webp|gif|mp4|mov|avi|m4v|mp3|m4a|opus|ogg|oga|aac|wav|pdf|docx?|xlsx?|pptx?|vcf|zip|webm|heic|heif)$/i.test(value);
}

function resolveAttachment(fileName) {
    const media = findMediaByName(fileName);
    if (!media) {
        return createMissingMediaItem(fileName);
    }

    return {
        id: media.id,
        status: "available",
        name: media.name,
        kind: media.kind,
        mime: media.mime,
        size: media.size,
        url: media.url
    };
}

function createMissingMediaItem(fileName) {
    return {
        id: `missing-${normalizeLookupKey(fileName)}-${Math.random().toString(36).slice(2, 8)}`,
        status: "missing",
        name: fileName,
        kind: "missing",
        mime: "",
        size: 0,
        url: ""
    };
}

function findMediaByName(fileName) {
    const candidates = [
        normalizeLookupKey(fileName),
        normalizeLookupKey(stripAttachmentPrefix(fileName)),
        normalizeLookupKey(baseName(fileName))
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (state.mediaLookup.has(candidate)) {
            return state.mediaLookup.get(candidate);
        }
    }

    return null;
}

function generateStats() {
    $("stat-total").innerText = state.messageOnlyCount.toLocaleString();
    $("stat-media").innerText = state.mediaCount.toLocaleString();

    const list = $("stats-list");
    if (!list) return;

    const sorted = Object.entries(state.senderStats).sort((a, b) => b[1] - a[1]);
    list.innerHTML = sorted.map(([name, count]) => {
        const pct = state.messageOnlyCount ? ((count / state.messageOnlyCount) * 100).toFixed(1) : "0.0";
        return `
            <div class="stat-row">
                <div class="stat-header">
                    <span class="stat-name">${escapeHtml(name)}</span>
                    <span class="stat-pct">${pct}% (${count})</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-val" style="width:${pct}%"></div>
                </div>
            </div>
        `;
    }).join("");
}

function renderChatList() {
    const list = $("message-list");
    if (!list) return;

    const slice = state.filteredMessages.slice(state.renderRange.start, state.renderRange.end);
    let lastSender = null;
    let html = "";

    slice.forEach((item) => {
        if (item.type === "date") {
            html += `<div class="system-msg sticky-date" id="${item.id}">${escapeHtml(item.content)}</div>`;
            lastSender = null;
            return;
        }

        if (item.type === "system") {
            html += `<div class="system-msg" id="${item.id}">${linkifyAndHighlight(item.content)}</div>`;
            lastSender = null;
            return;
        }

        const isFirst = item.sender !== lastSender;
        const tailClass = isFirst ? (item.isMe ? "tail-out" : "tail-in") : "";
        const rowClass = `msg-row ${item.isMe ? "sent" : "received"} ${isFirst ? "tail" : ""} ${tailClass}`.trim();
        const senderHtml = !item.isMe && isFirst
            ? `<div class="sender" style="color:${getColor(item.sender)}">${escapeHtml(item.sender)}</div>`
            : "";

        let textHtml = "";
        if (item.text) {
            const isCall = /^(Missed voice call|Missed video call|Voice call|Video call|null)$/i.test(item.text);
            
            if (isCall) {
                const isVideo = item.text.toLowerCase().includes("video");
                const isMissed = item.text.toLowerCase().includes("missed") || item.text === "null";
                const callIcon = isVideo ? "ph-video-camera" : "ph-phone";
                const callColor = isMissed ? "var(--danger)" : "var(--primary)";
                const callText = item.text === "null" ? "Missed call" : item.text;
                
                textHtml = `
                    <div class="msg-text has-meta" style="display: flex; align-items: center; gap: 6px; font-weight: 500;">
                        <i class="ph-fill ${callIcon}" style="font-size: 18px; color: ${callColor}"></i> 
                        ${escapeHtml(callText)}
                    </div>`;
            } else {
                textHtml = `<div class="msg-text ${item.mediaItems.length ? "" : "has-meta"}">${linkifyAndHighlight(item.text)}</div>`;
            }
        }
        const mediaHtml = item.mediaItems.length ? renderMediaStack(item.mediaItems) : "";
        const readTick = item.isMe ? '<i class="ph-bold ph-checks" style="color:#53bdeb"></i>' : "";

        html += `
            <article class="${rowClass}" id="${item.id}">
                <div class="bubble">
                    ${senderHtml}
                    ${textHtml}
                    ${mediaHtml}
                    <div class="meta">
                        <span>${escapeHtml(item.time)}</span>
                        ${readTick}
                    </div>
                </div>
            </article>
        `;

        lastSender = item.sender;
    });

    list.innerHTML = html;
    syncFocusedSearchResult();
    hydrateLazyMedia();
}

function renderMediaStack(mediaItems) {
    return `
        <div class="msg-media-stack">
            ${mediaItems.map(renderMediaItem).join("")}
        </div>
    `;
}

function renderMediaItem(item) {
    if (item.status === "missing") {
        return `
            <div class="media-missing">
                <div class="media-missing-head">
                    <i class="ph-fill ph-warning-circle"></i>
                    <div>
                        <strong>${escapeHtml(item.name || "Missing attachment")}</strong>
                        <span>Attachment referenced in chat but not present in the export.</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Check if we already loaded this image while scrolling previously
    const media = state.mediaStore.get(item.id);
    const isLoaded = media?.hasLoaded;
    const srcAttr = isLoaded ? `src="${escapeAttribute(item.url)}" class="loaded"` : `data-src="${escapeAttribute(item.url)}"`;

    if (item.kind === "image") {
        return `
            <button class="media-button media-image" type="button" data-open-media="${item.id}">
                <img ${srcAttr} data-media-id="${item.id}" alt="${escapeAttribute(item.name)}" loading="lazy" decoding="async">
            </button>
        `;
    }

    if (item.kind === "sticker") {
        return `
            <button class="media-button media-sticker" type="button" data-open-media="${item.id}">
                <img ${srcAttr} data-media-id="${item.id}" alt="${escapeAttribute(item.name)}" loading="lazy" decoding="async">
            </button>
        `;
    }

    if (item.kind === "video") {
        const videoSrc = isLoaded ? `src="${escapeAttribute(item.url)}" class="loaded"` : `data-src="${escapeAttribute(item.url)}"`;
        const placeholder = isLoaded ? "" : `<div class="media-placeholder" aria-hidden="true"><i class="ph-fill ph-play-circle"></i></div>`;
        return `
            <div class="media-video">
                ${placeholder}
                <video controls preload="none" ${videoSrc} data-media-id="${item.id}"></video>
            </div>
        `;
    }

    if (item.kind === "audio") {
        return `
            <div class="media-audio">
                <div class="media-audio-head">
                    <i class="ph-fill ph-waveform"></i>
                    <div>
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${formatBytes(item.size)}</span>
                    </div>
                </div>
                <audio controls preload="metadata" src="${escapeAttribute(item.url)}"></audio>
            </div>
        `;
    }

    return `
        <div class="media-doc">
            <div class="media-doc-head">
                <i class="ph-fill ph-file"></i>
                <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${labelForMediaKind(item.kind)}${item.size ? ` • ${formatBytes(item.size)}` : ""}</span>
                </div>
            </div>
            <div class="media-doc-actions">
                <button type="button" class="media-doc-link" data-open-media="${item.id}">Preview</button>
                <a class="media-doc-link" href="${escapeAttribute(item.url)}" download="${escapeAttribute(item.name)}">Download</a>
            </div>
        </div>
    `;
}

function handleViewportScroll(event) {
    const viewport = event.currentTarget;

    if (viewport.scrollTop <= 0 && state.renderRange.start > 0) {
        const oldHeight = viewport.scrollHeight;
        state.renderRange.start = Math.max(0, state.renderRange.start - BATCH_SIZE);
        renderChatList();
        viewport.scrollTop = viewport.scrollHeight - oldHeight;
        return;
    }

    if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 20 && state.renderRange.end < state.filteredMessages.length) {
        state.renderRange.end = Math.min(state.filteredMessages.length, state.renderRange.end + BATCH_SIZE);
        const previousTop = viewport.scrollTop;
        renderChatList();
        viewport.scrollTop = previousTop;
    }
}

function toggleSearch() {
    const toolbar = $("search-toolbar");
    const input = $("live-search");
    if (!toolbar || !input) return;

    state.isSearchOpen = !toolbar.classList.contains("active");
    toolbar.classList.toggle("active", state.isSearchOpen);

    if (state.isSearchOpen) {
        input.focus();
        return;
    }

    input.value = "";
    handleSearch("");
    resetRenderToBottom();
}

function handleSearch(query) {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
        state.searchResults = [];
        state.searchPointer = -1;
        updateSearchCounter();
        renderChatList();
        return;
    }

    state.searchResults = state.messages
        .filter((entry) => entry.type === "msg" && getSearchableText(entry).includes(normalized))
        .map((entry) => entry.id);

    if (!state.searchResults.length) {
        state.searchPointer = -1;
        updateSearchCounter("No matches");
        renderChatList();
        return;
    }

    state.searchPointer = 0;
    updateSearchCounter();
    jumpToMessage(state.searchResults[state.searchPointer]);
}

function navSearch(direction) {
    if (!state.searchResults.length) return;

    state.searchPointer += direction === "up" ? -1 : 1;
    if (state.searchPointer < 0) {
        state.searchPointer = state.searchResults.length - 1;
    }
    if (state.searchPointer >= state.searchResults.length) {
        state.searchPointer = 0;
    }

    updateSearchCounter();
    jumpToMessage(state.searchResults[state.searchPointer]);
}

function updateSearchCounter(fallback = "") {
    const counter = $("search-counter");
    if (!counter) return;

    if (fallback) {
        counter.innerText = fallback;
        return;
    }

    counter.innerText = state.searchResults.length
        ? `${state.searchPointer + 1}/${state.searchResults.length}`
        : "";
}

function jumpToMessage(messageId) {
    const index = state.filteredMessages.findIndex((entry) => entry.id === messageId);
    if (index === -1) return;

    state.renderRange.start = Math.max(0, index - 40);
    state.renderRange.end = Math.min(state.filteredMessages.length, index + 40);
    renderChatList();

    window.setTimeout(() => {
        const element = $(messageId);
        if (!element) return;
        element.scrollIntoView({ block: "center", behavior: "auto" });
        syncFocusedSearchResult();
    }, 40);
}

function syncFocusedSearchResult() {
    if (state.searchPointer < 0 || !state.searchResults.length) return;
    const current = $(state.searchResults[state.searchPointer]);
    current?.querySelector(".hl")?.classList.add("focus");
}

function linkifyAndHighlight(text) {
    const query = $("live-search")?.value.trim();
    let escaped = escapeHtml(text || "");

    escaped = escaped.replace(
        /(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    escaped = escaped.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/_([^_\n]+)_/g, "<em>$1</em>");
    escaped = escaped.replace(/~([^~\n]+)~/g, "<s>$1</s>");

    if (query) {
        const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
        escaped = escaped.replace(regex, '<span class="hl">$1</span>');
    }

    return escaped;
}

function handleMessageListClick(event) {
    const mediaTrigger = event.target.closest("[data-open-media]");
    if (mediaTrigger) {
        openMediaModal(mediaTrigger.dataset.openMedia);
    }
}

function openMediaModal(mediaId) {
    const media = state.mediaStore.get(mediaId);
    const modal = $("media-modal");
    const body = $("media-modal-body");
    const subtitle = $("media-modal-subtitle");
    const downloadLink = $("media-download-link");

    if (!modal || !body || !subtitle || !downloadLink || !media) return;

    state.activeMediaId = mediaId;
    subtitle.innerText = `${labelForMediaKind(media.kind)} • ${media.name}`;
    downloadLink.href = media.url;
    downloadLink.download = media.name;

    if (media.kind === "image" || media.kind === "sticker") {
        body.innerHTML = `<img src="${escapeAttribute(media.url)}" alt="${escapeAttribute(media.name)}" decoding="async">`;
    } else if (media.kind === "video") {
        body.innerHTML = `<video controls autoplay src="${escapeAttribute(media.url)}"></video>`;
    } else if (media.kind === "audio") {
        body.innerHTML = `<audio controls autoplay src="${escapeAttribute(media.url)}"></audio>`;
    } else {
        body.innerHTML = `
            <div class="media-doc">
                <div class="media-doc-head">
                    <i class="ph-fill ph-file"></i>
                    <div>
                        <strong>${escapeHtml(media.name)}</strong>
                        <span>${labelForMediaKind(media.kind)}${media.size ? ` • ${formatBytes(media.size)}` : ""}</span>
                    </div>
                </div>
                <a class="media-doc-link" href="${escapeAttribute(media.url)}" download="${escapeAttribute(media.name)}">Download file</a>
            </div>
        `;
    }

    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("open"));
}

function closeMediaModal() {
    const modal = $("media-modal");
    const body = $("media-modal-body");
    if (!modal || modal.hidden) return;

    modal.classList.remove("open");
    window.setTimeout(() => {
        if (!modal.classList.contains("open")) {
            modal.hidden = true;
            if (body) {
                body.innerHTML = "";
            }
        }
    }, 120);
    state.activeMediaId = "";
}

function openDrawer(id) {
    $(`${id}-drawer`)?.classList.add("open");
}

function closeDrawer(id) {
    $(`${id}-drawer`)?.classList.remove("open");
}

function toggleSidebar() {
    const sidebar = $("sidebar");
    if (!sidebar) return;
    setSidebarState(!sidebar.classList.contains("active"));
}

function setSidebarState(isOpen) {
    $("sidebar")?.classList.toggle("active", isOpen);
    $("sidebar-backdrop")?.classList.toggle("active", isOpen);
}

function handleChatSelect() {
    if (window.innerWidth <= 800) {
        setSidebarState(false);
    }
}

function toggleMenu() {
    $("header-menu")?.classList.toggle("show");
}

function closeMenu() {
    $("header-menu")?.classList.remove("show");
}

function handleDocumentClick(event) {
    const menu = $("header-menu");
    const menuToggle = $("menu-toggle");
    if (menu?.classList.contains("show") && !menu.contains(event.target) && !menuToggle?.contains(event.target)) {
        closeMenu();
    }
}

function handleGlobalKeydown(event) {
    if (event.key === "Escape") {
        if (state.activeMediaId) {
            closeMediaModal();
            return;
        }
        if (!$("date-sheet")?.hidden) {
            closeDateSheet();
            return;
        }
        closeMenu();
        document.querySelectorAll(".drawer.open").forEach((drawer) => drawer.classList.remove("open"));
    }
}

function handleDateJumpAction(event) {
    event.preventDefault();
    closeMenu();

    if (!state.messages.length) {
        showToast("Load a chat first");
        return;
    }

    openDateSheet();
}

function openDateSheet() {
    const sheet = $("date-sheet");
    const input = $("date-sheet-input");
    if (!sheet || !input) return;

    input.value = "";
    sheet.hidden = false;
    requestAnimationFrame(() => {
        sheet.classList.add("open");
        input.focus({ preventScroll: true });
    });
}

function closeDateSheet() {
    const sheet = $("date-sheet");
    if (!sheet) return;

    sheet.classList.remove("open");
    window.setTimeout(() => {
        if (!sheet.classList.contains("open")) {
            sheet.hidden = true;
        }
    }, 160);
}

function applyDateSheetSelection() {
    const selectedDate = $("date-sheet-input")?.value || "";
    if (!selectedDate) {
        showToast("Select a date");
        return;
    }

    closeDateSheet();
    handleDateSelection(selectedDate);
}

function handleDateSelection(dateValue) {
    if (!dateValue || !state.messages.length) return;

    const targetDate = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(targetDate.getTime())) {
        showToast("Invalid date format");
        return;
    }

    targetDate.setHours(0, 0, 0, 0);
    const targetMs = targetDate.getTime();
    let exactIndex = -1;
    let bestBeforeIndex = -1;
    let bestBeforeMs = -Infinity;
    let bestAfterIndex = -1;
    let bestAfterMs = Infinity;

    state.filteredMessages.forEach((entry, index) => {
        if (entry.type !== "date") return;
        const parsed = parseExportDateLabel(entry.content);
        if (!parsed) return;

        const time = parsed.getTime();
        if (time === targetMs && exactIndex === -1) {
            exactIndex = index;
        }
        if (time <= targetMs && time > bestBeforeMs) {
            bestBeforeMs = time;
            bestBeforeIndex = index;
        }
        if (time >= targetMs && time < bestAfterMs) {
            bestAfterMs = time;
            bestAfterIndex = index;
        }
    });

    const bestIndex = exactIndex !== -1 ? exactIndex : bestBeforeIndex;
    if (bestIndex === -1) {
        showToast(bestAfterIndex !== -1 ? "No messages on or before that date" : "No valid date markers found");
        return;
    }

    state.renderRange.start = Math.max(0, bestIndex);
    state.renderRange.end = Math.min(state.filteredMessages.length, bestIndex + (BATCH_SIZE * 2));
    renderChatList();

    window.setTimeout(() => {
        const targetEntry = state.filteredMessages[findFirstMessageIndexForDate(bestIndex) ?? bestIndex];
        $(targetEntry?.id)?.scrollIntoView({ block: "start", behavior: "auto" });
        const label = state.filteredMessages[bestIndex]?.content;
        showToast(exactIndex !== -1 ? `Jumped to ${label}` : `Closest previous date: ${label}`);
    }, 50);
}

function findFirstMessageIndexForDate(dateMarkerIndex) {
    for (let i = dateMarkerIndex + 1; i < state.filteredMessages.length; i += 1) {
        const entry = state.filteredMessages[i];
        if (entry.type === "date") return dateMarkerIndex;
        if (entry.type === "msg") return i;
    }
    return dateMarkerIndex;
}

function scrollToBottom() {
    const viewport = $("viewport");
    if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
    }
}

function jumpToBottom() {
    closeMenu();
    resetRenderToBottom();
    requestAnimationFrame(scrollToBottom);
}

function resetRenderToBottom() {
    state.renderRange = {
        start: Math.max(0, state.filteredMessages.length - BATCH_SIZE),
        end: state.filteredMessages.length
    };
    renderChatList();
}

function setLoadingState(isLoading, title = "Loading chat", copy = "Parsing your export locally. This can take a moment for large ZIP files.") {
    state.isLoading = isLoading;

    const overlay = $("processing-overlay");
    const titleEl = $("processing-title");
    const copyEl = $("processing-copy");
    const loadButton = $("load-chat");
    const dropTarget = $("drop-target");
    const nameInput = $("display-name");
    const fileInput = $("file-input");

    if (titleEl) {
        titleEl.innerText = title;
    }
    if (copyEl) {
        copyEl.innerText = copy;
    }

    loadButton?.toggleAttribute("disabled", isLoading);
    dropTarget?.toggleAttribute("disabled", isLoading);
    nameInput?.toggleAttribute("disabled", isLoading);
    fileInput?.toggleAttribute("disabled", isLoading);

    if (!overlay) return;

    if (isLoading) {
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add("open"));
        return;
    }

    overlay.classList.remove("open");
    window.setTimeout(() => {
        if (!overlay.classList.contains("open")) {
            overlay.hidden = true;
        }
    }, 120);
}

function updateLoadingCopy(copy) {
    const copyEl = $("processing-copy");
    if (copyEl) {
        copyEl.innerText = copy;
    }
}

function showToast(message) {
    const toast = $("toast");
    if (!toast) return;

    toast.innerText = message;
    toast.classList.add("show");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

async function copyUPI() {
    try {
        await navigator.clipboard.writeText("paras2326@fam");
        showToast("UPI ID copied");
    } catch (error) {
        console.error(error);
        showToast("Could not copy UPI ID");
    }
}

function handleProfilePictureChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (state.profileObjectUrl) {
        URL.revokeObjectURL(state.profileObjectUrl);
    }

    state.profileObjectUrl = URL.createObjectURL(file);
    $("my-pfp-img").src = state.profileObjectUrl;
    $("drawer-pfp-img").src = state.profileObjectUrl;
    q(".header-pfp").src = state.profileObjectUrl;
}

function updateUIState(filename) {
    $("upload-panel")?.classList.add("hidden");
    $("chat-list-panel")?.classList.remove("hidden");
    $("empty-state")?.classList.add("hidden");

    state.chatTitle = filename.replace(/(_chat\.txt|WhatsApp Chat with |\.\w+$)/gi, "").trim() || "Chat History";
    const withMedia = state.mediaCount ? ` • ${state.mediaCount.toLocaleString()} media` : "";

    $("sidebar-title").innerText = state.chatTitle;
    $("header-name").innerText = state.chatTitle;
    $("header-meta").innerText = `${state.messageOnlyCount.toLocaleString()} messages${withMedia}`;
    $("sidebar-sub").innerText = state.mediaMissingCount
        ? `${state.mediaMissingCount} missing attachment${state.mediaMissingCount === 1 ? "" : "s"}`
        : "Loaded successfully";
}

function getSearchableText(entry) {
    const mediaNames = entry.mediaItems.map((item) => item.name).join(" ");
    return `${entry.sender} ${entry.text} ${mediaNames}`.toLowerCase();
}

function hydrateLazyMedia() {
    const root = $("viewport");
    if (!root) return;

    if (!("IntersectionObserver" in window)) {
        root.querySelectorAll("img[data-src], video[data-src]").forEach(loadLazyMediaElement);
        return;
    }

    if (!state.mediaObserver) {
        state.mediaObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                loadLazyMediaElement(entry.target);
                observer.unobserve(entry.target);
            });
        }, {
            root,
            rootMargin: "800px 0px"
        });
    }

    root.querySelectorAll("img[data-src], video[data-src]").forEach((element) => {
        state.mediaObserver.observe(element);
    });
}

function loadLazyMediaElement(element) {
    const source = element.dataset.src;
    const mediaId = element.dataset.mediaId;
    if (!source) return;

    element.removeAttribute("data-src");

    const markLoaded = () => {
        element.classList.add("loaded");
        if (mediaId && state.mediaStore.has(mediaId)) {
            state.mediaStore.get(mediaId).hasLoaded = true;
        }
    };

    if (element.tagName === "VIDEO") {
        element.src = source;
        element.load();
        element.addEventListener("loadeddata", () => {
            element.previousElementSibling?.remove();
            markLoaded();
        }, { once: true });
    } else {
        element.onload = markLoaded;
        element.src = source;
        
        if (element.complete) {
            markLoaded();
        }
    }
}

function disconnectMediaObserver() {
    if (state.mediaObserver) {
        state.mediaObserver.disconnect();
    }
}

function formatBytes(bytes) {
    if (!bytes) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function labelForMediaKind(kind) {
    const labels = {
        image: "Image",
        sticker: "Sticker",
        video: "Video",
        audio: "Audio",
        document: "Document",
        archive: "Archive",
        contact: "Contact"
    };
    return labels[kind] || "File";
}

async function parseChatData(text) {
    const lines = text.split(/\r?\n/);
    const totalLines = lines.length;
    
    // Robust regex handles iOS brackets, Android hyphens, colons in names, and various date formats
    const messageRegex = /^\[?(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}[,.]?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s*(?:-\s*)?(.*?):\s*(.*)$/;
    const systemRegex = /^\[?(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}[,.]?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s*(?:-\s*)?(.*)$/;

    let lastDate = "";
    let lastMessage = null;

    for (let index = 0; index < totalLines; index++) {
        const originalLine = lines[index];
        // Strip invisible directional marks that break regex parsing
        const line = originalLine.replace(/[\u200E\u200F\u202A-\u202E\u200B]/g, "");

        // Yield to the browser every 2000 lines to guarantee a UI update
        if (index > 0 && index % 2000 === 0) {
            const pct = Math.round((index / totalLines) * 100);
            updateLoadingCopy(`Parsing messages... ${pct}% (${index.toLocaleString()} lines)`);
            // 5ms explicitly forces the browser to drop the main thread and paint the text
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        const messageMatch = line.match(messageRegex);
        if (messageMatch) {
            const rawTime = messageMatch[1].trim();
            const sender = messageMatch[2].trim();
            const rawContent = messageMatch[3] || "";
            const dateStr = extractDatePart(rawTime);

            if (dateStr && dateStr !== lastDate) {
                state.messages.push({ type: "date", content: dateStr, id: `date-${index}` });
                lastDate = dateStr;
            }

            const message = createMessageEntry(index, rawTime, sender, rawContent);
            state.messages.push(message);
            lastMessage = message;
            continue;
        }

        const systemMatch = line.match(systemRegex);
        if (systemMatch) {
            const rawTime = systemMatch[1].trim();
            const content = (systemMatch[2] || "").trim();
            const dateStr = extractDatePart(rawTime);

            if (dateStr && dateStr !== lastDate) {
                state.messages.push({ type: "date", content: dateStr, id: `date-${index}` });
                lastDate = dateStr;
            }

            if (content) {
                state.messages.push({ type: "system", id: `sys-${index}`, time: extractTimePart(rawTime), content });
                lastMessage = null;
            }
            continue;
        }

        if (lastMessage && lastMessage.type === "msg") {
            appendContinuation(lastMessage, line);
        }
    }

    state.filteredMessages = state.messages;
    state.inferredDateOrder = inferDateOrder(state.messages.filter(e => e.type === "date").map(e => e.content));
    state.renderRange = { start: Math.max(0, state.filteredMessages.length - BATCH_SIZE), end: state.filteredMessages.length };
    generateStats();
}

function appendContinuation(message, line) {
    const parsed = parseMessageContent(line, true);
    // Preserve blank lines perfectly
    message.text = message.text !== "" ? `${message.text}\n${parsed.text}` : parsed.text;

    if (parsed.mediaItems.length) {
        message.mediaItems.push(...parsed.mediaItems);
        state.mediaCount += parsed.mediaItems.length;
        state.mediaMissingCount += parsed.mediaItems.filter(item => item.status === "missing").length;
    }
}

function parseMessageContent(content, isContinuation = false) {
    let text = content || "";
    if (!isContinuation) {
        text = text.trim();
    }

    const mediaItems = [];

    if (/^<media omitted>$/i.test(text.trim()) || /^<medien ausgeschlossen>$/i.test(text.trim())) {
        mediaItems.push(createMissingMediaItem("Media omitted"));
        return { text: "", mediaItems };
    }

    const attachments = extractAttachmentTokens(text);
    attachments.forEach((attachment) => {
        const mediaItem = resolveAttachment(attachment.fileName);
        mediaItems.push(mediaItem);
        text = text.replace(attachment.raw, "");
    });

    if (!mediaItems.length && looksLikeStandaloneAttachment(text.trim())) {
        mediaItems.push(resolveAttachment(text.trim()));
        text = "";
    }

    return { text: cleanupMessageText(text, isContinuation), mediaItems };
}

function cleanupMessageText(text, isContinuation = false) {
    const clean = text.replace(/[\u200E\u200F\u202A-\u202E\u200B]/g, "");
    return isContinuation ? clean : clean.trim();
}

function normalizeLookupKey(value) {
    return String(value || "")
        .trim()
        .replace(/^<attached:\s*/i, "")
        .replace(/>$/g, "")
        .replace(/\(file attached\)$/i, "")
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        .toLowerCase();
}

function stripAttachmentPrefix(value) {
    return String(value || "")
        .replace(/^attached[_\s-]*/i, "")
        .replace(/^file[_\s-]*/i, "")
        .trim();
}

function baseName(filePath) {
    return String(filePath || "").split("/").pop() || "";
}

function detectMediaType(fileName, mimeType = "") {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const mime = mimeType || inferMimeType(ext);

    if (mime.startsWith("image/")) {
        return { kind: /^sticker|webp$/i.test(ext) || /^stk-/i.test(fileName) ? "sticker" : "image", mime, ext };
    }
    if (mime.startsWith("video/")) {
        return { kind: "video", mime, ext };
    }
    if (mime.startsWith("audio/")) {
        return { kind: "audio", mime, ext };
    }
    if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"].includes(ext)) {
        return { kind: "document", mime, ext };
    }
    if (["zip", "rar", "7z"].includes(ext)) {
        return { kind: "archive", mime, ext };
    }
    if (["vcf"].includes(ext)) {
        return { kind: "contact", mime, ext };
    }
    return { kind: "document", mime, ext };
}

function inferMimeType(ext) {
    const map = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        heic: "image/heic",
        heif: "image/heif",
        mp4: "video/mp4",
        mov: "video/quicktime",
        avi: "video/x-msvideo",
        m4v: "video/x-m4v",
        webm: "video/webm",
        mp3: "audio/mpeg",
        m4a: "audio/mp4",
        opus: "audio/ogg",
        ogg: "audio/ogg",
        oga: "audio/ogg",
        wav: "audio/wav",
        aac: "audio/aac",
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        txt: "text/plain",
        vcf: "text/vcard",
        zip: "application/zip"
    };
    return map[ext] || "application/octet-stream";
}

function extractDatePart(rawTime) {
    return rawTime.match(/^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/)?.[0] || "";
}

function extractTimePart(rawTime) {
    return rawTime.match(/\d{1,2}:\d{2}(?::\d{2})?\s?(?:[APap][Mm])?/)?.[0] || rawTime;
}

function isMeSender(sender) {
    return sender.toLowerCase() === state.myName.toLowerCase() || sender === "You";
}

function getColor(name) {
    if (!state.colorMap[name]) {
        let hash = 0;
        for (let index = 0; index < name.length; index += 1) {
            hash = name.charCodeAt(index) + ((hash << 5) - hash);
        }
        state.colorMap[name] = COLORS[Math.abs(hash) % COLORS.length];
    }
    return state.colorMap[name];
}

function parseExportDateLabel(label) {
    return parseLabelWithOrder(label, state.inferredDateOrder);
}

function parseLabelWithOrder(label, order) {
    const parts = (label || "").split(/[./-]/).map((part) => part.trim());
    if (parts.length !== 3) return null;

    const [aRaw, bRaw, cRaw] = parts;
    const a = parseInt(aRaw, 10);
    const b = parseInt(bRaw, 10);
    const c = parseInt(cRaw, 10);

    if ([a, b, c].some((value) => Number.isNaN(value))) {
        return null;
    }

    if (order === "YMD") {
        if (aRaw.length !== 4) return null;
        return createDateStrict(normalizeYear(a), b, c);
    }
    if (order === "MDY") {
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
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
}

function inferDateOrder(dateLabels) {
    const labels = (dateLabels || []).filter(Boolean);
    if (!labels.length) {
        return getTieBreakDateOrder();
    }

    const candidates = ["DMY", "MDY", "YMD"];
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
    let previousTime = null;

    labels.forEach((label) => {
        const date = parseLabelWithOrder(label, order);
        if (!date) {
            invalid += 1;
            return;
        }

        valid += 1;
        if (previousTime !== null) {
            monotonic += date.getTime() >= previousTime ? 1 : -1;
        }
        previousTime = date.getTime();
    });

    return (valid * 4) + (monotonic * 2) - (invalid * 6);
}

function getTieBreakDateOrder() {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    return locale.toLowerCase().startsWith("en-us") ? "MDY" : "DMY";
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}