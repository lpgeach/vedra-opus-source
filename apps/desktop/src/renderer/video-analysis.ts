/** What the editor needs to know about a video file to place it. */
export interface VideoFacts {
  /** Seconds. */
  length: number;
  width: number;
  height: number;
}

/**
 * Load a video's metadata for its length and picture size. Some WebM files
 * (recordings especially) carry no duration; for those the element is sent
 * to the end, which makes the browser work it out.
 */
export function measureVideo(url: string, timeoutMs = 15_000): Promise<VideoFacts> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    let done = false;
    const finish = (result: VideoFacts | Error) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const timer = window.setTimeout(
      () => finish(new Error('The video took too long to read.')),
      timeoutMs,
    );
    const known = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        finish({ length: video.duration, width: video.videoWidth, height: video.videoHeight });
        return true;
      }
      return false;
    };
    video.addEventListener('loadedmetadata', () => {
      if (!known()) video.currentTime = Number.MAX_SAFE_INTEGER;
    });
    video.addEventListener('durationchange', () => void known());
    video.addEventListener('error', () => finish(new Error('This video could not be read.')));
    video.src = url;
  });
}
