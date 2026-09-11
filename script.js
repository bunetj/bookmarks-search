let bookmarks = [];
let filtered = [];
let selectedIndex = -1;

const searchInput = document.getElementById("searchInput");
const resultsDiv = document.getElementById("results");
const statsDiv = document.getElementById("stats");
const countSpan = document.getElementById("count");
const clearBtn = document.getElementById("clearBtn");

// ── PARSE FIREFOX BOOKMARKS HTML ──
function parseBookmarksHTML(html) {
    console.log("Parsing bookmarks HTML...");
    const bookmarks = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const links = doc.querySelectorAll("a[href]");
    console.log("Found " + links.length + " links");
    let tagCount = 0;
    links.forEach(function(a) {
        const title = a.textContent.trim();
        const url = a.getAttribute("href");
        const tagsAttr = a.getAttribute("tags");
        const addDate = a.getAttribute("add_date");
        let tags = [];
        if (tagsAttr) {
            tags = tagsAttr.split(",").map(function(t) { return t.trim(); }).filter(function(t) { return t; });
            if (tags.length > 0) tagCount++;
        }
        let folder = "Unfiled";
        let parent = a.parentElement;
        while (parent) {
            const h3 = parent.querySelector("h3");
            if (h3) {
                folder = h3.textContent.trim();
                break;
            }
            parent = parent.parentElement;
        }
        let fullPath = folder;
        let ancestors = [];
        let p = a.parentElement;
        while (p) {
            const h3 = p.querySelector("h3");
            if (h3) {
                ancestors.push(h3.textContent.trim());
            }
            p = p.parentElement;
        }
        if (ancestors.length > 0) {
            fullPath = ancestors.reverse().join("/");
        }
        bookmarks.push({
            title: title || "Untitled",
            url: url,
            tags: tags,
            folder: folder,
            full_path: fullPath || folder,
            dateAdded: addDate || "Unknown"
        });
    });
    console.log("Parsed " + bookmarks.length + " bookmarks");
    console.log(tagCount + " bookmarks have tags");
    const allTags = new Set();
    bookmarks.forEach(function(b) {
        b.tags.forEach(function(t) { allTags.add(t); });
    });
    console.log("Unique tags: " + allTags.size);
    if (allTags.size > 0) {
        console.log("Example tags:", Array.from(allTags).slice(0, 10));
    }
    return bookmarks;
}

// ── LOAD BOOKMARKS ──
async function loadBookmarks() {
    console.log("Loading bookmarks.html...");
    try {
        const response = await fetch("bookmarks.html");
        if (!response.ok) throw new Error("HTTP " + response.status);
        const html = await response.text();
        console.log("Loaded HTML, parsing...");
        bookmarks = parseBookmarksHTML(html);
        console.log("Loaded " + bookmarks.length + " bookmarks");
        countSpan.textContent = bookmarks.length.toLocaleString() + " bookmarks";
        statsDiv.innerHTML = "📚 ";
        statsDiv.appendChild(countSpan);
    } catch (e) {
        console.error("Error:", e);
        statsDiv.textContent = "Could not load bookmarks.html";
        resultsDiv.innerHTML = "";
    }
}

// ── SEARCH WITH OPERATORS ──
function doSearch() {
    var query = searchInput.value;
    console.log("Searching for:", query);
    if (!query.trim()) {
        filtered = [];
        resultsDiv.innerHTML = "";
        statsDiv.innerHTML = "📚 ";
        statsDiv.appendChild(countSpan);
        return;
    }

    // ─── Step 1: Parse quoted phrases FIRST ──────────────────────────────────
    // This handles quotes with slashes, spaces, and special characters
    var rawTokens = [];
    var current = "";
    var inQuotes = false;
    var quoteChar = "";
    
    for (var i = 0; i < query.length; i++) {
        var ch = query[i];
        
        if (ch === "\"" && (i === 0 || query[i-1] !== "\\")) {
            if (inQuotes) {
                // Closing quote
                inQuotes = false;
                if (current) {
                    // Keep the quotes as part of the token for later detection
                    rawTokens.push('"' + current + '"');
                    current = "";
                }
            } else {
                // Opening quote
                inQuotes = true;
                current = "";
            }
        } else if (ch === " " && !inQuotes) {
            if (current) {
                rawTokens.push(current);
                current = "";
            }
        } else {
            current += ch;
        }
    }
    if (current) rawTokens.push(current);

    console.log("Raw tokens:", rawTokens);

    // ─── Step 2: Split each token by / (OR) ──────────────────────────────────
    // BUT: skip splitting if token is quoted (starts and ends with ")
    
    function splitBySlashForOR(token) {
        // Check if token is quoted (starts and ends with ")
        var isQuoted = token.startsWith('"') && token.endsWith('"');
        if (isQuoted) {
            // Quoted token: return as-is (literal)
            return [token];
        }
        
        // Check if token is an operator with quoted value
        var lower = token.toLowerCase();
        var isOperator = lower.startsWith("name:") || 
                         lower.startsWith("folder:") || 
                         lower.startsWith("site:") || 
                         lower.startsWith("date:") ||
                         lower.startsWith("#");
        
        if (isOperator) {
            var colonIndex = token.indexOf(":");
            var operator = "";
            var value = "";
            
            if (colonIndex !== -1) {
                operator = token.substring(0, colonIndex + 1);
                value = token.substring(colonIndex + 1);
            } else {
                // #tag case
                operator = "#";
                value = token.substring(1);
            }
            
            // If value is quoted, treat as literal
            if (value.startsWith('"') && value.endsWith('"')) {
                return [token];
            }
            
            // If value is empty or just slashes, return as single token (literal)
            if (value === "" || value.match(/^\/+$/)) {
                return [token];
            }
            
            // Normal OR split with slashes
            if (value.includes("/")) {
                var parts = value.split("/");
                var result = [];
                for (var j = 0; j < parts.length; j++) {
                    if (parts[j]) {
                        result.push(operator + parts[j]);
                    }
                }
                if (result.length === 0) {
                    return [token];
                }
                return result;
            }
        }
        
        // Regular token: split by / for OR
        if (token.includes("/")) {
            var parts = token.split("/");
            var result = [];
            for (var j = 0; j < parts.length; j++) {
                if (parts[j]) {
                    result.push(parts[j]);
                }
            }
            if (result.length === 0) {
                return [token];
            }
            return result;
        }
        
        return [token];
    }

    var groups = [];
    for (var i = 0; i < rawTokens.length; i++) {
        var t = rawTokens[i];
        var groupTokens = splitBySlashForOR(t);
        if (groupTokens.length > 0) {
            groups.push(groupTokens);
        }
    }

    console.log("Groups (OR within, AND between):", groups);

    // ─── Step 3: Parse each token ─────────────────────────────────────────────
    var parsedGroups = [];
    for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        var parsedTokens = [];
        
        for (var i = 0; i < group.length; i++) {
            var t = group[i];
            var lower = t.toLowerCase();
            
            // Check if token is quoted (literal phrase)
            var isQuoted = t.startsWith('"') && t.endsWith('"');
            
            if (isQuoted) {
                // Remove quotes and treat as phrase
                var phrase = t.substring(1, t.length - 1);
                parsedTokens.push({ type: "phrase", value: phrase.toLowerCase() });
            } else if (lower.startsWith("folder:")) {
                parsedTokens.push({ type: "folder", value: t.substring(7) });
            } else if (lower.startsWith("date:")) {
                parsedTokens.push({ type: "date", value: t.substring(5) });
            } else if (lower.startsWith("site:")) {
                parsedTokens.push({ type: "site", value: t.substring(5) });
            } else if (lower.startsWith("name:")) {
                parsedTokens.push({ type: "name", value: t.substring(5) });
            } else if (t.startsWith("#")) {
                parsedTokens.push({ type: "tag", value: t.substring(1).toLowerCase() });
            } else if (t.startsWith("-")) {
                parsedTokens.push({ type: "exclude", value: t.substring(1).toLowerCase() });
            } else {
                parsedTokens.push({ type: "text", value: t.toLowerCase() });
            }
        }
        
        parsedGroups.push(parsedTokens);
    }

    console.log("Parsed groups:", parsedGroups);

    // ─── Step 4: Filter ──────────────────────────────────────────────────────
    filtered = bookmarks.filter(function(b) {
        var searchText = (b.title + " " + b.url + " " + b.full_path + " " + b.folder).toLowerCase();
        var folderText = (b.full_path + " " + b.folder).toLowerCase();
        var urlLower = b.url.toLowerCase();
        var dateText = b.dateAdded.toLowerCase();
        var titleLower = b.title.toLowerCase();
        var bTags = b.tags.map(function(t) { return t.toLowerCase(); });
        
        for (var g = 0; g < parsedGroups.length; g++) {
            var group = parsedGroups[g];
            var groupMatched = false;
            
            for (var i = 0; i < group.length; i++) {
                var p = group[i];
                var tokenMatched = false;
                
                switch (p.type) {
                    case "text":
                        if (searchText.includes(p.value)) tokenMatched = true;
                        break;
                    case "phrase":
                        if (searchText.includes(p.value)) tokenMatched = true;
                        break;
                    case "folder":
                        if (folderText.includes(p.value.toLowerCase())) tokenMatched = true;
                        break;
                    case "date":
                        if (dateText.includes(p.value.toLowerCase())) tokenMatched = true;
                        break;
                    case "site":
                        if (urlLower.includes(p.value.toLowerCase())) tokenMatched = true;
                        break;
                    case "name":
                        if (titleLower.includes(p.value.toLowerCase())) tokenMatched = true;
                        break;
                    case "tag":
                        if (bTags.includes(p.value)) tokenMatched = true;
                        break;
                    case "exclude":
                        if (!searchText.includes(p.value)) tokenMatched = true;
                        break;
                }
                
                if (tokenMatched) {
                    groupMatched = true;
                    break;
                }
            }
            
            if (!groupMatched) {
                return false;
            }
        }
        
        return true;
    });

    // ─── Step 5: Sort ──────────────────────────────────────────────────────────
    filtered.sort(function(a, b) {
        var dateA = a.dateAdded;
        var dateB = b.dateAdded;
        if (dateA === "Unknown") dateA = "0";
        if (dateB === "Unknown") dateB = "0";
        return parseInt(dateB) - parseInt(dateA);
    });

    console.log("Found:", filtered.length, "results");
    renderResults(filtered);
    statsDiv.textContent = filtered.length + " results found ";
    statsDiv.appendChild(countSpan);
}

function renderResults(results) {
    console.log("Rendering", results.length, "results");
    if (results.length === 0) {
        resultsDiv.innerHTML = "<div class=\"no-results\"><div class=\"big\">🔍</div><p>No bookmarks found</p></div>";
        return;
    }

    var query = searchInput.value;
    var html = "";
    for (var i = 0; i < results.length; i++) {
        var b = results[i];
        var tags = b.tags || [];
        var tagsHtml = "";
        if (tags.length > 0) {
            for (var j = 0; j < tags.length; j++) {
                var t = tags[j];
                var displayTag = t.startsWith("#") ? t.substring(1) : t;
                tagsHtml += "<span class=\"tag-item\">#" + displayTag + "</span>";
            }
        }
        var dateDisplay = b.dateAdded || "Unknown";
        if (dateDisplay !== "Unknown" && !isNaN(dateDisplay) && dateDisplay.length > 8) {
            try {
                var dateObj = new Date(parseInt(dateDisplay) * 1000);
                dateDisplay = dateObj.toISOString().split("T")[0];
            } catch(e) {}
        }
        html += "<div class=\"result\">";
        html += "<div class=\"meta\">";
        html += "<span class=\"folder\">📂 " + (b.full_path || b.folder || "Unfiled") + "</span>";
        html += "</div>";
        html += "<div class=\"date-line\">📅 " + dateDisplay + "</div>";
        html += "<div class=\"url\"><a href=\"" + b.url + "\" target=\"_blank\">" + b.url + "</a></div>";
        html += "<div class=\"title\"><a href=\"" + b.url + "\" target=\"_blank\">" + highlightText(b.title, query) + "</a></div>";
        if (tagsHtml) {
            html += "<div class=\"tags-row\">" + tagsHtml + "</div>";
        }
        html += "</div>";
    }
    resultsDiv.innerHTML = html;
    selectedIndex = -1;
}

function highlightText(text, query) {
    if (!query || !text) return text;
    var q = query.toLowerCase();
    var lower = text.toLowerCase();
    if (!lower.includes(q)) return text;
    var idx = lower.indexOf(q);
    return text.slice(0, idx) + "<strong>" + text.slice(idx, idx + q.length) + "</strong>" + text.slice(idx + q.length);
}

document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey && e.key === "k") || (e.key === "/" && !["INPUT", "TEXTAREA"].includes(e.target.tagName))) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
    if (e.target === searchInput) {
        if (e.key === "Enter") {
            e.preventDefault();
            doSearch();
        }
        if (e.key === "Escape") {
            searchInput.value = "";
            doSearch();
            searchInput.blur();
            clearBtn.style.display = "none";
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            var items = document.querySelectorAll(".result");
            if (items.length) {
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                for (var i = 0; i < items.length; i++) {
                    var el = items[i];
                    el.style.borderColor = (i === selectedIndex) ? "#1a73e8" : "";
                    el.style.background = (i === selectedIndex) ? "#f8f9fa" : "";
                }
            }
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            var items = document.querySelectorAll(".result");
            if (items.length) {
                selectedIndex = Math.max(selectedIndex - 1, 0);
                for (var i = 0; i < items.length; i++) {
                    var el = items[i];
                    el.style.borderColor = (i === selectedIndex) ? "#1a73e8" : "";
                    el.style.background = (i === selectedIndex) ? "#f8f9fa" : "";
                }
            }
        }
        if (e.key === "Enter" && selectedIndex >= 0) {
            var b = filtered[selectedIndex];
            if (b && b.url) {
                window.open(b.url, "_blank");
            }
        }
    }
});

searchInput.addEventListener("input", function() {
    clearBtn.style.display = searchInput.value ? "block" : "none";
});

clearBtn.addEventListener("click", function() {
    searchInput.value = "";
    doSearch();
    searchInput.focus();
    clearBtn.style.display = "none";
});

clearBtn.style.display = "none";
console.log("Script loaded, loading bookmarks...");
loadBookmarks();