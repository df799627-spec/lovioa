import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Download,
  Film,
  GripVertical,
  GripHorizontal,
  LoaderCircle,
  LocateFixed,
  Magnet,
  Maximize2,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  SkipBack,
  SkipForward,
  Scissors,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import SEO from '../../components/SEO/SEO';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import './VideoStudio.css';

const ASPECTS = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '1:1': { width: 960, height: 960 },
};
const DEFAULT_TRANSITION_DURATION = 0.35;
const TIMELINE_TRACK_GUTTER_WIDTH = 44;
const TIMELINE_RULER_STEPS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
const TIMELINE_GUTTER_WIDTH = 40;
const TIMELINE_TRACK_PADDING = 6;

function formatTime(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function getTimelineRulerStep(zoom) {
  const minimumStep = 58 / Math.max(24, Number(zoom) || 24);
  return TIMELINE_RULER_STEPS.find(step => step >= minimumStep)
    || TIMELINE_RULER_STEPS[TIMELINE_RULER_STEPS.length - 1];
}

function getVideoSource(video) {
  return String(video?.src || video?.url || video?.videoUrl || '').trim();
}

function normalizeVideo(video, index, source) {
  const src = getVideoSource(video);
  if (!src) return null;
  return {
    id: String(video.id || `${source}-video-${index}`),
    src,
    poster: String(video.poster || video.thumbnail || video.thumbnailUrl || '').trim(),
    title: String(video.title || video.label || `Video ${String(index + 1).padStart(2, '0')}`).trim(),
    meta: String(video.meta || video.model || '').trim(),
    source,
    sourceDuration: Number(video.duration) > 0 ? Number(video.duration) : 0,
  };
}

function collectConversationVideos(conversation) {
  const workspace = conversation?.workspace || {};
  const sources = [
    ...(Array.isArray(workspace.videos) ? workspace.videos : [])
      .map((video, index) => normalizeVideo(video, index, 'workspace')),
    ...(Array.isArray(workspace.agentOutputs) ? workspace.agentOutputs : [])
      .filter(output => output?.type === 'video' && output?.src)
      .map((video, index) => normalizeVideo(video, index, 'generated')),
  ].filter(Boolean);
  const seen = new Set();
  return sources.filter(video => {
    if (seen.has(video.src)) return false;
    seen.add(video.src);
    return true;
  });
}

function getClipDuration(clip, fallback = 4) {
  const sourceDuration = Number(clip?.sourceDuration) || 0;
  const start = Math.max(0, Number(clip?.trimIn) || 0);
  const end = clip?.trimOut == null
    ? sourceDuration
    : Math.min(sourceDuration || Number(clip.trimOut), Number(clip.trimOut));
  const duration = end - start;
  return duration > 0 ? duration : fallback;
}

function getTransitionDuration(timeline, index) {
  const current = timeline[index];
  const next = timeline[index + 1];
  if (!current || !next) return 0;
  return Math.min(
    DEFAULT_TRANSITION_DURATION,
    getClipDuration(current) / 2,
    getClipDuration(next) / 2,
  );
}

function getTimelineLayout(timeline) {
  let cursor = 0;
  return timeline.map((clip, index) => {
    const duration = getClipDuration(clip);
    const transitionDuration = getTransitionDuration(timeline, index);
    const start = cursor;
    const end = start + duration;
    cursor = end - transitionDuration;
    return {
      clip,
      index,
      duration,
      start,
      end,
      transitionDuration,
      transitionStart: end - transitionDuration,
    };
  });
}

function getTimelineDuration(timeline) {
  const layout = getTimelineLayout(timeline);
  return layout[layout.length - 1]?.end || 0;
}

function snapSequenceTime(timeline, value, threshold = 0.14) {
  const duration = getTimelineDuration(timeline);
  if (!duration) return 0;
  const candidates = [0, duration];
  getTimelineLayout(timeline).forEach(item => {
    candidates.push(item.start, item.end, item.transitionStart);
  });
  const closest = candidates.reduce((best, candidate) => (
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  ), candidates[0]);
  return Math.abs(closest - value) <= threshold ? closest : value;
}

function cloneTimeline(timeline) {
  return timeline.map(clip => ({ ...clip }));
}

function locateSequenceTime(timeline, sequenceTime) {
  const layout = getTimelineLayout(timeline);
  for (const item of layout) {
    if (sequenceTime <= item.end || item.index === layout.length - 1) {
      const localTime = Math.max(0, Math.min(item.duration, sequenceTime - item.start));
      return {
        clip: item.clip,
        index: item.index,
        localTime,
        sourceTime: (Number(item.clip.trimIn) || 0) + localTime,
        transitionProgress: item.transitionDuration > 0 && sequenceTime >= item.transitionStart
          ? Math.min(1, Math.max(0, (sequenceTime - item.transitionStart) / item.transitionDuration))
          : 0,
      };
    }
  }
  return null;
}

function updateClipTrimValue(timeline, clipId, field, value, fallbackDuration = 1) {
  return timeline.map(clip => {
    if (clip.id !== clipId) return clip;
    const max = Number(clip.sourceDuration) || fallbackDuration;
    const numeric = Math.min(max, Math.max(0, Number(value) || 0));
    if (field === 'trimIn') {
      const nextIn = Math.min(numeric, Math.max(0, max - 0.1));
      const currentOut = clip.trimOut == null ? max : Number(clip.trimOut);
      return {
        ...clip,
        trimIn: nextIn,
        trimOut: Math.min(max, Math.max(currentOut, nextIn + 0.1)),
      };
    }
    const currentIn = Number(clip.trimIn) || 0;
    return {
      ...clip,
      trimOut: Math.min(max, Math.max(numeric, currentIn + 0.1)),
    };
  });
}

function waitForMediaEvent(video, eventName, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let timeoutId;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener('error', onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The video could not be read by the browser'));
    };
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('The video took too long to load'));
    }, timeoutMs);
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

function drawVideoCover(context, video, width, height, alpha = 1, clear = true) {
  if (!video.videoWidth || !video.videoHeight) return;
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const drawWidth = video.videoWidth * scale;
  const drawHeight = video.videoHeight * scale;
  if (clear) {
    context.fillStyle = '#11110f';
    context.fillRect(0, 0, width, height);
  }
  context.globalAlpha = alpha;
  context.drawImage(
    video,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  context.globalAlpha = 1;
}

export default function VideoStudio() {
  const { t } = useTranslation();
  const { currentUser, authReady } = useApp();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const transitionVideoRef = useRef(null);
  const previewARef = useRef(null);
  const previewBRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const pendingTransitionSeekRef = useRef(null);
  const transitionStartedClipRef = useRef('');
  const previewSlotIdsRef = useRef({ a: '', b: '' });
  const previewFrontSlotRef = useRef('a');
  const renderedPreviewSlotIdsRef = useRef({ a: '', b: '' });
  const timelineRef = useRef(null);
  const timelineTrackRef = useRef(null);
  const timelineHistoryRef = useRef([]);
  const timelineFutureRef = useRef([]);
  const selectionAnchorRef = useRef('');
  const contextMenuRef = useRef(null);
  const currentTimeRef = useRef(0);
  const transitionProgressRef = useRef(0);
  const hoveredTimelineFrameRef = useRef(null);
  const stageTimeRef = useRef(null);
  const transportTimeRef = useRef(null);
  const playheadRef = useRef(null);
  const minimapPlayheadRef = useRef(null);
  const [library, setLibrary] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [activeClipId, setActiveClipId] = useState('');
  const [selectedClipIds, setSelectedClipIds] = useState([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [timelineHeight, setTimelineHeight] = useState(168);
  const [timelineZoom, setTimelineZoom] = useState(76);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [hoveredTimelineTime, setHoveredTimelineTime] = useState(null);
  const [draggingClipId, setDraggingClipId] = useState('');
  const [draggingLibraryVideoId, setDraggingLibraryVideoId] = useState('');
  const [dragOverClipId, setDragOverClipId] = useState('');
  const [dropPosition, setDropPosition] = useState('');
  const [trimDrag, setTrimDrag] = useState(null);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [isSnapEnabled, setIsSnapEnabled] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [previewSlotIds, setPreviewSlotIds] = useState({ a: '', b: '' });
  const [previewFrontSlot, setPreviewFrontSlot] = useState('a');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');

  const activeIndex = timeline.findIndex(clip => clip.id === activeClipId);
  const activeClip = activeIndex >= 0 ? timeline[activeIndex] : null;
  const nextClip = activeIndex >= 0 ? timeline[activeIndex + 1] || null : null;
  const totalDuration = useMemo(
    () => getTimelineDuration(timeline),
    [timeline],
  );
  const timelineLayout = useMemo(
    () => getTimelineLayout(timeline),
    [timeline],
  );
  const timelineRulerStep = useMemo(
    () => getTimelineRulerStep(timelineZoom),
    [timelineZoom],
  );
  const activeSequenceTime = useMemo(() => {
    if (!activeClip || activeIndex < 0) return 0;
    const layout = getTimelineLayout(timeline);
    const activeLayout = layout[activeIndex];
    const localTime = Math.max(
      0,
      Math.min(getClipDuration(activeClip), currentTime - (Number(activeClip.trimIn) || 0)),
    );
    return (activeLayout?.start || 0) + localTime;
  }, [activeClip, activeIndex, currentTime, timeline]);
  const playheadPercent = totalDuration > 0
    ? Math.min(100, Math.max(0, (activeSequenceTime / totalDuration) * 100))
    : 0;
  const playheadPixel = activeSequenceTime * timelineZoom;
  const timelineTrackViewportWidth = Math.max(
    0,
    timelineViewportWidth - TIMELINE_TRACK_GUTTER_WIDTH,
  );
  const timelineViewportDuration = timelineTrackViewportWidth
    ? timelineTrackViewportWidth / Math.max(24, timelineZoom)
    : totalDuration;
  const minimapViewportPercent = totalDuration > 0
    ? Math.min(100, Math.max(0, (timelineViewportDuration / totalDuration) * 100))
    : 100;
  const minimapScrollPercent = totalDuration > 0
    ? Math.min(
      Math.max(0, 100 - minimapViewportPercent),
      Math.max(0, (timelineScrollLeft / Math.max(24, timelineZoom) / totalDuration) * 100),
    )
    : 0;
  const previewClipA = timeline.find(clip => clip.id === previewSlotIds.a) || null;
  const previewClipB = timeline.find(clip => clip.id === previewSlotIds.b) || null;

  const getActiveSequenceTime = useCallback((sourceTime = currentTimeRef.current) => {
    if (!activeClip || activeIndex < 0) return 0;
    const activeLayout = timelineLayout[activeIndex];
    const localTime = Math.max(
      0,
      Math.min(getClipDuration(activeClip), sourceTime - (Number(activeClip.trimIn) || 0)),
    );
    return (activeLayout?.start || 0) + localTime;
  }, [activeClip, activeIndex, timelineLayout]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const updatePlaybackUi = useCallback((sourceTime = currentTimeRef.current) => {
    const sequenceTime = getActiveSequenceTime(sourceTime);
    const formattedTime = `${formatTime(sequenceTime)} / ${formatTime(totalDuration)}`;
    if (stageTimeRef.current) stageTimeRef.current.textContent = formattedTime;
    if (transportTimeRef.current) transportTimeRef.current.textContent = formattedTime;

    const percent = totalDuration > 0
      ? Math.min(100, Math.max(0, (sequenceTime / totalDuration) * 100))
      : 0;
    const percentText = `${percent}%`;
    const pixelText = `${sequenceTime * timelineZoom}px`;
    if (playheadRef.current) playheadRef.current.style.left = pixelText;
    if (minimapPlayheadRef.current) minimapPlayheadRef.current.style.left = percentText;

    if (followPlayback && isPlayingRef.current && timelineRef.current && totalDuration) {
      const wrap = timelineRef.current;
      const playheadX = TIMELINE_GUTTER_WIDTH + TIMELINE_TRACK_PADDING + sequenceTime * timelineZoom;
      const targetScroll = Math.max(
        0,
        Math.min(
          Math.max(0, wrap.scrollWidth - wrap.clientWidth),
          playheadX - wrap.clientWidth * 0.42,
        ),
      );
      if (Math.abs(wrap.scrollLeft - targetScroll) > 8) {
        wrap.scrollLeft = targetScroll;
      }
    }
  }, [followPlayback, getActiveSequenceTime, timelineZoom, totalDuration]);

  const updateCurrentTime = useCallback((value, render = true) => {
    const nextTime = Math.max(0, Number(value) || 0);
    currentTimeRef.current = nextTime;
    updatePlaybackUi(nextTime);
    if (render) setCurrentTime(nextTime);
  }, [updatePlaybackUi]);

  const updateTransitionProgress = (value, render = true) => {
    const nextProgress = Math.min(1, Math.max(0, Number(value) || 0));
    transitionProgressRef.current = nextProgress;
    const frontSlot = previewFrontSlotRef.current;
    const frontVideo = frontSlot === 'a' ? previewARef.current : previewBRef.current;
    const transitionVideo = frontSlot === 'a' ? previewBRef.current : previewARef.current;
    if (nextClip) {
      if (frontVideo) frontVideo.style.opacity = String(1 - nextProgress);
      if (transitionVideo) transitionVideo.style.opacity = String(nextProgress);
    }
    if (render) setTransitionProgress(nextProgress);
  };

  useEffect(() => {
    if (!authReady) return undefined;
    if (!currentUser) {
      navigate('/auth', { state: { from: '/video-studio' }, replace: true });
      return undefined;
    }

    let cancelled = false;
    Promise.all([api.getWorkspaceState(), api.getWorkspaceConversations()])
      .then(([stateResult, conversationResult]) => {
        if (cancelled) return;
        const conversations = Array.isArray(conversationResult?.conversations)
          ? conversationResult.conversations
          : [];
        const activeConversationId = String(stateResult?.state?.activeConversationId || '');
        const activeConversation = conversations.find(item => item.id === activeConversationId)
          || conversations.find(item => collectConversationVideos(item).length > 0)
          || conversations[0];
        const videos = collectConversationVideos(activeConversation);
        setLibrary(videos);
        setTimeline(videos.map(video => ({
          ...video,
          trimIn: 0,
          trimOut: null,
        })));
        setActiveClipId(videos[0]?.id || '');
        setSelectedClipIds(videos[0]?.id ? [videos[0].id] : []);
        setProjectTitle(activeConversation?.title || t('videoStudio.projectUntitled'));
      })
      .catch(error => {
        if (cancelled) return;
        if (error?.status === 401) {
          navigate('/auth', { state: { from: '/video-studio' }, replace: true });
          return;
        }
        setLoadError(error?.message || t('videoStudio.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, currentUser, navigate, t]);

  useEffect(() => {
    const wrap = timelineRef.current;
    if (!wrap) return undefined;
    const updateWidth = () => setTimelineViewportWidth(wrap.clientWidth);
    updateWidth();
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateWidth);
    observer?.observe(wrap);
    window.addEventListener('resize', updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  useEffect(() => {
    if (!followPlayback || !isPlayingRef.current || !timelineRef.current || !totalDuration) return;
    const wrap = timelineRef.current;
    const playheadX = TIMELINE_GUTTER_WIDTH + TIMELINE_TRACK_PADDING + activeSequenceTime * timelineZoom;
    const targetScroll = Math.max(
      0,
      Math.min(
        Math.max(0, wrap.scrollWidth - wrap.clientWidth),
        playheadX - wrap.clientWidth * 0.42,
      ),
    );
    if (Math.abs(wrap.scrollLeft - targetScroll) > 8) {
      wrap.scrollLeft = targetScroll;
    }
  }, [activeSequenceTime, followPlayback, timelineZoom, totalDuration]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const firstItem = contextMenuRef.current?.querySelector('button:not(:disabled)');
    firstItem?.focus();
    const handlePointerDown = event => {
      if (!event.target.closest?.('.video-studio__context-menu')) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const syncPreviewSlots = (clipId, { seek = null, preserveFront = true } = {}) => {
    const selectedIndex = timeline.findIndex(clip => clip.id === clipId);
    if (selectedIndex < 0) return;
    const frontSlot = preserveFront ? previewFrontSlotRef.current : 'a';
    const backSlot = frontSlot === 'a' ? 'b' : 'a';
    const nextSlots = { a: '', b: '' };
    nextSlots[frontSlot] = clipId;
    nextSlots[backSlot] = timeline[selectedIndex + 1]?.id || '';
    previewSlotIdsRef.current = nextSlots;
    previewFrontSlotRef.current = frontSlot;
    setPreviewSlotIds(nextSlots);
    setPreviewFrontSlot(frontSlot);
    pendingSeekRef.current = seek;
  };

  useEffect(() => {
    if (!activeClipId || !timeline.length) {
      renderedPreviewSlotIdsRef.current = { a: '', b: '' };
      if (previewSlotIdsRef.current.a || previewSlotIdsRef.current.b) {
        const emptySlots = { a: '', b: '' };
        previewSlotIdsRef.current = emptySlots;
        setPreviewSlotIds(emptySlots);
      }
      return;
    }
    const selectedIndex = timeline.findIndex(clip => clip.id === activeClipId);
    if (selectedIndex < 0) return;
    const frontSlot = previewFrontSlotRef.current;
    const backSlot = frontSlot === 'a' ? 'b' : 'a';
    const expectedBackId = timeline[selectedIndex + 1]?.id || '';
    const currentSlots = previewSlotIdsRef.current;
    if (
      currentSlots[frontSlot] === activeClipId
      && currentSlots[backSlot] === expectedBackId
    ) return;
    const nextSlots = { a: '', b: '' };
    nextSlots[frontSlot] = activeClipId;
    nextSlots[backSlot] = expectedBackId;
    previewSlotIdsRef.current = nextSlots;
    setPreviewSlotIds(nextSlots);
    setPreviewFrontSlot(frontSlot);
    pendingSeekRef.current = Number(timeline[selectedIndex].trimIn) || 0;
    transitionStartedClipRef.current = '';
  }, [activeClipId, timeline]);

  useEffect(() => {
    const elements = {
      a: previewARef.current,
      b: previewBRef.current,
    };
    const frontSlot = previewFrontSlotRef.current;
    const backSlot = frontSlot === 'a' ? 'b' : 'a';
    videoRef.current = elements[frontSlot];
    transitionVideoRef.current = elements[backSlot];

    ['a', 'b'].forEach(slot => {
      const video = elements[slot];
      const clipId = previewSlotIdsRef.current[slot];
      if (!video || renderedPreviewSlotIdsRef.current[slot] === clipId) return;
      video.pause();
      video.volume = slot === frontSlot ? 1 : 0;
      if (!clipId) {
        renderedPreviewSlotIdsRef.current[slot] = '';
        video.removeAttribute('src');
        video.load();
        return;
      }
      const clip = timeline.find(item => item.id === clipId);
      if (!clip?.src) return;
      renderedPreviewSlotIdsRef.current[slot] = clipId;
      video.src = clip.src;
      if (slot === backSlot) {
        pendingTransitionSeekRef.current = Number(clip?.trimIn) || 0;
      }
      video.load();
    });
  }, [previewSlotIds, previewFrontSlot, timeline]);

  const commitTimeline = nextTimeline => {
    timelineHistoryRef.current = [
      ...timelineHistoryRef.current.slice(-39),
      cloneTimeline(timeline),
    ];
    timelineFutureRef.current = [];
    setCanUndo(timelineHistoryRef.current.length > 0);
    setCanRedo(false);
    setTimeline(nextTimeline);
  };

  const selectClip = (clipId, {
    keepPlaying = false,
    seek = null,
    extend = false,
    range = false,
    toggle = false,
    preserveSelectionAnchor = false,
    transitionProgress: nextTransitionProgress = 0,
  } = {}) => {
    const selectedClip = timeline.find(clip => clip.id === clipId);
    if (!selectedClip) return;
    syncPreviewSlots(clipId, { seek });
    let nextCurrentTime = seek == null
      ? Number(selectedClip.trimIn) || 0
      : Number(seek) || 0;
    const frontSlot = previewFrontSlotRef.current;
    const frontVideo = frontSlot === 'a' ? previewARef.current : previewBRef.current;
    if (
      frontVideo
      && renderedPreviewSlotIdsRef.current[frontSlot] === clipId
      && frontVideo.readyState >= 1
    ) {
      const duration = Number(frontVideo.duration);
      nextCurrentTime = Number.isFinite(duration) && duration > 0
        ? Math.min(nextCurrentTime, Math.max(0, duration - 0.05))
        : nextCurrentTime;
      frontVideo.currentTime = nextCurrentTime;
      pendingSeekRef.current = null;
    }
    setActiveClipId(clipId);
    setSelectedClipIds(current => {
      if (range || extend) {
        const anchorId = selectionAnchorRef.current || activeClipId || clipId;
        const anchorIndex = timeline.findIndex(clip => clip.id === anchorId);
        const targetIndex = timeline.findIndex(clip => clip.id === clipId);
        if (anchorIndex < 0 || targetIndex < 0) return [clipId];
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        return timeline.slice(start, end + 1).map(clip => clip.id);
      }
      if (toggle) {
        return current.includes(clipId)
          ? current.filter(id => id !== clipId)
          : [...current, clipId];
      }
      return [clipId];
    });
    if (!preserveSelectionAnchor) selectionAnchorRef.current = clipId;
    updateCurrentTime(nextCurrentTime);
    updateTransitionProgress(nextTransitionProgress);
    transitionStartedClipRef.current = '';
    if (!keepPlaying) {
      videoRef.current?.pause();
      setIsPlaying(false);
      transitionVideoRef.current?.pause();
      transitionVideoRef.current && (transitionVideoRef.current.volume = 0);
    }
  };

  const advanceClip = shouldPlay => {
    if (activeIndex < 0 || activeIndex >= timeline.length - 1) {
      videoRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    const nextClip = timeline[activeIndex + 1];
    const followingClip = timeline[activeIndex + 2] || null;
    const currentFrontSlot = previewFrontSlotRef.current;
    const nextFrontSlot = currentFrontSlot === 'a' ? 'b' : 'a';
    const oldFrontVideo = videoRef.current;
    const nextFrontVideo = transitionVideoRef.current;
    const transitionSeek = transitionStartedClipRef.current === activeClip?.id
      ? nextFrontVideo?.currentTime
      : null;
    const nextSlots = {
      a: previewSlotIdsRef.current.a,
      b: previewSlotIdsRef.current.b,
    };
    nextSlots[nextFrontSlot] = nextClip.id;
    nextSlots[currentFrontSlot] = followingClip?.id || '';
    previewSlotIdsRef.current = nextSlots;
    previewFrontSlotRef.current = nextFrontSlot;
    videoRef.current = nextFrontVideo;
    transitionVideoRef.current = oldFrontVideo;
    pendingSeekRef.current = null;
    transitionStartedClipRef.current = '';
    setPreviewSlotIds(nextSlots);
    setPreviewFrontSlot(nextFrontSlot);
    setActiveClipId(nextClip.id);
    setSelectedClipIds([nextClip.id]);
    updateTransitionProgress(0);
    updateCurrentTime(
      Number.isFinite(transitionSeek)
        ? transitionSeek
        : Number(nextClip.trimIn) || 0,
    );
    nextFrontVideo && (nextFrontVideo.volume = 1);
    oldFrontVideo && (oldFrontVideo.volume = 0);
    oldFrontVideo?.pause();
    if (shouldPlay && nextFrontVideo) {
      setIsPlaying(true);
      nextFrontVideo.play().catch(() => {
        setIsPlaying(false);
        setNotice(t('videoStudio.mediaError'));
      });
    } else {
      setIsPlaying(false);
    }
  };

  const handleLoadedMetadata = event => {
    const video = event.currentTarget;
    const slot = video === previewARef.current ? 'a' : 'b';
    const clipId = previewSlotIdsRef.current[slot];
    const clip = timeline.find(item => item.id === clipId) || activeClip;
    if (!clip || slot !== previewFrontSlotRef.current) return;
    const duration = Number(video.duration);
    if (!Number.isFinite(duration) || duration <= 0) return;
    setTimeline(current => current.map(item => (
      item.id === clip.id
        ? {
          ...item,
          sourceDuration: duration,
          trimOut: item.trimOut == null ? duration : Math.min(item.trimOut, duration),
        }
        : item
    )));
    const target = pendingSeekRef.current == null
      ? Number(clip.trimIn) || 0
      : pendingSeekRef.current;
    pendingSeekRef.current = null;
    video.volume = 1;
    video.currentTime = Math.min(Math.max(0, target), Math.max(0, duration - 0.05));
    updateCurrentTime(video.currentTime);
    if (isPlaying) {
      video.play().catch(() => {
        setIsPlaying(false);
        setNotice(t('videoStudio.mediaError'));
      });
    }
  };

  const handleTransitionLoadedMetadata = event => {
    const video = event.currentTarget;
    const slot = video === previewARef.current ? 'a' : 'b';
    const clipId = previewSlotIdsRef.current[slot];
    const clip = timeline.find(item => item.id === clipId);
    if (!clip || slot === previewFrontSlotRef.current) return;
    const duration = Number(video.duration);
    if (Number.isFinite(duration) && duration > 0) {
      setTimeline(current => current.map(item => (
        item.id === clip.id
          ? {
            ...item,
            sourceDuration: duration,
            trimOut: item.trimOut == null ? duration : Math.min(item.trimOut, duration),
          }
          : item
      )));
    }
    const target = pendingTransitionSeekRef.current == null
      ? Number(clip.trimIn) || 0
      : pendingTransitionSeekRef.current;
    if (target != null && Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(Math.max(0, target), Math.max(0, video.duration - 0.05));
      pendingTransitionSeekRef.current = null;
    }
    if (isPlaying && transitionProgressRef.current > 0) {
      video.play().catch(() => {});
    }
  };

  const handlePreviewLoadedMetadata = event => {
    const slot = event.currentTarget === previewARef.current ? 'a' : 'b';
    if (slot === previewFrontSlotRef.current) {
      handleLoadedMetadata(event);
    } else {
      handleTransitionLoadedMetadata(event);
    }
  };

  const handleTimeUpdate = event => {
    const video = event.currentTarget;
    if (video !== videoRef.current) return;
    const time = Number(video.currentTime) || 0;
    updateCurrentTime(time, false);
    if (!activeClip || activeIndex < 0) return;
    const trimIn = Number(activeClip.trimIn) || 0;
    const trimOut = activeClip.trimOut == null
      ? Number(video.duration) || Number(activeClip.sourceDuration) || trimIn + getClipDuration(activeClip)
      : Number(activeClip.trimOut);
    const transitionDuration = getTransitionDuration(timeline, activeIndex);
    const transitionStart = trimOut - transitionDuration;
    const inTransition = Boolean(nextClip)
      && transitionDuration > 0
      && time >= transitionStart
      && time < trimOut - 0.02;

    if (inTransition) {
      const progress = Math.min(1, Math.max(0, (time - transitionStart) / transitionDuration));
      const incoming = transitionVideoRef.current;
      const outgoing = videoRef.current;
      const incomingReady = Boolean(incoming && incoming.readyState >= 1);
      updateTransitionProgress(incomingReady ? progress : 0, false);
      if (incoming) {
        const effectiveProgress = incomingReady ? progress : 0;
        incoming.volume = Math.sin(effectiveProgress * Math.PI / 2);
        if (incomingReady) {
          const expectedTime = (Number(nextClip.trimIn) || 0) + (time - transitionStart);
          if (!isPlaying || Math.abs(incoming.currentTime - expectedTime) > 0.12) {
            incoming.currentTime = Math.min(
              Math.max(0, expectedTime),
              Math.max(0, Number(incoming.duration) - 0.05),
            );
          }
          if (isPlaying && transitionStartedClipRef.current !== activeClip.id) {
            transitionStartedClipRef.current = activeClip.id;
            incoming.play().catch(() => {});
          }
        }
      }
      if (outgoing) {
        outgoing.volume = Math.cos((incomingReady ? progress : 0) * Math.PI / 2);
      }
    } else if (transitionStartedClipRef.current === activeClip.id && time < transitionStart) {
      transitionStartedClipRef.current = '';
      updateTransitionProgress(0);
      transitionVideoRef.current?.pause();
      transitionVideoRef.current && (transitionVideoRef.current.volume = 0);
      video.volume = 1;
    }

    if (time >= trimOut - 0.05) {
      advanceClip(isPlaying);
    }
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video || !activeClip) return;
    if (isPlaying) {
      video.pause();
      transitionVideoRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    if (getActiveSequenceTime() >= totalDuration - 0.05) {
      const firstClip = timeline[0];
      if (!firstClip) return;
      selectClip(firstClip.id, {
        seek: Number(firstClip.trimIn) || 0,
        keepPlaying: true,
      });
      setIsPlaying(true);
      window.requestAnimationFrame(() => {
        videoRef.current?.play().catch(() => {
          setIsPlaying(false);
          setNotice(t('videoStudio.mediaError'));
        });
      });
      return;
    }
    if (activeClip.trimOut != null && video.currentTime >= activeClip.trimOut - 0.05) {
      if (activeIndex < timeline.length - 1) {
        advanceClip(true);
        return;
      }
      pendingSeekRef.current = Number(activeClip.trimIn) || 0;
      video.currentTime = pendingSeekRef.current;
    }
    setIsPlaying(true);
    video.play().catch(() => {
      setIsPlaying(false);
      setNotice(t('videoStudio.mediaError'));
    });
    if (transitionProgressRef.current > 0) {
      transitionVideoRef.current?.play().catch(() => {});
    }
  };

  const resetPreview = () => {
    if (!activeClip) return;
    selectClip(activeClip.id, { seek: Number(activeClip.trimIn) || 0 });
    setNotice('');
  };

  const seekToProjectEdge = edge => {
    if (!timeline.length || !totalDuration) return;
    const targetSequenceTime = edge === 'end'
      ? Math.max(0, totalDuration - 0.05)
      : 0;
    const location = locateSequenceTime(timeline, targetSequenceTime);
    if (!location) return;
    const clipEnd = location.clip.trimOut == null
      ? Number(location.clip.sourceDuration) || location.sourceTime + 0.05
      : Number(location.clip.trimOut);
    const targetSourceTime = edge === 'end'
      ? Math.min(
        Math.max(Number(location.clip.trimIn) || 0, clipEnd - 0.05),
        location.sourceTime,
      )
      : Number(location.clip.trimIn) || 0;
    selectClip(location.clip.id, {
      seek: targetSourceTime,
      transitionProgress: location.transitionProgress,
    });
  };

  const handleTimelineClick = event => {
    if (!timelineTrackRef.current || !timeline.length || event.target.closest('button')) return;
    const targetTime = getSequenceTimeFromClientX(event.clientX);
    if (isSplitMode) {
      splitAtSequenceTime(targetTime);
      return;
    }
    const location = locateSequenceTime(timeline, targetTime);
    if (location) {
      selectClip(location.clip.id, {
        seek: location.sourceTime,
        transitionProgress: location.transitionProgress,
      });
    }
  };

  const handleMinimapClick = event => {
    if (!timeline.length || !totalDuration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const sequenceTime = Math.min(
      totalDuration,
      Math.max(0, ((event.clientX - rect.left) / Math.max(1, rect.width)) * totalDuration),
    );
    const location = locateSequenceTime(timeline, sequenceTime);
    if (!location) return;
    selectClip(location.clip.id, {
      seek: location.sourceTime,
      transitionProgress: location.transitionProgress,
    });
  };

  const addToTimeline = video => {
    if (timeline.some(clip => clip.src === video.src)) {
      setNotice(t('videoStudio.alreadyAdded'));
      return;
    }
    const nextClip = { ...video, trimIn: 0, trimOut: null };
    commitTimeline([...timeline, nextClip]);
    setActiveClipId(nextClip.id);
    setSelectedClipIds([nextClip.id]);
    setNotice(t('videoStudio.addedToTimeline'));
  };

  const resetLibraryDrag = () => {
    setDraggingLibraryVideoId('');
    setDragOverClipId('');
    setDropPosition('');
  };

  const insertLibraryVideo = (video, targetClipId = '', position = 'after') => {
    if (!video) return;
    if (timeline.some(clip => clip.src === video.src)) {
      setNotice(t('videoStudio.alreadyAdded'));
      resetLibraryDrag();
      return;
    }

    const nextClip = { ...video, trimIn: 0, trimOut: null };
    const nextTimeline = [...timeline];
    const targetIndex = targetClipId
      ? nextTimeline.findIndex(clip => clip.id === targetClipId)
      : -1;
    const insertIndex = targetIndex < 0
      ? nextTimeline.length
      : position === 'before'
        ? targetIndex
        : targetIndex + 1;
    nextTimeline.splice(insertIndex, 0, nextClip);
    commitTimeline(nextTimeline);
    setActiveClipId(nextClip.id);
    setSelectedClipIds([nextClip.id]);
    setNotice(t('videoStudio.addedToTimeline'));
    resetLibraryDrag();
  };

  const handleLibraryDrop = (event, targetClipId = '', position = 'after') => {
    event.preventDefault();
    event.stopPropagation();
    const video = library.find(item => item.id === draggingLibraryVideoId);
    insertLibraryVideo(video, targetClipId, position);
  };

  const removeSelectedClips = idsToRemove => {
    const ids = new Set(idsToRemove?.length ? idsToRemove : selectedClipIds.length ? selectedClipIds : [activeClipId]);
    const firstRemovedIndex = timeline.findIndex(clip => ids.has(clip.id));
    if (firstRemovedIndex < 0) return;
    const nextTimeline = timeline.filter(clip => !ids.has(clip.id));
    commitTimeline(nextTimeline);
    const replacement = nextTimeline[Math.min(firstRemovedIndex, nextTimeline.length - 1)];
    setActiveClipId(replacement?.id || '');
    setSelectedClipIds(replacement?.id ? [replacement.id] : []);
    updateCurrentTime(Number(replacement?.trimIn) || 0);
    setIsPlaying(false);
    setNotice(t('videoStudio.deletedClips', { count: ids.size }));
  };

  const removeClip = clipId => removeSelectedClips([clipId]);

  const moveClip = (clipId, direction) => {
    const index = timeline.findIndex(clip => clip.id === clipId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= timeline.length) return;
    const next = [...timeline];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    commitTimeline(next);
  };

  const duplicateClip = clipId => {
    const index = timeline.findIndex(clip => clip.id === clipId);
    if (index < 0) return;
    const clip = timeline[index];
    let copyIndex = 1;
    while (timeline.some(item => item.id === `${clip.id}-copy-${copyIndex}`)) {
      copyIndex += 1;
    }
    const copy = {
      ...clip,
      id: `${clip.id}-copy-${copyIndex}`,
      title: `${clip.title} ${t('videoStudio.copySuffix')}`,
    };
    const nextTimeline = [...timeline];
    nextTimeline.splice(index + 1, 0, copy);
    commitTimeline(nextTimeline);
    setActiveClipId(copy.id);
    setSelectedClipIds([copy.id]);
    updateCurrentTime(Number(copy.trimIn) || 0);
    setNotice(t('videoStudio.duplicatedClip'));
  };

  const handleClipContextMenu = (event, clip) => {
    event.preventDefault();
    event.stopPropagation();
    if (clip.id !== activeClipId) {
      selectClip(clip.id, { seek: Number(clip.trimIn) || 0 });
    }
    setContextMenu({
      clipId: clip.id,
      x: Math.min(event.clientX, Math.max(12, window.innerWidth - 222)),
      y: Math.min(event.clientY, Math.max(12, window.innerHeight - 286)),
    });
  };

  const handleContextMenuAction = action => {
    const clipId = contextMenu?.clipId;
    const clip = timeline.find(item => item.id === clipId);
    if (!clip) {
      setContextMenu(null);
      return;
    }
    setContextMenu(null);
    if (action === 'select') {
      selectClip(clip.id, { seek: Number(clip.trimIn) || 0 });
    } else if (action === 'split' && clip.id === activeClipId) {
      splitAtSequenceTime(getActiveSequenceTime());
    } else if (action === 'duplicate') {
      duplicateClip(clip.id);
    } else if (action === 'moveUp') {
      moveClip(clip.id, -1);
    } else if (action === 'moveDown') {
      moveClip(clip.id, 1);
    } else if (action === 'remove') {
      removeClip(clip.id);
    }
  };

  const updateTrim = (field, value) => {
    if (!activeClip) return;
    const max = Number(activeClip.sourceDuration) || Number(videoRef.current?.duration) || 1;
    commitTimeline(updateClipTrimValue(timeline, activeClip.id, field, value, max));
    if (field === 'trimIn' && videoRef.current) {
      const numeric = Math.min(max, Math.max(0, Number(value) || 0));
      videoRef.current.currentTime = numeric;
    updateCurrentTime(numeric);
    }
  };

  const getSequenceTimeFromClientX = clientX => {
    const track = timelineTrackRef.current;
    if (!track || !totalDuration) return 0;
    const rect = track.getBoundingClientRect();
    const sequenceTime = Math.min(
      totalDuration,
      Math.max(0, (clientX - rect.left - TIMELINE_TRACK_PADDING) / Math.max(24, timelineZoom)),
    );
    return isSnapEnabled ? snapSequenceTime(timeline, sequenceTime) : sequenceTime;
  };

  const splitAtSequenceTime = sequenceTime => {
    const snappedSequenceTime = isSnapEnabled
      ? snapSequenceTime(timeline, sequenceTime)
      : sequenceTime;
    const location = locateSequenceTime(timeline, snappedSequenceTime);
    if (!location) return;
    const clip = location.clip;
    const duration = getClipDuration(clip);
    if (location.localTime < 0.1 || location.localTime > duration - 0.1) {
      setNotice(t('videoStudio.splitUnavailable'));
      return;
    }
    const sourceDuration = Number(clip.sourceDuration)
      || Number(videoRef.current?.duration)
      || Math.max(Number(clip.trimOut) || 0, getClipDuration(clip));
    const splitSourceTime = Math.min(
      sourceDuration - 0.05,
      Math.max((Number(clip.trimIn) || 0) + 0.05, location.sourceTime),
    );
    const splitId = `${clip.id}-split-${Math.round(snappedSequenceTime * 1000)}-${timeline.length}`;
    const firstClip = {
      ...clip,
      id: `${splitId}-a`,
      sourceDuration,
      trimOut: splitSourceTime,
    };
    const secondClip = {
      ...clip,
      id: `${splitId}-b`,
      sourceDuration,
      trimIn: splitSourceTime,
    };
    const nextTimeline = timeline.flatMap(item => (
      item.id === clip.id ? [firstClip, secondClip] : [item]
    ));
    commitTimeline(nextTimeline);
    setActiveClipId(secondClip.id);
    setSelectedClipIds([secondClip.id]);
    pendingSeekRef.current = splitSourceTime;
    updateCurrentTime(splitSourceTime);
    setNotice(t('videoStudio.splitSuccess'));
  };

  const handleTimelinePointerMove = event => {
    if (!timeline.length || draggingClipId || trimDrag) return;
    const sequenceTime = getSequenceTimeFromClientX(event.clientX);
    if (hoveredTimelineFrameRef.current === null) {
      hoveredTimelineFrameRef.current = window.requestAnimationFrame(() => {
        hoveredTimelineFrameRef.current = null;
        setHoveredTimelineTime(sequenceTime);
      });
    }
    if (isPlaying) return;
    const location = locateSequenceTime(timeline, sequenceTime);
    if (!location) return;
    if (location.clip.id !== activeClipId) {
      selectClip(location.clip.id, {
        seek: location.sourceTime,
        preserveSelectionAnchor: true,
      });
      return;
    }
    if (!videoRef.current) return;
    const target = Math.max(
      Number(location.clip.trimIn) || 0,
      Math.min(
        Number(location.clip.trimOut) || Number(videoRef.current.duration) || location.sourceTime,
        location.sourceTime,
      ),
    );
    if (Math.abs(videoRef.current.currentTime - target) < 0.06) return;
    videoRef.current.currentTime = target;
    updateCurrentTime(target);
  };

  const handleTimelinePointerLeave = () => {
    if (hoveredTimelineFrameRef.current !== null) {
      window.cancelAnimationFrame(hoveredTimelineFrameRef.current);
      hoveredTimelineFrameRef.current = null;
    }
    setHoveredTimelineTime(null);
  };

  const handleClipClick = (event, clip) => {
    event.stopPropagation();
    if (trimDrag) return;
    if (isSplitMode) {
      splitAtSequenceTime(getSequenceTimeFromClientX(event.clientX));
      return;
    }
    const layout = timelineLayout.find(item => item.clip.id === clip.id);
    const sequenceTime = getSequenceTimeFromClientX(event.clientX);
    const localTime = layout
      ? Math.max(0, Math.min(layout.duration, sequenceTime - layout.start))
      : 0;
    selectClip(clip.id, {
      seek: (Number(clip.trimIn) || 0) + localTime,
      range: event.shiftKey,
      toggle: event.metaKey || event.ctrlKey,
    });
  };

  const handleClipDrop = (targetClipId, position = dropPosition || 'before') => {
    if (!draggingClipId || draggingClipId === targetClipId) return;
    const nextTimeline = [...timeline];
    const fromIndex = nextTimeline.findIndex(clip => clip.id === draggingClipId);
    if (fromIndex < 0) return;
    const [movedClip] = nextTimeline.splice(fromIndex, 1);
    const targetIndex = nextTimeline.findIndex(clip => clip.id === targetClipId);
    if (targetIndex < 0) return;
    nextTimeline.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, movedClip);
    commitTimeline(nextTimeline);
    setDraggingClipId('');
    setDragOverClipId('');
    setDropPosition('');
  };

  const beginTimelineTrim = (event, clipId, field) => {
    event.preventDefault();
    event.stopPropagation();
    const clip = timeline.find(item => item.id === clipId);
    if (!clip) return;
    setActiveClipId(clipId);
    setSelectedClipIds([clipId]);
    const initialTimeline = cloneTimeline(timeline);
    const startValue = field === 'trimIn'
      ? Number(clip.trimIn) || 0
      : clip.trimOut == null
        ? Number(clip.sourceDuration) || Number(videoRef.current?.duration) || getClipDuration(clip)
        : Number(clip.trimOut);
    const fallbackDuration = Number(clip.sourceDuration)
      || Number(videoRef.current?.duration)
      || getClipDuration(clip);
    const startX = event.clientX;
    let changed = false;
    setTrimDrag({ clipId, field, value: startValue });

    const handleMove = moveEvent => {
      const rawValue = startValue + ((moveEvent.clientX - startX) / Math.max(24, timelineZoom));
      const nextValue = isSnapEnabled ? Math.round(rawValue * 10) / 10 : rawValue;
      const nextTimeline = updateClipTrimValue(timeline, clipId, field, nextValue, fallbackDuration);
      setTimeline(current => updateClipTrimValue(current, clipId, field, nextValue, fallbackDuration));
      const nextClip = nextTimeline.find(item => item.id === clipId);
      const effectiveValue = field === 'trimIn' ? nextClip?.trimIn : nextClip?.trimOut;
      setTrimDrag({ clipId, field, value: Number(effectiveValue) || 0 });
      if (nextClip && videoRef.current && clipId === activeClipId) {
        const nextTrimIn = Number(nextClip.trimIn) || 0;
        const nextTrimOut = nextClip.trimOut == null
          ? fallbackDuration
          : Number(nextClip.trimOut);
        const currentVideoTime = Number(videoRef.current.currentTime) || nextTrimIn;
        if (field === 'trimIn' || currentVideoTime > nextTrimOut) {
          const nextTime = Math.max(nextTrimIn, Math.min(nextTrimOut - 0.05, currentVideoTime));
          videoRef.current.currentTime = nextTime;
          updateCurrentTime(nextTime);
        }
      }
      changed = nextTimeline.some((item, index) => (
        item.trimIn !== timeline[index]?.trimIn || item.trimOut !== timeline[index]?.trimOut
      ));
    };

    const handleUp = () => {
      if (changed) {
        timelineHistoryRef.current = [
          ...timelineHistoryRef.current.slice(-39),
          initialTimeline,
        ];
        timelineFutureRef.current = [];
        setCanUndo(timelineHistoryRef.current.length > 0);
        setCanRedo(false);
      }
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      setTrimDrag(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const startTimelineResize = event => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = timelineHeight;
    const handleMove = moveEvent => {
      const nextHeight = startHeight - (moveEvent.clientY - startY);
      setTimelineHeight(Math.min(420, Math.max(170, nextHeight)));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const undoTimeline = () => {
    const previous = timelineHistoryRef.current.pop();
    if (!previous) return;
    timelineFutureRef.current.push(cloneTimeline(timeline));
    setTimeline(previous);
    setCanUndo(timelineHistoryRef.current.length > 0);
    setCanRedo(timelineFutureRef.current.length > 0);
    const nextActive = previous.find(clip => clip.id === activeClipId) || previous[0];
    setActiveClipId(nextActive?.id || '');
    setSelectedClipIds(nextActive?.id ? [nextActive.id] : []);
    setNotice(t('videoStudio.undo'));
  };

  const redoTimeline = () => {
    const next = timelineFutureRef.current.pop();
    if (!next) return;
    timelineHistoryRef.current.push(cloneTimeline(timeline));
    setTimeline(next);
    setCanUndo(timelineHistoryRef.current.length > 0);
    setCanRedo(timelineFutureRef.current.length > 0);
    const nextActive = next.find(clip => clip.id === activeClipId) || next[0];
    setActiveClipId(nextActive?.id || '');
    setSelectedClipIds(nextActive?.id ? [nextActive.id] : []);
    setNotice(t('videoStudio.redo'));
  };

  const fitTimeline = () => {
    const width = Math.max(
      240,
      (timelineRef.current?.clientWidth || 720) - TIMELINE_TRACK_GUTTER_WIDTH,
    );
    if (!totalDuration) return;
    setTimelineZoom(Math.min(180, Math.max(28, (width - TIMELINE_TRACK_PADDING * 2 - 4) / totalDuration)));
    if (timelineRef.current) timelineRef.current.scrollLeft = 0;
    setTimelineScrollLeft(0);
  };

  const zoomTimelineTo = (nextZoom, anchorClientX = null) => {
    const wrap = timelineRef.current;
    const clampedZoom = Math.min(180, Math.max(24, Number(nextZoom) || 24));
    if (!wrap || !totalDuration) {
      setTimelineZoom(clampedZoom);
      return;
    }

    const rect = wrap.getBoundingClientRect();
    const viewportX = anchorClientX == null
      ? rect.left + rect.width / 2
      : anchorClientX;
    const currentOffset = wrap.scrollLeft + viewportX - rect.left - TIMELINE_GUTTER_WIDTH - TIMELINE_TRACK_PADDING;
    const anchorTime = Math.min(
      totalDuration,
      Math.max(0, currentOffset / Math.max(24, timelineZoom)),
    );

    setTimelineZoom(clampedZoom);
    window.requestAnimationFrame(() => {
      if (!timelineRef.current) return;
      const nextOffset = TIMELINE_GUTTER_WIDTH + TIMELINE_TRACK_PADDING + anchorTime * clampedZoom;
      timelineRef.current.scrollLeft = Math.max(
        0,
        nextOffset - (viewportX - rect.left),
      );
    });
  };

  const zoomTimelineBy = (delta, anchorClientX = null) => {
    zoomTimelineTo(timelineZoom + delta, anchorClientX);
  };

  const handleTimelineWheel = event => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomTimelineBy(-event.deltaY * 0.08, event.clientX);
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.5
      ? event.deltaX
      : event.deltaY;
    if (!delta || !timelineRef.current) return;
    event.preventDefault();
    timelineRef.current.scrollLeft += delta;
  };

  useEffect(() => {
    const handleKeyDown = event => {
      if (
        event.target instanceof HTMLInputElement
        || event.target instanceof HTMLSelectElement
        || event.target instanceof HTMLTextAreaElement
        || event.target?.isContentEditable
      ) return;
      const hasModifier = event.metaKey || event.ctrlKey;
      if (hasModifier && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) redoTimeline();
        else undoTimeline();
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (hasModifier && (event.code === 'Equal' || event.code === 'NumpadAdd')) {
        event.preventDefault();
        setTimelineZoom(current => Math.min(180, current + 12));
        return;
      }
      if (hasModifier && (event.code === 'Minus' || event.code === 'NumpadSubtract')) {
        event.preventDefault();
        setTimelineZoom(current => Math.max(24, current - 12));
        return;
      }
      if (event.code === 'Delete' || event.code === 'Backspace') {
        event.preventDefault();
        removeSelectedClips();
        return;
      }
      if ((event.code === 'KeyC' || event.code === 'KeyS') && !hasModifier && !event.altKey) {
        event.preventDefault();
        splitAtSequenceTime(getActiveSequenceTime());
        return;
      }
      if (event.code === 'Escape') {
        setSelectedClipIds([]);
        setIsSplitMode(false);
        return;
      }
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        if (!activeClip || !videoRef.current) return;
        event.preventDefault();
        const step = event.shiftKey ? 1 : 0.1;
        const direction = event.code === 'ArrowLeft' ? -1 : 1;
        const min = Number(activeClip.trimIn) || 0;
        const max = activeClip.trimOut == null
          ? Number(activeClip.sourceDuration) || Number(videoRef.current.duration) || Infinity
          : Number(activeClip.trimOut);
        const nextTime = Math.min(max, Math.max(min, videoRef.current.currentTime + direction * step));
        videoRef.current.currentTime = nextTime;
        updateCurrentTime(nextTime);
        return;
      }
      if (event.code === 'KeyI' || event.code === 'KeyO') {
        if (!activeClip || !videoRef.current) return;
        event.preventDefault();
        updateTrim(event.code === 'KeyI' ? 'trimIn' : 'trimOut', videoRef.current.currentTime);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeClip,
    activeSequenceTime,
    getActiveSequenceTime,
    isPlaying,
    redoTimeline,
    removeSelectedClips,
    selectedClipIds,
    splitAtSequenceTime,
    timeline,
    timelineZoom,
    t,
    togglePlayback,
    updateCurrentTime,
    undoTimeline,
    updateTrim,
  ]);

  const handleExport = async () => {
    if (!timeline.length || isExporting) return;
    const canvasStreamSupported = HTMLCanvasElement.prototype.captureStream;
    if (!canvasStreamSupported || typeof MediaRecorder === 'undefined') {
      setNotice(t('videoStudio.exportUnsupported'));
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setNotice(t('videoStudio.exportUnsupported'));
      return;
    }

    setIsExporting(true);
    setNotice('');
    let exportVideos = [];
    let canvas;
    let canvasStream;
    let audioContext;
    let recorder;
    let recording;
    let animationFrame;
    try {
      const dimensions = ASPECTS[aspectRatio];
      canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error(t('videoStudio.exportUnsupported'));

      exportVideos = [0, 1].map(() => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.preload = 'auto';
        video.muted = false;
        return video;
      });
      const loadVideoSource = async (video, src) => {
        if (video.getAttribute('src') === src && video.readyState >= 1) return;
        video.pause();
        video.src = src;
        video.load();
        await waitForMediaEvent(video, 'loadedmetadata');
      };
      const seekVideo = async (video, time) => {
        const target = Math.min(
          Math.max(0, time),
          Math.max(0, Number(video.duration) - 0.05),
        );
        const seeked = waitForMediaEvent(video, 'seeked');
        video.currentTime = target;
        await seeked;
      };
      const prepareClip = async (video, clip) => {
        await loadVideoSource(video, clip.src);
        await seekVideo(video, Number(clip.trimIn) || 0);
      };

      // Read actual durations first so short clips get a smaller, safe overlap.
      const exportTimeline = [];
      for (const clip of timeline) {
        await loadVideoSource(exportVideos[0], clip.src);
        const sourceDuration = Number(exportVideos[0].duration);
        const trimIn = Math.min(sourceDuration, Math.max(0, Number(clip.trimIn) || 0));
        const trimOut = Math.min(
          sourceDuration,
          clip.trimOut == null ? sourceDuration : Number(clip.trimOut),
        );
        if (trimOut > trimIn) {
          exportTimeline.push({ ...clip, sourceDuration, trimIn, trimOut });
        }
      }
      if (!exportTimeline.length) throw new Error(t('videoStudio.exportFailedGeneric'));

      audioContext = new AudioContextClass();
      await audioContext.resume();
      const audioDestination = audioContext.createMediaStreamDestination();
      const audioGains = new Map();
      exportVideos.forEach(video => {
        const audioSource = audioContext.createMediaElementSource(video);
        const gain = audioContext.createGain();
        gain.gain.value = 0;
        audioSource.connect(gain).connect(audioDestination);
        audioGains.set(video, gain);
      });

      canvasStream = canvas.captureStream(30);
      const stream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);
      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recording = new Promise((resolve, reject) => {
        recorder.ondataavailable = event => {
          if (event.data?.size) chunks.push(event.data);
        };
        recorder.onerror = () => reject(new Error(t('videoStudio.exportFailedGeneric')));
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
      });

      const setGain = (video, value) => {
        const gain = audioGains.get(video);
        if (gain) gain.gain.value = value;
      };
      const drawUntil = (video, endTime) => new Promise(resolve => {
        const drawFrame = () => {
          drawVideoCover(context, video, canvas.width, canvas.height, 1, true);
          if (video.currentTime >= endTime - 0.04 || video.ended) {
            resolve();
            return;
          }
          animationFrame = window.requestAnimationFrame(drawFrame);
        };
        drawFrame();
      });

      let currentVideo = exportVideos[0];
      let incomingVideo = exportVideos[1];
      const firstClip = exportTimeline[0];
      await prepareClip(currentVideo, firstClip);
      if (exportTimeline[1]) await prepareClip(incomingVideo, exportTimeline[1]);

      recorder.start(250);
      setGain(currentVideo, 1);
      await currentVideo.play();

      for (let index = 0; index < exportTimeline.length; index += 1) {
        const clip = exportTimeline[index];
        const next = exportTimeline[index + 1];
        const transitionDuration = getTransitionDuration(exportTimeline, index);
        const transitionStart = Number(clip.trimOut) - transitionDuration;

        if (!next || transitionDuration <= 0) {
          await drawUntil(currentVideo, Number(clip.trimOut));
          currentVideo.pause();
          continue;
        }

        await drawUntil(currentVideo, transitionStart);
        setGain(currentVideo, 1);
        setGain(incomingVideo, 0);
        await incomingVideo.play();

        await new Promise(resolve => {
          const drawFrame = () => {
            const progress = Math.min(
              1,
              Math.max(0, (currentVideo.currentTime - transitionStart) / transitionDuration),
            );
            const outgoingAlpha = Math.cos(progress * Math.PI / 2);
            const incomingAlpha = Math.sin(progress * Math.PI / 2);
            setGain(currentVideo, outgoingAlpha);
            setGain(incomingVideo, incomingAlpha);
            drawVideoCover(context, currentVideo, canvas.width, canvas.height, outgoingAlpha, true);
            drawVideoCover(context, incomingVideo, canvas.width, canvas.height, incomingAlpha, false);
            if (progress >= 1 || currentVideo.ended || incomingVideo.ended) {
              resolve();
              return;
            }
            animationFrame = window.requestAnimationFrame(drawFrame);
          };
          drawFrame();
        });

        currentVideo.pause();
        setGain(currentVideo, 0);
        [currentVideo, incomingVideo] = [incomingVideo, currentVideo];
        setGain(currentVideo, 1);
        const following = exportTimeline[index + 2];
        if (following) await prepareClip(incomingVideo, following);
      }

      if (recorder.state !== 'inactive') recorder.stop();
      const blob = await recording;
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${projectTitle || 'lovioa-cut'}.webm`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setNotice(t('videoStudio.exported'));
    } catch (error) {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      setNotice(t('videoStudio.exportFailed', {
        message: error?.message || t('videoStudio.exportFailedGeneric'),
      }));
    } finally {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      exportVideos.forEach(video => {
        video.pause();
        video.removeAttribute('src');
        video.load();
      });
      canvasStream?.getTracks().forEach(track => track.stop());
      audioContext?.close().catch(() => {});
      setIsExporting(false);
    }
  };

  const rangeMax = Number(activeClip?.sourceDuration) || 1;
  const trimIn = Number(activeClip?.trimIn) || 0;
  const trimOut = activeClip?.trimOut == null ? rangeMax : Number(activeClip.trimOut);
  const contextClip = contextMenu
    ? timeline.find(clip => clip.id === contextMenu.clipId)
    : null;
  const contextClipIndex = contextClip
    ? timeline.findIndex(clip => clip.id === contextClip.id)
    : -1;

  return (
    <div className={`video-studio ${trimDrag ? 'is-trimming' : ''}`}>
      <SEO title={t('videoStudio.metaTitle')} description={t('videoStudio.metaDescription')} />
      <header className="video-studio__topbar">
        <div className="video-studio__brand">
          <Link to="/workspace" className="video-studio__back" title={t('videoStudio.backWorkspace')} aria-label={t('videoStudio.backWorkspace')}>
            <ArrowLeft size={16} />
          </Link>
          <span className="video-studio__brand-mark"><Film size={16} /></span>
          <div>
            <strong>{t('videoStudio.brand')}</strong>
          </div>
        </div>
        <div className="video-studio__project">
          <input
            value={projectTitle}
            onChange={event => setProjectTitle(event.target.value)}
            aria-label={t('videoStudio.projectTitle')}
          />
        </div>
        <div className="video-studio__top-actions">
          <button type="button" className="video-studio__export-button" onClick={handleExport} disabled={!timeline.length || isExporting}>
            {isExporting ? <LoaderCircle size={15} className="is-spinning" /> : <Download size={15} />}
            {isExporting ? t('videoStudio.exporting') : t('videoStudio.export')}
          </button>
        </div>
      </header>

      <main className="video-studio__layout">
        <aside className="video-studio__library">
          <div className="video-studio__panel-heading">
            <div>
              <h2>{t('videoStudio.library')}</h2>
            </div>
            <span className="video-studio__count">{library.length}</span>
          </div>
          <p className="video-studio__panel-note">{t('videoStudio.libraryHint')}</p>
          <div className="video-studio__library-list">
            {isLoading && (
              <div className="video-studio__loading"><LoaderCircle size={18} className="is-spinning" /> {t('videoStudio.loading')}</div>
            )}
            {!isLoading && !loadError && library.length === 0 && (
              <div className="video-studio__empty">
                <Film size={22} />
                <strong>{t('videoStudio.emptyLibraryTitle')}</strong>
                <span>{t('videoStudio.emptyLibraryHint')}</span>
                <Link to="/workspace"><ArrowRight size={14} /> {t('videoStudio.openWorkspace')}</Link>
              </div>
            )}
            {!isLoading && library.map(video => {
              const inTimeline = timeline.some(clip => clip.src === video.src);
              return (
                <article
                  className={`video-studio__library-item ${inTimeline ? 'is-added' : ''} ${draggingLibraryVideoId === video.id ? 'is-dragging' : ''}`}
                  key={`${video.source}-${video.id}`}
                  draggable={!inTimeline}
                  onDragStart={event => {
                    if (inTimeline) return;
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData('text/plain', video.id);
                    event.dataTransfer.setData('application/x-video-studio-asset', video.id);
                    setDraggingLibraryVideoId(video.id);
                    setDragOverClipId('');
                    setDropPosition('');
                  }}
                  onDragEnd={resetLibraryDrag}
                >
                  <div className="video-studio__library-thumb">
                    <video src={video.src} poster={video.poster || undefined} muted playsInline preload="none" />
                    <span><Play size={12} fill="currentColor" /></span>
                  </div>
                  <div className="video-studio__library-copy">
                    <strong title={video.title}>{video.title}</strong>
                    <span>{video.meta || t('videoStudio.videoProduct')}</span>
                  </div>
                  <button
                    type="button"
                    className="video-studio__add-button"
                    title={inTimeline ? t('videoStudio.inTimeline') : t('videoStudio.addToTimeline')}
                    aria-label={inTimeline ? t('videoStudio.inTimeline') : t('videoStudio.addToTimeline')}
                    onClick={() => addToTimeline(video)}
                    disabled={inTimeline}
                  >
                    {inTimeline ? <Check size={15} /> : <Plus size={15} />}
                  </button>
                </article>
              );
            })}
          </div>
          {loadError && (
            <div className="video-studio__error">
              <strong>{t('videoStudio.loadFailed')}</strong>
              <span>{loadError}</span>
              <button type="button" onClick={() => window.location.reload()}><RotateCcw size={14} /> {t('videoStudio.retry')}</button>
            </div>
          )}
        </aside>

        <section className="video-studio__main">
          <div className={`video-studio__stage video-studio__stage--${aspectRatio.replace(':', '-')}`}>
            {activeClip ? (
              <>
                <video
                  ref={previewARef}
                  className={`video-studio__player ${previewFrontSlot === 'a' ? '' : 'video-studio__player--transition'}`}
                  poster={previewClipA?.poster || undefined}
                  style={{
                    opacity: previewFrontSlot === 'a'
                      ? (nextClip ? 1 - transitionProgress : 1)
                      : transitionProgress,
                  }}
                  playsInline
                  preload={previewFrontSlot === 'a' ? 'metadata' : 'auto'}
                  aria-hidden={previewFrontSlot !== 'a'}
                  onLoadedMetadata={handlePreviewLoadedMetadata}
                  onTimeUpdate={previewFrontSlot === 'a' ? handleTimeUpdate : undefined}
                  onPlay={previewFrontSlot === 'a' ? () => setIsPlaying(true) : undefined}
                  onPause={previewFrontSlot === 'a' ? () => setIsPlaying(false) : undefined}
                  onError={() => setNotice(t('videoStudio.mediaError'))}
                />
                <video
                  ref={previewBRef}
                  className={`video-studio__player ${previewFrontSlot === 'b' ? '' : 'video-studio__player--transition'}`}
                  poster={previewClipB?.poster || undefined}
                  style={{
                    opacity: previewFrontSlot === 'b'
                      ? 1
                      : (nextClip ? transitionProgress : 0),
                  }}
                  playsInline
                  preload={previewFrontSlot === 'b' ? 'metadata' : 'auto'}
                  aria-hidden={previewFrontSlot !== 'b'}
                  onLoadedMetadata={handlePreviewLoadedMetadata}
                  onTimeUpdate={previewFrontSlot === 'b' ? handleTimeUpdate : undefined}
                  onPlay={previewFrontSlot === 'b' ? () => setIsPlaying(true) : undefined}
                  onPause={previewFrontSlot === 'b' ? () => setIsPlaying(false) : undefined}
                  onError={() => setNotice(t('videoStudio.mediaError'))}
                />
                <div className="video-studio__stage-overlay">
                  <span ref={stageTimeRef}>{formatTime(activeSequenceTime)} / {formatTime(totalDuration)}</span>
                  <button type="button" title={t('videoStudio.fullscreen')} aria-label={t('videoStudio.fullscreen')} onClick={() => videoRef.current?.requestFullscreen?.()}>
                    <Maximize2 size={14} />
                  </button>
                </div>
              </>
            ) : (
              <div className="video-studio__stage-empty">
                <span><Scissors size={22} /></span>
                <strong>{t('videoStudio.emptyTimelineTitle')}</strong>
                <p>{t('videoStudio.emptyTimelineHint')}</p>
              </div>
            )}
          </div>
          <div className="video-studio__transport">
            <div className="video-studio__transport-time"><span ref={transportTimeRef}>{formatTime(activeSequenceTime)} / {formatTime(totalDuration)}</span></div>
            <div className="video-studio__transport-center">
              <button type="button" className="video-studio__transport-button" title={t('videoStudio.jumpToStart')} aria-label={t('videoStudio.jumpToStart')} onClick={() => seekToProjectEdge('start')} disabled={!activeClip}>
                <SkipBack size={15} />
              </button>
              <button type="button" className="video-studio__play-button" title={isPlaying ? t('videoStudio.pause') : t('videoStudio.play')} aria-label={isPlaying ? t('videoStudio.pause') : t('videoStudio.play')} onClick={togglePlayback} disabled={!activeClip}>
                {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
              </button>
              <button type="button" className="video-studio__transport-button" title={t('videoStudio.jumpToEnd')} aria-label={t('videoStudio.jumpToEnd')} onClick={() => seekToProjectEdge('end')} disabled={!activeClip}>
                <SkipForward size={15} />
              </button>
              <button type="button" className="video-studio__transport-button" title={t('videoStudio.reset')} aria-label={t('videoStudio.reset')} onClick={resetPreview} disabled={!activeClip}>
                <RotateCcw size={14} />
              </button>
            </div>
            <div className="video-studio__transport-right">
              <button
                type="button"
                className={`video-studio__transport-button video-studio__transport-tool ${isSplitMode ? 'is-active' : ''}`}
                title={t('videoStudio.splitMode')}
                aria-label={t('videoStudio.splitMode')}
                aria-pressed={isSplitMode}
                onClick={() => setIsSplitMode(current => !current)}
              >
                <Scissors size={15} />
              </button>
              <button type="button" className="video-studio__transport-button" title={t('videoStudio.zoomOut')} aria-label={t('videoStudio.zoomOut')} onClick={() => zoomTimelineBy(-12)}>
                <ZoomOut size={15} />
              </button>
              <button type="button" className="video-studio__transport-button" title={t('videoStudio.zoomIn')} aria-label={t('videoStudio.zoomIn')} onClick={() => zoomTimelineBy(12)}>
                <ZoomIn size={15} />
              </button>
            </div>
          </div>

          <div className="video-studio__timeline-section" style={{ height: `${timelineHeight}px`, flex: '0 0 auto' }}>
            <div
              className="video-studio__timeline-resize"
              onPointerDown={startTimelineResize}
              role="separator"
              aria-orientation="horizontal"
              title={t('videoStudio.resizeTimeline')}
            >
              <GripHorizontal size={15} />
            </div>
            <div className="video-studio__timeline-body">
              <div className="video-studio__timeline-tools">
                <button type="button" className="video-studio__timeline-tool" title={t('videoStudio.undo')} aria-label={t('videoStudio.undo')} onClick={undoTimeline} disabled={!canUndo}>
                  <Undo2 size={14} />
                </button>
                <button type="button" className="video-studio__timeline-tool" title={t('videoStudio.redo')} aria-label={t('videoStudio.redo')} onClick={redoTimeline} disabled={!canRedo}>
                  <Redo2 size={14} />
                </button>
                <button type="button" className="video-studio__timeline-tool" title={t('videoStudio.fitTimeline')} aria-label={t('videoStudio.fitTimeline')} onClick={fitTimeline}>
                  <Maximize2 size={14} />
                </button>
                <button
                  type="button"
                  className={`video-studio__timeline-tool ${isSnapEnabled ? 'is-active' : ''}`}
                  title={t('videoStudio.snap')}
                  aria-label={t('videoStudio.snap')}
                  aria-pressed={isSnapEnabled}
                  onClick={() => setIsSnapEnabled(current => !current)}
                >
                  <Magnet size={14} />
                </button>
                <button
                  type="button"
                  className={`video-studio__timeline-tool ${followPlayback ? 'is-active' : ''}`}
                  title={t('videoStudio.followPlayback')}
                  aria-label={t('videoStudio.followPlayback')}
                  aria-pressed={followPlayback}
                  onClick={() => setFollowPlayback(current => !current)}
                >
                  <LocateFixed size={14} />
                </button>
                {selectedClipIds.length > 1 && (
                  <button
                    type="button"
                    className="video-studio__timeline-tool is-danger"
                    title={t('videoStudio.removeSelected')}
                    aria-label={t('videoStudio.removeSelected')}
                    onClick={() => removeSelectedClips()}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div
                className={`video-studio__timeline-wrap ${draggingLibraryVideoId ? 'is-library-drop-active' : ''}`}
                ref={timelineRef}
                onClick={handleTimelineClick}
                onScroll={event => setTimelineScrollLeft(event.currentTarget.scrollLeft)}
                onPointerMove={handleTimelinePointerMove}
                onPointerLeave={handleTimelinePointerLeave}
                onWheel={handleTimelineWheel}
                onDragOver={event => {
                  if (!draggingLibraryVideoId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={event => {
                  if (!draggingLibraryVideoId) return;
                  handleLibraryDrop(event);
                }}
              >
                <div className="video-studio__timeline-canvas">
                  <div className="video-studio__track-gutter" title={t('videoStudio.videoTrack')} aria-label={t('videoStudio.videoTrack')}>
                    <Film size={15} />
                  </div>
                  <div
                    className={`video-studio__track ${isSplitMode ? 'is-split-mode' : ''} ${trimDrag ? 'is-trimming' : ''}`}
                    ref={timelineTrackRef}
                    style={{ width: `${Math.max(100, totalDuration * timelineZoom)}px` }}
                  >
                <div className="video-studio__time-ruler">
                  {Array.from({ length: Math.max(2, Math.ceil(totalDuration / timelineRulerStep) + 1) }, (_, index) => (
                    <span key={index} style={{ left: `${Math.min(100, (index * timelineRulerStep / Math.max(0.01, totalDuration)) * 100)}%` }}>
                      {formatTime(index * timelineRulerStep)}
                    </span>
                  ))}
                </div>
                {timelineLayout.map(item => item.transitionDuration > 0 && (
                  <span
                    key={`transition-${item.clip.id}`}
                    className="video-studio__transition-marker"
                    style={{
                      left: `${item.transitionStart * timelineZoom}px`,
                      width: `${item.transitionDuration * timelineZoom}px`,
                    }}
                    title={t('videoStudio.crossfadeDuration', { duration: item.transitionDuration.toFixed(1) })}
                    aria-label={t('videoStudio.crossfadeDuration', { duration: item.transitionDuration.toFixed(1) })}
                  />
                ))}
                {timeline.length === 0 && <div className="video-studio__track-empty">{t('videoStudio.emptyTimelineHint')}</div>}
                {timeline.map((clip, index) => {
                  const layout = timelineLayout[index];
                  return (
                    <button
                      type="button"
                      draggable
                      className={`video-studio__clip ${clip.id === activeClipId ? 'is-active' : ''} ${selectedClipIds.includes(clip.id) ? 'is-selected' : ''} ${trimDrag?.clipId === clip.id ? 'is-trimming' : ''} ${draggingClipId === clip.id ? 'is-dragging' : ''} ${dragOverClipId === clip.id ? 'is-drag-over' : ''} ${dragOverClipId === clip.id && dropPosition === 'before' ? 'is-drop-before' : ''} ${dragOverClipId === clip.id && dropPosition === 'after' ? 'is-drop-after' : ''}`}
                      key={clip.id}
                      style={{
                        width: `${Math.max(92, layout.duration * timelineZoom)}px`,
                        left: `${layout.start * timelineZoom}px`,
                      }}
                      onClick={event => handleClipClick(event, clip)}
                      onContextMenu={event => handleClipContextMenu(event, clip)}
                      onDragStart={event => {
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggingClipId(clip.id);
                        setDropPosition('');
                      }}
                      onDragOver={event => {
                        event.preventDefault();
                        if (draggingLibraryVideoId) {
                          event.dataTransfer.dropEffect = 'copy';
                          setDragOverClipId(clip.id);
                          const rect = event.currentTarget.getBoundingClientRect();
                          setDropPosition(event.clientX < rect.left + rect.width / 2 ? 'before' : 'after');
                          return;
                        }
                        if (draggingClipId === clip.id) return;
                        setDragOverClipId(clip.id);
                        const rect = event.currentTarget.getBoundingClientRect();
                        setDropPosition(event.clientX < rect.left + rect.width / 2 ? 'before' : 'after');
                      }}
                      onDrop={event => {
                        if (draggingLibraryVideoId) {
                          handleLibraryDrop(event, clip.id, dropPosition || 'after');
                          return;
                        }
                        event.preventDefault();
                        handleClipDrop(clip.id, dropPosition);
                      }}
                      onDragEnd={() => {
                        setDraggingClipId('');
                        setDragOverClipId('');
                        setDropPosition('');
                      }}
                    >
                      <video
                        className="video-studio__clip-preview"
                        src={`${clip.src}#t=0.1`}
                        poster={clip.poster || undefined}
                        muted
                        playsInline
                        preload="metadata"
                        draggable="false"
                        aria-hidden="true"
                      />
                      <span className="video-studio__clip-handle video-studio__clip-handle--in" onPointerDown={event => beginTimelineTrim(event, clip.id, 'trimIn')} />
                      <span className="video-studio__clip-grip"><GripVertical size={13} /></span>
                      <span className="video-studio__clip-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="video-studio__clip-name">{clip.title}</span>
                      <span className="video-studio__clip-duration">{formatTime(getClipDuration(clip))}</span>
                      {trimDrag?.clipId === clip.id && (
                        <span className="video-studio__trim-readout">
                          {trimDrag.field === 'trimIn' ? t('videoStudio.trimIn') : t('videoStudio.trimOut')} {formatTime(trimDrag.value)}
                        </span>
                      )}
                      <span className="video-studio__clip-handle video-studio__clip-handle--out" onPointerDown={event => beginTimelineTrim(event, clip.id, 'trimOut')} />
                    </button>
                  );
                })}
                {timeline.length > 0 && <span ref={playheadRef} className="video-studio__playhead" style={{ left: `${playheadPixel}px` }} />}
                {hoveredTimelineTime != null && timeline.length > 0 && (
                  <>
                    <span className="video-studio__timeline-hover-line" style={{ left: `${hoveredTimelineTime * timelineZoom}px` }} />
                    <span className="video-studio__timeline-hover" style={{ left: `${hoveredTimelineTime * timelineZoom}px` }}>
                      {formatTime(hoveredTimelineTime)}
                    </span>
                  </>
                )}
                  </div>
                </div>
              </div>
            </div>
            {timeline.length > 0 && (
              <button
                type="button"
                className="video-studio__timeline-minimap"
                title={t('videoStudio.timelineOverview')}
                aria-label={t('videoStudio.timelineOverview')}
                onClick={handleMinimapClick}
              >
                <span className="video-studio__timeline-minimap-track">
                  {timelineLayout.map(item => (
                    <span
                      key={item.clip.id}
                      className={`video-studio__timeline-minimap-clip ${item.clip.id === activeClipId ? 'is-active' : ''}`}
                      style={{
                        left: `${(item.start / Math.max(0.01, totalDuration)) * 100}%`,
                        width: `${((item.end - item.start) / Math.max(0.01, totalDuration)) * 100}%`,
                      }}
                    />
                  ))}
                  <span
                    className="video-studio__timeline-minimap-viewport"
                    style={{
                      left: `${minimapScrollPercent}%`,
                      width: `${minimapViewportPercent}%`,
                    }}
                  />
                  <span
                    ref={minimapPlayheadRef}
                    className="video-studio__timeline-minimap-playhead"
                    style={{ left: `${playheadPercent}%` }}
                  />
                </span>
              </button>
            )}
          </div>
        </section>

        <aside className="video-studio__inspector">
          <div className="video-studio__panel-heading">
            <div>
              <h2>{t('videoStudio.selectedClipTitle')}</h2>
            </div>
          </div>
          {activeClip ? (
            <>
              <div className="video-studio__selected-clip">
                <div className="video-studio__selected-thumb">
                  <video src={activeClip.src} poster={activeClip.poster || undefined} muted playsInline preload="none" />
                  <span>{String(activeIndex + 1).padStart(2, '0')}</span>
                </div>
                <div>
                  <strong>{activeClip.title}</strong>
                  <span>{activeClip.meta || t('videoStudio.videoProduct')}</span>
                </div>
              </div>
              <div className="video-studio__inspector-block">
                <div className="video-studio__inspector-block-heading">
                  <label>{t('videoStudio.trim')}</label>
                  <span>{formatTime(getClipDuration(activeClip))}</span>
                </div>
                <div className="video-studio__trim-row">
                  <span>{t('videoStudio.trimIn')}</span>
                  <input type="number" min="0" max={rangeMax} step="0.1" value={trimIn.toFixed(1)} onChange={event => updateTrim('trimIn', event.target.value)} />
                </div>
                <input className="video-studio__range" type="range" min="0" max={rangeMax} step="0.1" value={trimIn} onChange={event => updateTrim('trimIn', event.target.value)} />
                <div className="video-studio__trim-row">
                  <span>{t('videoStudio.trimOut')}</span>
                  <input type="number" min="0" max={rangeMax} step="0.1" value={trimOut.toFixed(1)} onChange={event => updateTrim('trimOut', event.target.value)} />
                </div>
                <input className="video-studio__range" type="range" min="0" max={rangeMax} step="0.1" value={trimOut} onChange={event => updateTrim('trimOut', event.target.value)} />
              </div>
              <div className="video-studio__inspector-block">
                <div className="video-studio__inspector-block-heading">
                  <label>{t('videoStudio.order')}</label>
                  <span>{String(activeIndex + 1).padStart(2, '0')} / {String(timeline.length).padStart(2, '0')}</span>
                </div>
                <div className="video-studio__order-actions">
                  <button type="button" title={t('videoStudio.moveUp')} aria-label={t('videoStudio.moveUp')} onClick={() => moveClip(activeClip.id, -1)} disabled={activeIndex <= 0}><ArrowUp size={15} /></button>
                  <button type="button" title={t('videoStudio.moveDown')} aria-label={t('videoStudio.moveDown')} onClick={() => moveClip(activeClip.id, 1)} disabled={activeIndex < 0 || activeIndex >= timeline.length - 1}><ArrowDown size={15} /></button>
                  <button type="button" className="is-danger" title={t('videoStudio.remove')} aria-label={t('videoStudio.remove')} onClick={() => removeClip(activeClip.id)}><Trash2 size={15} /></button>
                </div>
              </div>
            </>
          ) : (
            <div className="video-studio__inspector-empty">
              <Scissors size={20} />
              <span>{t('videoStudio.noClipSelected')}</span>
            </div>
          )}
          <div className="video-studio__inspector-block video-studio__format-block">
            <div className="video-studio__inspector-block-heading">
              <label>{t('videoStudio.aspectRatio')}</label>
              <span>{aspectRatio}</span>
            </div>
            <div className="video-studio__aspect-options">
              {Object.keys(ASPECTS).map(ratio => (
                <button key={ratio} type="button" className={aspectRatio === ratio ? 'is-active' : ''} onClick={() => setAspectRatio(ratio)}>{ratio}</button>
              ))}
            </div>
          </div>
          <div className="video-studio__export-note">
            <Download size={15} />
            <span>{t('videoStudio.exportHint')}</span>
          </div>
        </aside>
      </main>

      {notice && (
        <div className="video-studio__notice" role="status">
          <span>{notice}</span>
          <button type="button" title={t('videoStudio.dismiss')} aria-label={t('videoStudio.dismiss')} onClick={() => setNotice('')}><X size={14} /></button>
        </div>
      )}
      {contextMenu && contextClip && (
        <div
          ref={contextMenuRef}
          className="video-studio__context-menu"
          role="menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onKeyDown={event => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            const items = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled)'));
            if (!items.length) return;
            const currentIndex = items.indexOf(document.activeElement);
            const nextIndex = event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            event.preventDefault();
            event.stopPropagation();
            items[nextIndex]?.focus();
          }}
        >
          <button type="button" role="menuitem" onClick={() => handleContextMenuAction('select')}>
            <LocateFixed size={14} />
            {t('videoStudio.selectClip')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={contextClip.id !== activeClipId}
            onClick={() => handleContextMenuAction('split')}
          >
            <Scissors size={14} />
            {t('videoStudio.splitAtPlayhead')}
          </button>
          <span className="video-studio__context-menu-divider" />
          <button type="button" role="menuitem" onClick={() => handleContextMenuAction('duplicate')}>
            <Copy size={14} />
            {t('videoStudio.duplicateClip')}
          </button>
          <button type="button" role="menuitem" onClick={() => handleContextMenuAction('moveUp')} disabled={contextClipIndex <= 0}>
            <ArrowUp size={14} />
            {t('videoStudio.moveUp')}
          </button>
          <button type="button" role="menuitem" onClick={() => handleContextMenuAction('moveDown')} disabled={contextClipIndex < 0 || contextClipIndex >= timeline.length - 1}>
            <ArrowDown size={14} />
            {t('videoStudio.moveDown')}
          </button>
          <span className="video-studio__context-menu-divider" />
          <button type="button" role="menuitem" className="is-danger" onClick={() => handleContextMenuAction('remove')}>
            <Trash2 size={14} />
            {t('videoStudio.remove')}
          </button>
        </div>
      )}
    </div>
  );
}
