export const audioElement = typeof Audio === "undefined" ? null : new Audio();

let playAttempt = 0;
let activePlayAttempt = null;
let loadedPlayback = { version: null, source: null };

export function getLoadedPlayback() {
	return { ...loadedPlayback };
}

export function setLoadedPlayback(version, source) {
	loadedPlayback = { version, source };
}

export function beginPlayAttempt() {
	const attempt = ++playAttempt;
	activePlayAttempt = attempt;
	return attempt;
}

export function isCurrentPlayAttempt(attempt) {
	return activePlayAttempt === attempt && attempt === playAttempt;
}

export function hasActivePlayAttempt() {
	return activePlayAttempt !== null && activePlayAttempt === playAttempt;
}

export function invalidatePlayAttempt() {
	playAttempt += 1;
	activePlayAttempt = null;
}

export function resetPlayback() {
	invalidatePlayAttempt();
	loadedPlayback = { version: null, source: null };
	if (!audioElement) return;
	audioElement.pause();
	audioElement.removeAttribute("src");
	audioElement.load();
}