"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";

interface WordRecord {
  id: number;
  word: string;
  author: string;
  timestamp: string;
  ip: string;
  country?: string;
}

interface BoundingBox2D {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Convert 2-letter ISO country code to its corresponding emoji flag
const getFlagEmoji = (countryCode: string) => {
  if (!countryCode || countryCode === "Local" || countryCode === "Unknown") {
    return "🌍";
  }
  const code = countryCode.toUpperCase();
  // Check if it's a valid 2-letter code
  if (code.length !== 2) return "🌍";

  const codePoints = code
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  try {
    return String.fromCodePoint(...codePoints);
  } catch (e) {
    return "🌍";
  }
};

const UPI_ID = "yashvardhan4646@okicici";


export default function WindingThreadPage() {
  // Data state
  const [words, setWords] = useState<WordRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inputWord, setInputWord] = useState("");
  const [inputAuthor, setInputAuthor] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [clientIp, setClientIp] = useState("");
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  // UI state
  const [isMuted, setIsMuted] = useState(true);
  const [hoveredWordId, setHoveredWordId] = useState<number | null>(null);
  const [selectedWordId, setSelectedWordId] = useState<number | null>(null);
  const [isSpotlightTour, setIsSpotlightTour] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDelayNodeRef = useRef<DelayNode | null>(null);

  // 2D Camera parameters: offsets represent center, scale represents zoom factor
  const cameraRef = useRef({
    x: 0,
    y: 0,
    scale: 1.0,
  });

  // Target coordinates for smooth pan animations
  const targetCamRef = useRef<{
    x: number;
    y: number;
    scale: number;
    active: boolean;
  }>({
    x: 0,
    y: 0,
    scale: 1.0,
    active: false,
  });

  // Drag interaction tracking state
  const dragRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    startCamX: 0,
    startCamY: 0,
  });

  // Bounding boxes for mouse clicks on 2D labels
  const textBoundsRef = useRef<BoundingBox2D[]>([]);

  // Fetch words
  const fetchThreadData = async (shouldAutoCenter = false) => {
    try {
      const res = await fetch("/api/thread");
      if (!res.ok) throw new Error("Failed to fetch thread");
      const data: WordRecord[] = await res.json();
      setWords(data);

      // Auto focus camera on newest word
      if (shouldAutoCenter && data.length > 0) {
        const lastIndex = data.length - 1;
        const lastT = lastIndex * 140;
        const lastX = Math.sin(lastT * 0.008) * 160;
        const lastY = -lastT;

        targetCamRef.current = {
          x: lastX,
          y: lastY - 40,
          scale: 1.15,
          active: true,
        };
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Poll for updates
  useEffect(() => {
    fetchThreadData();
    const interval = setInterval(() => {
      if (!submitting && !targetCamRef.current.active && !dragRef.current.isDragging) {
        fetchThreadData();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [submitting]);

  // Fetch client's public IP address for local testing country detection
  useEffect(() => {
    const getPublicIp = async () => {
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        if (res.ok) {
          const data = await res.json();
          if (data && data.ip) {
            setClientIp(data.ip);
          }
        }
      } catch (err) {
        console.warn("Could not fetch client public IP for dev environment geolocation:", err);
      }
    };
    getPublicIp();
  }, []);

  // Audio setup
  const initAudio = () => {
    if (audioCtxRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();

      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.25;

      const feedback = ctx.createGain();
      feedback.gain.value = 0.3;

      delay.connect(feedback);
      feedback.connect(delay);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;

      delay.connect(filter);
      filter.connect(ctx.destination);

      audioCtxRef.current = ctx;
      audioDelayNodeRef.current = delay;
    } catch (e) {
      console.warn(e);
    }
  };

  // Play chime synth
  const playChime = (wordId: number, isMajor = true) => {
    if (isMuted || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const pentatonicScales = [261.63, 293.66, 329.63, 392.00, 440.00];
      const scaleIndex = wordId % pentatonicScales.length;
      const octaveOffset = Math.floor(wordId / pentatonicScales.length) % 2;
      const freq = pentatonicScales[scaleIndex] * (octaveOffset + 1);

      osc.frequency.value = freq;
      osc.type = isMajor ? "sine" : "triangle";

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(isMajor ? 0.15 : 0.22, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (isMajor ? 0.6 : 1.4));

      osc.connect(gain);
      gain.connect(ctx.destination);
      if (audioDelayNodeRef.current) {
        gain.connect(audioDelayNodeRef.current);
      }

      osc.start();
      osc.stop(ctx.currentTime + (isMajor ? 0.7 : 1.6));
    } catch (e) {
      console.error(e);
    }
  };

  // Submit word
  const handleWordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    initAudio();

    if (!inputWord.trim()) {
      setErrorMsg("Write a word first.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: inputWord.trim(),
          author: inputAuthor.trim() || "Anonymous",
          clientIp: clientIp,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add word.");

      setInputWord("");
      setSuccessMsg(`Word verified & added to the Winding Thread!`);

      setWords(data.data);

      setTimeout(() => playChime(data.record.id, true), 30);
      setTimeout(() => playChime(data.record.id + 2, true), 150);

      const newIdx = data.data.length - 1;
      const lastT = newIdx * 140;
      const lastX = Math.sin(lastT * 0.008) * 160;
      const lastY = -lastT;

      setSelectedWordId(data.record.id);
      targetCamRef.current = {
        x: lastX,
        y: lastY - 40,
        scale: 1.2,
        active: true,
      };
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  };

  const getWordCoordinates = (index: number) => {
    const t = index * 140;
    const x = Math.sin(t * 0.008) * 160;
    const y = -t;
    return { x, y };
  };

  // Spotlight Auto Tour Mode
  useEffect(() => {
    if (!isSpotlightTour || words.length === 0) return;

    let index = 0;
    const triggerNextFocus = () => {
      if (!isSpotlightTour) return;
      const word = words[index];
      const coords = getWordCoordinates(index);

      setSelectedWordId(word.id);
      playChime(word.id, true);

      targetCamRef.current = {
        x: coords.x,
        y: coords.y - 45,
        scale: 1.25,
        active: true,
      };

      index = (index + 1) % words.length;
    };

    triggerNextFocus();
    const tourInterval = setInterval(() => {
      if (isSpotlightTour) triggerNextFocus();
    }, 4500);

    return () => clearInterval(tourInterval);
  }, [isSpotlightTour, words]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    let animationId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationId = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationId = requestAnimationFrame(render);
        return;
      }

      const width = window.innerWidth;
      const height = window.innerHeight;

      if (canvas.width !== width || canvas.height !== height) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);
      }

      const camera = cameraRef.current;
      const targetCam = targetCamRef.current;
      if (targetCam.active) {
        const lerp = 0.08;
        camera.x += (targetCam.x - camera.x) * lerp;
        camera.y += (targetCam.y - camera.y) * lerp;
        camera.scale += (targetCam.scale - camera.scale) * lerp;

        const dist = Math.sqrt(Math.pow(targetCam.x - camera.x, 2) + Math.pow(targetCam.y - camera.y, 2));
        if (dist < 1.0 && Math.abs(targetCam.scale - camera.scale) < 0.01) {
          targetCam.active = false;
        }
      }

      // Clear with flat light gray
      ctx.fillStyle = "#f3f3f6";
      ctx.fillRect(0, 0, width, height);

      const project2D = (px: number, py: number) => {
        const sx = width / 2 + (px - camera.x) * camera.scale;
        const sy = height / 2 + (py - camera.y) * camera.scale;
        return { x: sx, y: sy };
      };

      // 1. Draw Flat Grid Map Lines (Soft gray grid)
      ctx.strokeStyle = "#e2e2e8";
      ctx.lineWidth = 1.0;

      const gridSpacing = 160;
      const startGridX = Math.floor((camera.x - width / 2 / camera.scale) / gridSpacing) * gridSpacing;
      const endGridX = Math.ceil((camera.x + width / 2 / camera.scale) / gridSpacing) * gridSpacing;
      const startGridY = Math.floor((camera.y - height / 2 / camera.scale) / gridSpacing) * gridSpacing;
      const endGridY = Math.ceil((camera.y + height / 2 / camera.scale) / gridSpacing) * gridSpacing;

      for (let gx = startGridX; gx <= endGridX; gx += gridSpacing) {
        const projStart = project2D(gx, startGridY);
        const projEnd = project2D(gx, endGridY);
        ctx.beginPath();
        ctx.moveTo(projStart.x, 0);
        ctx.lineTo(projEnd.x, height);
        ctx.stroke();
      }

      for (let gy = startGridY; gy <= endGridY; gy += gridSpacing) {
        const projStart = project2D(startGridX, gy);
        const projEnd = project2D(endGridX, gy);
        ctx.beginPath();
        ctx.moveTo(0, projStart.y);
        ctx.lineTo(width, projEnd.y);
        ctx.stroke();
      }

      // 2. Draw Connection Thread Pathway (Flat dark gray with yellow core)
      if (words.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = "#c7c7cc";
        ctx.lineWidth = Math.max(1.5, 4 * camera.scale);

        words.forEach((_, idx) => {
          const coords = getWordCoordinates(idx);
          const proj = project2D(coords.x, coords.y);
          if (idx === 0) {
            ctx.moveTo(proj.x, proj.y);
          } else {
            ctx.lineTo(proj.x, proj.y);
          }
        });
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = "#fffc00";
        ctx.lineWidth = Math.max(1, 1.5 * camera.scale);
        words.forEach((_, idx) => {
          const coords = getWordCoordinates(idx);
          const proj = project2D(coords.x, coords.y);
          if (idx === 0) {
            ctx.moveTo(proj.x, proj.y);
          } else {
            ctx.lineTo(proj.x, proj.y);
          }
        });
        ctx.stroke();
      }

      // 3. Draw Snapchat-style word bubbles & interactive tags
      const nextTextBounds: BoundingBox2D[] = [];

      words.forEach((w, index) => {
        const coords = getWordCoordinates(index);
        const proj = project2D(coords.x, coords.y);

        if (proj.x >= -150 && proj.x <= width + 150 && proj.y >= -100 && proj.y <= height + 100) {
          const isSelected = selectedWordId === w.id;
          const isHovered = hoveredWordId === w.id;

          ctx.beginPath();
          ctx.arc(proj.x, proj.y, Math.max(3, 6 * camera.scale), 0, Math.PI * 2);
          ctx.fillStyle = isSelected || isHovered ? "#fffc00" : "#ffffff";
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 2.5;
          ctx.fill();
          ctx.stroke();

          // Render country code with word if available
          const flag = w.country ? getFlagEmoji(w.country) : "";
          const labelText = `${flag} #${w.id} ${w.word}`;
          let sizeBase = isSelected ? 15 : isHovered ? 14 : 12;
          let fontSize = sizeBase * camera.scale;
          fontSize = Math.max(8, Math.min(fontSize, 45));

          ctx.font = `800 ${fontSize}px Inter, sans-serif`;
          const textWidth = ctx.measureText(labelText).width;
          const textHeight = fontSize;

          const paddingX = 14 * camera.scale;
          const paddingY = 8 * camera.scale;
          const bubbleW = textWidth + paddingX * 2;
          const bubbleH = textHeight + paddingY * 2;

          const bx = proj.x - bubbleW / 2;
          const by = proj.y - bubbleH - (12 * camera.scale);

          nextTextBounds.push({
            id: w.id,
            x1: bx,
            y1: by,
            x2: bx + bubbleW,
            y2: by + bubbleH,
          });

          // Draw Flat Drop Shadow
          ctx.fillStyle = "#000000";
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(bx, by + 3, bubbleW, bubbleH, 12) : ctx.rect(bx, by + 3, bubbleW, bubbleH);
          ctx.fill();

          // Bubble Body: White bubble by default, Yellow on hover/select
          ctx.fillStyle = isSelected || isHovered ? "#fffc00" : "#ffffff";
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 2.5;

          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(bx, by, bubbleW, bubbleH, 12) : ctx.rect(bx, by, bubbleW, bubbleH);
          ctx.fill();
          ctx.stroke();

          // Speech bubble bottom indicator triangle
          ctx.fillStyle = isSelected || isHovered ? "#fffc00" : "#ffffff";
          ctx.beginPath();
          ctx.moveTo(proj.x - 8 * camera.scale, by + bubbleH - 1);
          ctx.lineTo(proj.x, by + bubbleH + (8 * camera.scale));
          ctx.lineTo(proj.x + 8 * camera.scale, by + bubbleH - 1);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Bubble Text
          ctx.fillStyle = "#000000";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, proj.x, by + bubbleH / 2);
        }
      });

      textBoundsRef.current = nextTextBounds;
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, [words, selectedWordId, hoveredWordId]);

  // Mouse handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    initAudio();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragRef.current.isDragging) {
      targetCamRef.current.active = false;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;

      cameraRef.current.x = dragRef.current.startCamX - dx / cameraRef.current.scale;
      cameraRef.current.y = dragRef.current.startCamY - dy / cameraRef.current.scale;
      return;
    }

    let closestWordId: number | null = null;
    textBoundsRef.current.forEach((box) => {
      if (mx >= box.x1 && mx <= box.x2 && my >= box.y1 && my <= box.y2) {
        closestWordId = box.id;
      }
    });

    if (closestWordId !== hoveredWordId) {
      setHoveredWordId(closestWordId);
      if (closestWordId !== null) {
        playChime(closestWordId, true);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    initAudio();
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startCamX: cameraRef.current.x,
      startCamY: cameraRef.current.y,
    };
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current.isDragging = false;

    const dragDist = Math.sqrt(
      Math.pow(e.clientX - dragRef.current.startX, 2) +
      Math.pow(e.clientY - dragRef.current.startY, 2)
    );

    if (dragDist < 5) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let clickedWordId: number | null = null;
      textBoundsRef.current.forEach((box) => {
        if (mx >= box.x1 && mx <= box.x2 && my >= box.y1 && my <= box.y2) {
          clickedWordId = box.id;
        }
      });

      if (clickedWordId !== null) {
        setSelectedWordId(clickedWordId);
        playChime(clickedWordId, false);

        const wordIdx = words.findIndex((w) => w.id === clickedWordId);
        if (wordIdx !== -1) {
          const coords = getWordCoordinates(wordIdx);
          targetCamRef.current = {
            x: coords.x,
            y: coords.y - 40,
            scale: 1.25,
            active: true,
          };
        }
      } else {
        setSelectedWordId(null);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    initAudio();
    targetCamRef.current.active = false;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    cameraRef.current.scale = Math.max(0.3, Math.min(3.5, cameraRef.current.scale * zoomFactor));
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    initAudio();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      dragRef.current = {
        isDragging: true,
        startX: touch.clientX,
        startY: touch.clientY,
        startCamX: cameraRef.current.x,
        startCamY: cameraRef.current.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (dragRef.current.isDragging && e.touches.length === 1) {
      targetCamRef.current.active = false;
      const touch = e.touches[0];
      const dx = touch.clientX - dragRef.current.startX;
      const dy = touch.clientY - dragRef.current.startY;

      cameraRef.current.x = dragRef.current.startCamX - dx / cameraRef.current.scale;
      cameraRef.current.y = dragRef.current.startCamY - dy / cameraRef.current.scale;
    }
  };

  const handleTouchEnd = () => {
    dragRef.current.isDragging = false;
  };

  const recenterMap = () => {
    targetCamRef.current = {
      x: 0,
      y: 0,
      scale: 1.0,
      active: true,
    };
  };

  const recenterToTail = () => {
    if (words.length === 0) return;
    const lastIdx = words.length - 1;
    const coords = getWordCoordinates(lastIdx);
    targetCamRef.current = {
      x: coords.x,
      y: coords.y - 40,
      scale: 1.25,
      active: true,
    };
  };

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(UPI_ID);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const jumpToRandomWord = () => {
    if (words.length === 0) return;
    initAudio();
    const randIndex = Math.floor(Math.random() * words.length);
    const word = words[randIndex];
    const coords = getWordCoordinates(randIndex);

    setSelectedWordId(word.id);
    playChime(word.id, false);

    targetCamRef.current = {
      x: coords.x,
      y: coords.y - 40,
      scale: 1.25,
      active: true,
    };
  };

  // Compute Country Leaderboard
  const leaderboardData = useMemo(() => {
    const counts: { [key: string]: number } = {};
    words.forEach((w) => {
      const country = w.country || "Unknown";
      counts[country] = (counts[country] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([countryCode, count]) => ({
        countryCode,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [words]);

  // Computed selected inspector model
  const selectedRecord = useMemo(() => {
    if (selectedWordId === null) return null;
    return words.find((w) => w.id === selectedWordId) || null;
  }, [selectedWordId, words]);

  return (
    <div className="relative w-screen bg-[#f3f3f6] text-black overflow-hidden font-sans select-none" style={{ height: "100dvh" }}>

      {/* 2D Grid Canvas Map */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full block cursor-grab active:cursor-grabbing z-0"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Snapchat Header Bar Overlay (Responsive Layout) */}
      <header className="absolute top-4 left-4 right-4 md:top-6 md:left-6 md:right-6 z-10 flex items-center justify-between pointer-events-none">

        {/* Left side: profile avatar + title */}
        <div className="pointer-events-auto flex items-center gap-2 md:gap-3">
          <div
            onClick={recenterMap}
            title="Recenter view"
            className="snap-icon-btn snap-icon-btn-active scale-90 md:scale-100 animate-pulse"
          >
            <svg className="w-5.5 h-5.5 fill-black" viewBox="0 0 192 192">
              <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" />
            </svg>
          </div>
          {/* Title Badge: hidden on small mobile view for clean scaling */}
          <div className="snap-card px-3.5 py-1.5 rounded-full bg-white flex items-center justify-center scale-90 md:scale-100 hidden sm:flex">
            <span className="text-[10px] md:text-xs font-mono font-bold text-black uppercase tracking-widest">
              Winding Thread
            </span>
          </div>
        </div>

        {/* Right side: Leaderboard trophy + sound mute buttons */}
        <div className="pointer-events-auto flex items-center gap-2 md:gap-3">
          {/* Trophy button (Leaderboard) */}
          <button
            onClick={() => {
              initAudio();
              setIsLeaderboardOpen(!isLeaderboardOpen);
            }}
            title="Country Leaderboard"
            className={`snap-icon-btn scale-90 md:scale-100 ${isLeaderboardOpen ? "snap-icon-btn-active" : ""}`}
          >
            <svg className="w-5.5 h-5.5 fill-current" viewBox="0 0 576 512">
              <path d="M400 0H176c-26.5 0-48 21.5-48 48v112c0 33.8 12.1 64.7 32 88.9V384h-16c-17.7 0-32 14.3-32 32v64H96c-17.7 0-32 14.3-32 32h384c0-17.7-14.3-32-32-32h-32v-64c0-17.7-14.3-32-32-32h-16V248.9c19.9-24.2 32-55.1 32-88.9V48c0-26.5-21.5-48-48-48zM96 64h32v128c0 14.1-3.7 27.2-10.2 38.6C102.7 241.9 80 223 80 192V80c0-8.8 7.2-16 16-16zm400 128c0 31-22.7 49.9-37.8 58.6-6.5-11.4-10.2-24.5-10.2-38.6V64h32c8.8 0 16 7.2 16 16v112z" />
            </svg>
          </button>

          {/* Support Dev — big pill button */}
          <button
            onClick={() => {
              initAudio();
              setIsSupportOpen(!isSupportOpen);
            }}
            title="Support the Developer"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border-2 border-black font-black text-[11px] uppercase tracking-wider transition-all hover:scale-[1.04] active:scale-[0.96] shadow-[2px_2px_0_#000] scale-90 md:scale-100 shrink-0 ${
              isSupportOpen
                ? "bg-black text-[#fffc00]"
                : "bg-[#fffc00] text-black"
            }`}
          >
            <span className="text-base leading-none">₹</span>
            <span className="hidden sm:inline">Support Dev</span>
          </button>

          <button
            onClick={() => {
              initAudio();
              setIsMuted(!isMuted);
            }}
            title={isMuted ? "Unmute Ambient Sound" : "Mute Sound"}
            className={`snap-icon-btn scale-90 md:scale-100 ${!isMuted ? "snap-icon-btn-active" : ""}`}
          >
            {isMuted ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.03c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
            ) : (
              <svg className="w-5 h-5 fill-black" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
            )}
          </button>
        </div>
      </header>

      {/* Leaderboard Modal — blurred backdrop */}
      {isLeaderboardOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-sm bg-black/20 animate-[fadeIn_0.15s_ease]"
          onClick={() => setIsLeaderboardOpen(false)}
        >
          <div
            className="w-[92%] max-w-sm snap-card rounded-2xl p-5 border-2 border-black animate-[scaleUp_0.2s_ease]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-[#e5e5ea] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏆</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-black">
                  Country Leaderboard
                </h3>
              </div>
              <button
                onClick={() => setIsLeaderboardOpen(false)}
                className="text-zinc-500 hover:text-black font-mono text-xs cursor-pointer p-1"
              >
                x
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto snap-scrollbar pr-1 flex flex-col gap-2 font-mono text-xs">
              {leaderboardData.length === 0 ? (
                <div className="text-zinc-500 italic py-2">No country data recorded yet.</div>
              ) : (
                leaderboardData.map((item, idx) => (
                  <div
                    key={item.countryCode}
                    className="flex items-center justify-between p-2.5 bg-[#f0f0f3] border-2 border-black rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      {/* Rank Circle badge */}
                      <div className={`w-6 h-6 rounded-full border border-black flex items-center justify-center font-bold text-[10px] ${idx === 0 ? "bg-[#fffc00]" : "bg-white"
                        }`}>
                        {idx + 1}
                      </div>
                      <span className="text-base">{getFlagEmoji(item.countryCode)}</span>
                      <span className="font-extrabold uppercase">{item.countryCode}</span>
                    </div>
                    <div className="text-black font-bold">
                      {item.count} {item.count === 1 ? "word" : "words"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Support Dev Modal — blurred backdrop */}
      {isSupportOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-sm bg-black/20 animate-[fadeIn_0.15s_ease]"
          onClick={() => setIsSupportOpen(false)}
        >
          <div
            className="w-[92%] max-w-sm snap-card rounded-2xl p-5 border-2 border-black animate-[scaleUp_0.2s_ease]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-[#e5e5ea] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">❤️</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-black">
                  Support the Dev
                </h3>
              </div>
              <button
                onClick={() => setIsSupportOpen(false)}
                className="text-zinc-500 hover:text-black font-mono text-xs cursor-pointer p-1"
              >
                x
              </button>
            </div>

            <div className="text-center space-y-4">
              <p className="text-xs font-semibold text-zinc-700 leading-relaxed">
                If you enjoy The Winding Thread, consider supporting the developer to help keep it running and ad-free! Any amount counts. 🙏
              </p>

              <div className="bg-[#f0f0f3] border-2 border-black rounded-xl p-4 flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🇮🇳</span>
                  <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">
                    UPI Payment
                  </span>
                </div>
                <div className="flex w-full items-center gap-2 bg-white border-2 border-black rounded-xl p-2.5">
                  <span className="flex-1 font-mono text-xs font-bold text-center text-zinc-800 select-all">
                    {UPI_ID}
                  </span>
                  <button
                    onClick={handleCopyUpi}
                    className={`border-2 border-black text-[10px] font-bold py-1.5 px-3 rounded-lg transition-all cursor-pointer shrink-0 ${
                      copiedUpi ? "bg-green-400 text-white" : "bg-[#fffc00] hover:scale-105 active:scale-95"
                    }`}
                  >
                    {copiedUpi ? "✓ Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-[9px] font-mono text-zinc-400">
                  Open any UPI app (Google Pay, PhonePe, Paytm) and send to the above ID
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Snapchat Chat bubble popup inspector (Optimized: bottom drawer on mobile, floating on desktop) */}
      {selectedRecord && (
        <div className="absolute z-20 snap-card rounded-2xl p-4 md:p-5 border-2 border-black animate-[slideIn_0.2s_ease]
          w-[92%] left-1/2 -translate-x-1/2 bottom-36 max-w-sm
          md:right-6 md:top-24 md:bottom-auto md:translate-x-0 md:left-auto md:w-80"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-[#f0f0f3] border-2 border-black flex items-center justify-center font-bold text-sm text-black">
                {selectedRecord.author.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <span className="text-[10px] font-mono text-zinc-500 block">Contributor</span>
                <span className="text-sm font-bold text-black leading-tight flex items-center gap-1.5">
                  {selectedRecord.author} {selectedRecord.country && <span>{getFlagEmoji(selectedRecord.country)}</span>}
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelectedWordId(null)}
              className="text-zinc-500 hover:text-black text-xs font-mono cursor-pointer p-1"
            >
              [close]
            </button>
          </div>

          <div className="bg-[#f0f0f3] border-2 border-black rounded-xl p-3 mb-3 text-left">
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block mb-0.5">
              MESSAGE SENT
            </span>
            <p className="text-lg font-black text-black uppercase tracking-tight truncate">
              "{selectedRecord.word}"
            </p>
          </div>

          <div className="space-y-1.5 font-mono text-[9px] text-zinc-500 border-t border-[#e5e5ea] pt-2.5">
            <div className="flex justify-between">
              <span>Timestamp:</span>
              <span className="text-zinc-700">{new Date(selectedRecord.timestamp).toLocaleString()}</span>
            </div>
            {selectedRecord.country && (
              <div className="flex justify-between">
                <span>Origin:</span>
                <span className="text-zinc-700 uppercase">{selectedRecord.country} ({getFlagEmoji(selectedRecord.country)})</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Node ID:</span>
              <span className="text-zinc-700">#{selectedRecord.id}</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom UI Dock (Input and Navigation) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[92%] max-w-sm z-20 flex flex-col gap-3.5 pointer-events-none"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >

        {/* Status notification */}
        {(errorMsg || successMsg) && (
          <div
            className={`pointer-events-auto py-2.5 px-4 rounded-xl text-center text-xs font-bold border-2 border-black shadow-[2px_2px_0_#000] ${errorMsg ? "bg-red-500 text-white" : "bg-[#fffc00] text-black"
              }`}
          >
            {errorMsg || successMsg}
          </div>
        )}

        {/* Input Bar Overlay */}
        <form
          onSubmit={handleWordSubmit}
          className="pointer-events-auto flex items-center gap-2 bg-white border-2 border-black rounded-full p-1.5 shadow-[0_4px_0_#000]"
        >
          <input
            type="text"
            value={inputWord}
            onChange={(e) => setInputWord(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
            placeholder="Send a word to the Thread..."
            maxLength={15}
            disabled={submitting}
            className="bg-transparent h-9 px-3 flex-1 text-sm font-bold text-black outline-none placeholder-zinc-400 min-w-0"
          />
          <input
            type="text"
            value={inputAuthor}
            onChange={(e) => setInputAuthor(e.target.value)}
            placeholder="Alias"
            maxLength={14}
            disabled={submitting}
            className="bg-[#f0f0f3] border-2 border-black h-9 px-2 w-16 md:w-20 text-xs font-bold text-black rounded-full outline-none text-center min-w-0"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#fffc00] text-black border-2 border-black hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0 disabled:opacity-50"
          >
            <svg className="w-4.5 h-4.5 fill-black" viewBox="0 0 24 24">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
            </svg>
          </button>
        </form>

        {/* Bottom Tab Bar navigation — Aave-style Liquid Glass on desktop */}
        <nav
          ref={navRef}
          className="pointer-events-auto relative h-14 rounded-full px-8 flex items-center justify-between overflow-hidden
            bg-white border-2 border-black shadow-[0_4px_0_#000]
            md:liquid-glass-nav md:border-0 md:shadow-none"
        >

          {/* Recenter to Coordinate Origin (0,0) */}
          <button
            onClick={() => {
              initAudio();
              recenterMap();
            }}
            className="flex flex-col items-center justify-center w-9 h-9 rounded-full text-zinc-500 hover:text-black hover:bg-zinc-100 transition-all cursor-pointer"
            title="Recenter to Origin"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </button>

          {/* Dice: jump to a random word */}
          <button
            onClick={jumpToRandomWord}
            className="flex flex-col items-center justify-center w-9 h-9 rounded-full text-zinc-500 hover:text-black hover:bg-zinc-100 transition-all cursor-pointer"
            title="Jump to Random Word"
          >
            <svg className="w-5 h-5 fill-none stroke-current" strokeWidth="2.5" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="4" ry="4" />
              <circle cx="8" cy="8" r="1.2" fill="currentColor" />
              <circle cx="16" cy="16" r="1.2" fill="currentColor" />
              <circle cx="12" cy="12" r="1.2" fill="currentColor" />
              <circle cx="16" cy="8" r="1.2" fill="currentColor" />
              <circle cx="8" cy="16" r="1.2" fill="currentColor" />
            </svg>
          </button>

          {/* Focus on Current Tail Word (Focus Newest Node) */}
          <button
            onClick={() => {
              initAudio();
              recenterToTail();
            }}
            className="w-10 h-10 rounded-full bg-[#f0f0f3] border-2 border-black flex items-center justify-center text-black hover:bg-[#fffc00] active:scale-95 transition-all cursor-pointer"
            title="Focus Newest Word"
          >
            <svg className="w-5.5 h-5.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
            </svg>
          </button>

          {/* Toggle Spotlight Auto-Tour Mode */}
          <button
            onClick={() => {
              initAudio();
              setIsSpotlightTour(!isSpotlightTour);
            }}
            className={`flex flex-col items-center justify-center w-9 h-9 rounded-full cursor-pointer ${isSpotlightTour ? "text-black bg-[#fffc00] border-2 border-black animate-pulse" : "text-zinc-500 hover:text-black hover:bg-zinc-100"
              }`}
            title="Auto Spotlight Tour"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          </button>

        </nav>
      </div>
    </div>
  );
}
