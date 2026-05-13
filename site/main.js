// Fills in the download buttons by hitting the GitHub Releases API once on
// page load. The API gives us the latest non-prerelease's assets, so we can
// match installer/DMG/AppImage by extension and set the right href without
// hardcoding a version that goes stale every release.
//
// On failure (network / rate limit / no releases yet) the buttons are
// disabled and the version line shows an unavailable state — we don't bounce
// users to github.com/.../releases, the page is the destination.

const REPO = "alexandremarquesricardo-star/trackport";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

const PLATFORM_MATCHERS = {
  win: (name) => /\.exe$/i.test(name) && /setup/i.test(name),
  mac: (name) =>
    /\.dmg$/i.test(name) &&
    // Prefer universal/arm64 over x64 if both exist.
    (/(arm64|universal)/i.test(name) || !/x64/i.test(name)),
  linux: (name) => /\.AppImage$/i.test(name),
};

const PLATFORM_LABELS = {
  win: "for Windows",
  mac: "for macOS",
  linux: "for Linux",
};

function detectPlatform() {
  const ua = navigator.userAgent || "";
  if (/Windows/i.test(ua)) return "win";
  if (/Mac OS X|Macintosh/i.test(ua)) return "mac";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "win"; // sensible default
}

function pickAsset(assets, platform) {
  const matcher = PLATFORM_MATCHERS[platform];
  if (!matcher) return null;
  // Prefer the first asset that matches; fall back to extension-only match if
  // the strict matcher (e.g. arm64 DMG) returns nothing.
  return (
    assets.find((a) => matcher(a.name)) ||
    assets.find((a) => {
      if (platform === "win") return /\.exe$/i.test(a.name);
      if (platform === "mac") return /\.dmg$/i.test(a.name);
      if (platform === "linux") return /\.AppImage$/i.test(a.name);
      return false;
    }) ||
    null
  );
}

function disableButton(btn) {
  if (!btn) return;
  btn.removeAttribute("href");
  btn.setAttribute("aria-disabled", "true");
}

function setSecondaryButtons(release) {
  const buttons = document.querySelectorAll("[data-platform]");
  buttons.forEach((btn) => {
    const platform = btn.getAttribute("data-platform");
    const asset = release ? pickAsset(release.assets, platform) : null;
    if (asset) {
      btn.href = asset.browser_download_url;
      btn.removeAttribute("aria-disabled");
    } else {
      disableButton(btn);
    }
  });
}

function setPrimary(release, platform) {
  const primary = document.getElementById("primary-download");
  const platformLabel = document.getElementById("primary-platform");
  if (!primary || !platformLabel) return;

  platformLabel.textContent = PLATFORM_LABELS[platform] ?? "";

  const asset = release ? pickAsset(release.assets, platform) : null;
  if (asset) {
    primary.href = asset.browser_download_url;
    primary.removeAttribute("aria-disabled");
  } else {
    disableButton(primary);
  }
}

function setVersion(release, hasError) {
  const el = document.getElementById("version-display");
  if (!el) return;
  if (hasError) {
    el.textContent = "Download temporarily unavailable — please refresh";
    return;
  }
  if (!release) {
    el.textContent = "No published releases yet";
    return;
  }
  const tag = release.tag_name || "";
  const date = release.published_at
    ? new Date(release.published_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
  el.textContent = date ? `${tag} · released ${date}` : tag;
}

async function init() {
  const platform = detectPlatform();
  // Show the right platform label even before the API responds.
  setPrimary(null, platform);
  setSecondaryButtons(null);

  try {
    const res = await fetch(API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      // 404 = no published releases yet (drafts don't count). Show a graceful
      // fallback rather than a broken-link experience.
      throw new Error(`Releases API returned ${res.status}`);
    }
    const release = await res.json();
    setPrimary(release, platform);
    setSecondaryButtons(release);
    setVersion(release, false);
  } catch (err) {
    // Fall back to /releases — page stays usable; user finds the binary
    // themselves. Network failure or 404 (no releases) ends up here.
    setPrimary(null, platform);
    setSecondaryButtons(null);
    setVersion(null, true);
    // eslint-disable-next-line no-console
    console.warn("Falling back to /releases page:", err);
  }
}

// Expand <details> elements when the URL fragment matches their id, so
// deep-links from the app's "Why?" affordances land on the right answer
// already open. Chromium 105+ does this natively; this is the cross-browser
// fallback (Firefox older than 109, Safari, etc.).
function expandHashTarget() {
  const id = window.location.hash.slice(1);
  if (!id) return;
  const el = document.getElementById(id);
  if (el instanceof HTMLDetailsElement && !el.open) {
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
window.addEventListener("hashchange", expandHashTarget);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init();
    expandHashTarget();
  });
} else {
  init();
  expandHashTarget();
}
