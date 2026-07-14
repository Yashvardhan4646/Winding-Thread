"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";

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
  } catch {
    return "🌍";
  }
};

const UPI_ID = "yashvardhan4646@okicici";


export default function WindingThreadPage() {
  // Data state
  const [words, setWords] = useState<WordRecord[]>([]);
  // Data loading status is handled directly via fetch status
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Sync state with HTML class on mount
    useEffect(() => {
      const timer = setTimeout(() => {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }, 0);
      return () => clearTimeout(timer);
    }, []);

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
    }
  };

    // Poll for updates
    useEffect(() => {
      const timer = setTimeout(() => {
        fetchThreadData();
      }, 0);
      const interval = setInterval(() => {
        if (!submitting && !targetCamRef.current.active && !dragRef.current.isDragging) {
          fetchThreadData();
        }
      }, 4000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
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
        interface WindowWithWebkit extends Window {
          webkitAudioContext?: typeof AudioContext;
        }
        const win = window as unknown as WindowWithWebkit;
        const AudioCtx = window.AudioContext || win.webkitAudioContext;
        if (!AudioCtx) return;
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
    const playChime = useCallback((wordId: number, isMajor = true) => {
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
    }, [isMuted]);

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
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to submit.";
        setErrorMsg(errorMessage);
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
  }, [isSpotlightTour, words, playChime]);

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

      // Clear with radial gradient for a premium mesh glow effect
      const bgGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        20,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.95
      );
      if (isDarkMode) {
        bgGrad.addColorStop(0, "#151226"); // Deep indigo center glow
        bgGrad.addColorStop(0.6, "#0b0c10"); // Slate dark gray
        bgGrad.addColorStop(1, "#07070a"); // Dark outer edges
      } else {
        bgGrad.addColorStop(0, "#fafafc"); // Clean white center glow
        bgGrad.addColorStop(0.6, "#f0f0f4"); // Soft slate mid-tone
        bgGrad.addColorStop(1, "#e6e6ec"); // Slate gray outer edges
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const project2D = (px: number, py: number) => {
        const sx = width / 2 + (px - camera.x) * camera.scale;
        const sy = height / 2 + (py - camera.y) * camera.scale;
        return { x: sx, y: sy };
      };

      // 1. Draw Flat Grid Map Lines (Solid cool lines)
      ctx.strokeStyle = isDarkMode ? "#232536" : "#d8dae3";
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
        ctx.strokeStyle = isDarkMode ? "#474a59" : "#c7c7cc";
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
          ctx.fillStyle = isSelected || isHovered ? "#fffc00" : (isDarkMode ? "#2d2f39" : "#ffffff");
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 2.5;
          ctx.fill();
          ctx.stroke();

          // Render country code with word if available
          const flag = w.country ? getFlagEmoji(w.country) : "";
          const labelText = `${flag} #${w.id} ${w.word}`;
          const sizeBase = isSelected ? 15 : isHovered ? 14 : 12;
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
          if (ctx.roundRect) {
            ctx.roundRect(bx, by + 3, bubbleW, bubbleH, 12);
          } else {
            ctx.rect(bx, by + 3, bubbleW, bubbleH);
          }
          ctx.fill();

          // Bubble Body: White bubble by default, Yellow on hover/select
          ctx.fillStyle = isSelected || isHovered ? "#fffc00" : (isDarkMode ? "#1f2026" : "#ffffff");
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 2.5;

          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(bx, by, bubbleW, bubbleH, 12);
          } else {
            ctx.rect(bx, by, bubbleW, bubbleH);
          }
          ctx.fill();
          ctx.stroke();

          // Speech bubble bottom indicator triangle
          ctx.fillStyle = isSelected || isHovered ? "#fffc00" : (isDarkMode ? "#1f2026" : "#ffffff");
          ctx.beginPath();
          ctx.moveTo(proj.x - 8 * camera.scale, by + bubbleH - 1);
          ctx.lineTo(proj.x, by + bubbleH + (8 * camera.scale));
          ctx.lineTo(proj.x + 8 * camera.scale, by + bubbleH - 1);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Bubble Text
          ctx.fillStyle = isSelected || isHovered ? "#000000" : (isDarkMode ? "#ffffff" : "#000000");
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
  }, [words, selectedWordId, hoveredWordId, isDarkMode]);

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

  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    initAudio();
    const nextDark = !isDarkMode;

    if (!document.startViewTransition) {
      setIsDarkMode(nextDark);
      if (nextDark) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      setIsDarkMode(nextDark);
      if (nextDark) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 600,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
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

  // Dynamic controls sidebar items array with bouncy spring stagger logic
  const sidebarItems = [
    {
      type: "button",
      label: "Rules Board",
      icon: "lucide:help-circle",
      action: () => {
        setIsRulesOpen(true);
        setIsSidebarOpen(false);
      },
      className: "bg-[var(--snap-gray)] hover:bg-[#fffc00] hover:text-black text-[var(--foreground)]",
    },
    {
      type: "button",
      label: "Leaderboard",
      icon: "lucide:trophy",
      action: () => {
        setIsLeaderboardOpen(true);
        setIsSidebarOpen(false);
      },
      className: "bg-[var(--snap-gray)] hover:bg-[#fffc00] hover:text-black text-[var(--foreground)]",
    },
    {
      type: "button",
      label: "Support Dev",
      icon: "lucide:indian-rupee",
      action: () => {
        setIsSupportOpen(true);
        setIsSidebarOpen(false);
      },
      className: "bg-[#fffc00] text-black hover:bg-black hover:text-[#fffc00]",
    },
    {
      type: "button",
      label: isMuted ? "Unmute Sound" : "Mute Sound",
      icon: isMuted ? "lucide:volume-x" : "lucide:volume-2",
      action: () => {
        setIsMuted(!isMuted);
      },
      className: !isMuted ? "bg-black text-[#fffc00]" : "bg-[var(--snap-gray)] text-[var(--foreground)]",
    },
    {
      type: "button",
      label: isDarkMode ? "Light Theme" : "Dark Theme",
      icon: isDarkMode ? "lucide:sun" : "lucide:moon",
      action: (e?: React.MouseEvent<HTMLButtonElement>) => {
        if (e) {
          toggleTheme(e);
        }
      },
      className: "bg-[var(--snap-gray)] hover:bg-[#fffc00] hover:text-black text-[var(--foreground)]",
    },
    {
      type: "divider",
    },
    {
      type: "link",
      label: "GitHub Repo",
      icon: "lucide:github",
      href: "https://github.com/Yashvardhan4646/Winding-Thread",
      className: "bg-[var(--snap-gray)] hover:bg-[#fffc00] hover:text-black text-[var(--foreground)]",
    },
    {
      type: "link",
      label: "Follow on X",
      icon: "ri:twitter-x-fill",
      href: "https://x.com/windingthread0",
      className: "bg-[var(--snap-gray)] hover:bg-[#fffc00] hover:text-black text-[var(--foreground)]",
    },
  ];

  return (
    <div className="relative w-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans select-none" style={{ height: "100dvh" }}>

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
          {/* Title Badge */}
          <div className="snap-card px-3.5 py-1.5 rounded-full bg-[var(--snap-dark)] flex items-center justify-center scale-90 md:scale-100 hidden sm:flex">
            <span className="text-[10px] md:text-xs font-mono font-bold text-[var(--foreground)] uppercase tracking-widest">
              Winding Thread
            </span>
          </div>
        </div>

        {/* Right side: Sidebar menu drawer toggle button */}
        <div className="pointer-events-auto flex items-center gap-2 md:gap-3">
          <button
            onClick={() => {
              initAudio();
              setIsSidebarOpen(!isSidebarOpen);
            }}
            title="Open Controls Menu"
            className={`snap-icon-btn scale-90 md:scale-100 ${isSidebarOpen ? "snap-icon-btn-active" : ""}`}
          >
            <Icon icon={isSidebarOpen ? "lucide:x" : "lucide:menu"} className="w-5.5 h-5.5" />
          </button>
        </div>
      </header>

      {/* Sidebar Controls Menu Drawer */}
      {/* Background overlay backdrop to close sidebar on click outside */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sliding Sidebar Container */}
      <div
        className="fixed top-0 right-0 h-full w-72 bg-[var(--snap-dark)] border-l-2 border-black shadow-[-4px_0_0_#000] z-25 p-5 flex flex-col gap-6 select-none"
        style={{
          transform: isSidebarOpen ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
          transition: "transform 450ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Sidebar Header */}
        <div className="flex justify-between items-center border-b border-[var(--snap-light-gray)] pb-3 mt-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <h3 className="text-sm font-black uppercase tracking-wider text-[var(--foreground)]">
              Controls Menu
            </h3>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="text-[var(--text-zinc-500)] hover:text-[var(--foreground)] cursor-pointer p-1 transition-transform hover:scale-110 active:scale-95"
            title="Close menu"
          >
            <Icon icon="lucide:x" className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Items Stack */}
        <div className="flex-1 flex flex-col gap-3.5 overflow-y-auto snap-scrollbar pr-1">
          {/* eslint-disable-next-line react-hooks/refs */}
          {sidebarItems.map((item, idx) => {
            if (item.type === "divider") {
              return (
                <hr
                  key={`div-${idx}`}
                  className="border-t border-[var(--snap-light-gray)] my-1 transition-all duration-300"
                  style={{
                    opacity: isSidebarOpen ? 1 : 0,
                    transitionDelay: isSidebarOpen ? `${idx * 40}ms` : "0ms",
                  }}
                />
              );
            }

            const itemStyle = {
              opacity: isSidebarOpen ? 1 : 0,
              transform: isSidebarOpen ? "translate3d(0, 0, 0)" : "translate3d(32px, 0, 0)",
              transition: "transform 450ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 400ms ease-out",
              transitionDelay: isSidebarOpen ? `${idx * 40}ms` : "0ms",
            };

            if (item.type === "link") {
              return (
                <a
                  key={`link-${idx}`}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsSidebarOpen(false)}
                  style={itemStyle}
                  className={`flex items-center gap-3 w-full p-3 rounded-2xl border-2 border-black font-bold text-xs uppercase tracking-wider shadow-[2px_2px_0_#000] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#000] active:translate-y-[1px] active:shadow-[1px_1px_0_#000] transition-[background-color,color] cursor-pointer ${item.className}`}
                >
                  <Icon icon={item.icon || ""} className="w-5.5 h-5.5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                </a>
              );
            }

            return (
              <button
                key={`btn-${idx}`}
                onClick={(e) => {
                  initAudio();
                  item.action?.(e);
                }}
                style={itemStyle}
                className={`flex items-center gap-3 w-full p-3 rounded-2xl border-2 border-black font-bold text-xs uppercase tracking-wider shadow-[2px_2px_0_#000] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#000] active:translate-y-[1px] active:shadow-[1px_1px_0_#000] transition-[background-color,color] cursor-pointer ${item.className}`}
              >
                <Icon icon={item.icon || ""} className="w-5.5 h-5.5 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer info */}
        <div className="text-center font-mono text-[9px] text-[var(--text-zinc-500)] mt-auto pt-2 border-t border-[var(--snap-light-gray)]">
          The Winding Thread v1.1
        </div>
      </div>

      {/* Leaderboard Modal — blurred backdrop */}
      {isLeaderboardOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-sm bg-[var(--modal-overlay)] animate-[fadeIn_0.15s_ease]"
          onClick={() => setIsLeaderboardOpen(false)}
        >
          <div
            className="w-[92%] max-w-sm snap-card rounded-2xl p-5 border-2 border-black animate-[scaleUp_0.2s_ease]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-[var(--snap-light-gray)] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏆</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-[var(--foreground)]">
                  Country Leaderboard
                </h3>
              </div>
              <button
                onClick={() => setIsLeaderboardOpen(false)}
                className="text-[var(--text-zinc-500)] hover:text-[var(--foreground)] cursor-pointer p-1 transition-transform hover:scale-110 active:scale-95"
              >
                <Icon icon="lucide:x" className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto snap-scrollbar pr-1 flex flex-col gap-2 font-mono text-xs">
              {leaderboardData.length === 0 ? (
                <div className="text-[var(--text-zinc-500)] italic py-2">No country data recorded yet.</div>
              ) : (
                leaderboardData.map((item, idx) => (
                  <div
                    key={item.countryCode}
                    className="flex items-center justify-between p-2.5 bg-[var(--snap-gray)] border-2 border-black rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      {/* Rank Circle badge */}
                      <div className={`w-6 h-6 rounded-full border border-black flex items-center justify-center font-bold text-[10px] ${idx === 0 ? "bg-[#fffc00] text-black" : "bg-[var(--snap-dark)] text-[var(--foreground)]"
                        }`}>
                        {idx + 1}
                      </div>
                      <span className="text-base">{getFlagEmoji(item.countryCode)}</span>
                      <span className="font-extrabold uppercase">{item.countryCode}</span>
                    </div>
                    <div className="text-[var(--foreground)] font-bold">
                      {item.count} {item.count === 1 ? "word" : "words"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rules Board Modal — blurred backdrop */}
      {isRulesOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-sm bg-[var(--modal-overlay)] animate-[fadeIn_0.15s_ease]"
          onClick={() => setIsRulesOpen(false)}
        >
          <div
            className="w-[92%] max-w-sm snap-card rounded-2xl p-5 border-2 border-black animate-[scaleUp_0.2s_ease]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-[var(--snap-light-gray)] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">📜</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-[var(--foreground)]">
                  Rules Board
                </h3>
              </div>
              <button
                onClick={() => setIsRulesOpen(false)}
                className="text-[var(--text-zinc-500)] hover:text-[var(--foreground)] cursor-pointer p-1 transition-transform hover:scale-110 active:scale-95"
              >
                <Icon icon="lucide:x" className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono text-[var(--foreground)] snap-scrollbar max-h-72 overflow-y-auto pr-1">
              <div className="p-3 bg-[var(--snap-gray)] border-2 border-black rounded-xl space-y-1">
                <div className="font-extrabold text-[#ff9000] uppercase tracking-wide">1. The Chain Link</div>
                <div className="text-[10px] leading-relaxed text-[var(--text-zinc-700)]">
                  Every submitted word is physically connected to the previous word in the infinite 2D canvas, building a single, global continuous thread of community thoughts.
                </div>
              </div>

              <div className="p-3 bg-[var(--snap-gray)] border-2 border-black rounded-xl space-y-1">
                <div className="font-extrabold text-[#00c6ff] uppercase tracking-wide">2. Word Format</div>
                <div className="text-[10px] leading-relaxed text-[var(--text-zinc-700)]">
                  Words must be between 1 and 15 characters long. Spaces, symbols, and special characters are not allowed to preserve standard dictionary entries.
                </div>
              </div>

              <div className="p-3 bg-[var(--snap-gray)] border-2 border-black rounded-xl space-y-1">
                <div className="font-extrabold text-[#00e676] uppercase tracking-wide">3. Claim your Spot</div>
                <div className="text-[10px] leading-relaxed text-[var(--text-zinc-700)]">
                  Include an alias and your location is registered automatically to add points to your country on the Global Leaderboard.
                </div>
              </div>

              <div className="p-3 bg-[var(--snap-gray)] border-2 border-black rounded-xl space-y-1">
                <div className="font-extrabold text-[#e040fb] uppercase tracking-wide">4. Exploration</div>
                <div className="text-[10px] leading-relaxed text-[var(--text-zinc-700)]">
                  Drag the map around to travel along the thread. Scroll or pinch to zoom. Click on any speech bubble node to view details about its contributor and timestamp.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Support Dev Modal — blurred backdrop */}
      {isSupportOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-sm bg-[var(--modal-overlay)] animate-[fadeIn_0.15s_ease]"
          onClick={() => setIsSupportOpen(false)}
        >
          <div
            className="w-[92%] max-w-sm snap-card rounded-2xl p-5 border-2 border-black animate-[scaleUp_0.2s_ease]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-[var(--snap-light-gray)] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">❤️</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-[var(--foreground)]">
                  Support the Dev
                </h3>
              </div>
              <button
                onClick={() => setIsSupportOpen(false)}
                className="text-[var(--text-zinc-500)] hover:text-[var(--foreground)] cursor-pointer p-1 transition-transform hover:scale-110 active:scale-95"
              >
                <Icon icon="lucide:x" className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center space-y-4">
              <p className="text-xs font-semibold text-[var(--text-zinc-700)] leading-relaxed">
                If you enjoy The Winding Thread, consider supporting the developer to help keep it running and ad-free! Any amount counts. 🙏
              </p>

              <div className="bg-[var(--snap-gray)] border-2 border-black rounded-xl p-4 flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🇮🇳</span>
                  <span className="text-[10px] font-mono font-bold text-[var(--text-zinc-500)] uppercase tracking-widest">
                    UPI Payment
                  </span>
                </div>
                <div className="flex w-full items-center gap-2 bg-[var(--snap-dark)] border-2 border-black rounded-xl p-2.5">
                  <span className="flex-1 font-mono text-xs font-bold text-center text-[var(--foreground)] select-all">
                    {UPI_ID}
                  </span>
                  <button
                    onClick={handleCopyUpi}
                    className={`border-2 border-black text-[10px] font-bold py-1.5 px-3 rounded-lg transition-all cursor-pointer shrink-0 ${copiedUpi ? "bg-green-400 text-white" : "bg-[#fffc00] hover:scale-105 active:scale-95"
                      }`}
                  >
                    {copiedUpi ? "✓ Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-[9px] font-mono text-[var(--text-zinc-500)]">
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
              <div className="w-10 h-10 rounded-full bg-[var(--snap-gray)] border-2 border-black flex items-center justify-center font-bold text-sm text-[var(--foreground)]">
                {selectedRecord.author.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <span className="text-[10px] font-mono text-[var(--text-zinc-500)] block">Contributor</span>
                <span className="text-sm font-bold text-[var(--foreground)] leading-tight flex items-center gap-1.5">
                  {selectedRecord.author} {selectedRecord.country && <span>{getFlagEmoji(selectedRecord.country)}</span>}
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelectedWordId(null)}
              className="text-[var(--text-zinc-500)] hover:text-[var(--foreground)] cursor-pointer p-1 transition-transform hover:scale-110 active:scale-95"
              title="Close drawer"
            >
              <Icon icon="lucide:x" className="w-4.5 h-4.5" />
            </button>
          </div>

          <div className="bg-[var(--snap-gray)] border-2 border-black rounded-xl p-3 mb-3 text-left">
            <span className="text-[9px] font-mono text-[var(--text-zinc-500)] uppercase tracking-wider block mb-0.5">
              MESSAGE SENT
            </span>
            <p className="text-lg font-black text-[var(--foreground)] uppercase tracking-tight truncate">
              &quot;{selectedRecord.word}&quot;
            </p>
          </div>

          <div className="space-y-1.5 font-mono text-[9px] text-[var(--text-zinc-500)] border-t border-[var(--snap-light-gray)] pt-2.5">
            <div className="flex justify-between">
              <span>Timestamp:</span>
              <span className="text-[var(--text-zinc-700)]">{new Date(selectedRecord.timestamp).toLocaleString()}</span>
            </div>
            {selectedRecord.country && (
              <div className="flex justify-between">
                <span>Origin:</span>
                <span className="text-[var(--text-zinc-700)] uppercase">{selectedRecord.country} ({getFlagEmoji(selectedRecord.country)})</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Node ID:</span>
              <span className="text-[var(--text-zinc-700)]">#{selectedRecord.id}</span>
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
          className="pointer-events-auto flex items-center gap-2 bg-[var(--snap-dark)] border-2 border-black rounded-full p-1.5 shadow-[0_4px_0_#000]"
        >
          <input
            type="text"
            value={inputWord}
            onChange={(e) => setInputWord(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
            placeholder="Send a word to the Thread..."
            maxLength={15}
            disabled={submitting}
            className="bg-transparent h-9 px-3 flex-1 text-sm font-bold text-[var(--foreground)] outline-none placeholder-zinc-400 min-w-0"
          />
          <input
            type="text"
            value={inputAuthor}
            onChange={(e) => setInputAuthor(e.target.value)}
            placeholder="Alias"
            maxLength={14}
            disabled={submitting}
            className="bg-[var(--snap-gray)] border-2 border-black h-9 px-2 w-16 md:w-20 text-xs font-bold text-[var(--foreground)] rounded-full outline-none text-center min-w-0"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#fffc00] text-black border-2 border-black hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Icon icon="lucide:arrow-right" className="w-4.5 h-4.5 text-black" />
          </button>
        </form>

        {/* Bottom Tab Bar navigation — Aave-style Liquid Glass on desktop */}
        <nav
          ref={navRef}
          className="pointer-events-auto relative h-14 rounded-full px-8 flex items-center justify-between overflow-hidden
            bg-[var(--snap-dark)] border-2 border-black shadow-[0_4px_0_#000]
            md:liquid-glass-nav md:border-0 md:shadow-none"
        >

          {/* Recenter to Coordinate Origin (0,0) */}
          <button
            onClick={() => {
              initAudio();
              recenterMap();
            }}
            className="flex flex-col items-center justify-center w-9 h-9 rounded-full text-[var(--text-zinc-500)] hover:text-[var(--foreground)] hover:bg-[var(--snap-gray)] transition-all cursor-pointer"
            title="Recenter to Origin"
          >
            <Icon icon="lucide:home" className="w-5 h-5" />
          </button>

          {/* Dice: jump to a random word */}
          <button
            onClick={jumpToRandomWord}
            className="flex flex-col items-center justify-center w-9 h-9 rounded-full text-[var(--text-zinc-500)] hover:text-[var(--foreground)] hover:bg-[var(--snap-gray)] transition-all cursor-pointer"
            title="Jump to Random Word"
          >
            <Icon icon="lucide:dices" className="w-5 h-5" />
          </button>

          {/* Focus on Current Tail Word (Focus Newest Node) */}
          <button
            onClick={() => {
              initAudio();
              recenterToTail();
            }}
            className="w-10 h-10 rounded-full bg-[var(--snap-gray)] border-2 border-black flex items-center justify-center text-[var(--foreground)] hover:text-black hover:bg-[#fffc00] active:scale-95 transition-all cursor-pointer"
            title="Focus Newest Word"
          >
            <Icon icon="lucide:crosshair" className="w-5.5 h-5.5" />
          </button>

          {/* Toggle Spotlight Auto-Tour Mode */}
          <button
            onClick={() => {
              initAudio();
              setIsSpotlightTour(!isSpotlightTour);
            }}
            className={`flex flex-col items-center justify-center w-9 h-9 rounded-full cursor-pointer transition-all ${isSpotlightTour ? "text-black bg-[#fffc00] border-2 border-black animate-pulse" : "text-[var(--text-zinc-500)] hover:text-[var(--foreground)] hover:bg-[var(--snap-gray)]"
              }`}
            title="Auto Spotlight Tour"
          >
            {isSpotlightTour ? (
              <Icon icon="lucide:pause" className="w-5 h-5" />
            ) : (
              <Icon icon="lucide:play" className="w-5 h-5" />
            )}
          </button>
        </nav>
      </div>
    </div>
  );
}
