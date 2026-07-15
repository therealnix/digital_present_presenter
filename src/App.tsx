import { useState, useEffect, useRef } from "react";
import { motion, useAnimation, useMotionValue, useSpring } from "framer-motion";
import { cn } from "./lib/utils";

let globalAudioCtx: AudioContext | null = null;
const getAudioContext = () => {
  if (!globalAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      globalAudioCtx = new AudioContextClass();
    }
  }
  return globalAudioCtx;
};

const playSound = (type: "shake" | "rip" | "pop") => {
  const audioCtx = getAudioContext();
  if (!audioCtx) return;

  if (type === "shake") {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300 + Math.random() * 200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      }, i * 80);
    }
  } else if (type === "rip") {
    // Generate a ripping sound using filtered white noise
    const bufferSize = audioCtx.sampleRate * 0.2; // 200ms
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1; // White noise
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    // Bandpass filter to make it sound like tearing paper
    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 800 + Math.random() * 400; // varying pitch for each rip
    filter.Q.value = 0.5;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    noise.start();
  } else if (type === "pop") {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  }
};

type AppState = "shake" | "rip" | "opened";

export default function App() {
  const [appState, setAppState] = useState<AppState>("shake");
  const [hits, setHits] = useState(0);
  const [shakeCount, setShakeCount] = useState(0);
  const presentControls = useAnimation();
  const handAnimation = useAnimation();
  const presentRef = useRef<HTMLDivElement>(null);
  
  const lastHitTime = useRef<number>(0);
  const lastShakeTime = useRef<number>(0);
  const lastMousePos = useRef({ x: 0, y: 0, time: 0 });

  // Pointer tracking for the hand
  const cursorX = useMotionValue(typeof window !== "undefined" ? window.innerWidth / 2 : 0);
  const cursorY = useMotionValue(typeof window !== "undefined" ? window.innerHeight / 2 : 0);
  
  // Smooth spring physics so the hand follows organically
  const springConfig = { damping: 20, stiffness: 250, mass: 0.5 };
  const handX = useSpring(cursorX, springConfig);
  const handY = useSpring(cursorY, springConfig);

  // Device motion handler for shaking
  useEffect(() => {
    let lastX = 0, lastY = 0, lastZ = 0;
    const threshold = 15;

    const handleMotion = (e: DeviceMotionEvent) => {
      if (appState !== "shake") return;
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
      
      const x = acc.x;
      const y = acc.y;
      const z = acc.z;

      const deltaX = Math.abs(x - lastX);
      const deltaY = Math.abs(y - lastY);
      const deltaZ = Math.abs(z - lastZ);
      
      if (deltaX + deltaY + deltaZ > threshold) {
        handleShake();
      }
      
      lastX = x;
      lastY = y;
      lastZ = z;
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [appState]);

  // Mouse/thumb tracking and swipe-rip detection
  useEffect(() => {
    if (appState !== "rip") return;
    
    const moveCursor = (e: PointerEvent) => {
      const now = Date.now();
      const currentX = e.clientX;
      const currentY = e.clientY;

      // Offset so the hand aligns nicely over the cursor
      cursorX.set(currentX - 50);
      cursorY.set(currentY - 50);

      const dt = now - lastMousePos.current.time;
      if (dt > 0) {
        const dx = currentX - lastMousePos.current.x;
        const dy = currentY - lastMousePos.current.y;
        const velocity = Math.sqrt(dx * dx + dy * dy) / dt; // pixels per ms

        // Detection if velocity is high enough and passing over the present
        if (presentRef.current) {
          const rect = presentRef.current.getBoundingClientRect();
          if (
            currentX >= rect.left &&
            currentX <= rect.right &&
            currentY >= rect.top &&
            currentY <= rect.bottom
          ) {
            // Speed threshold (approx 3.0 pixels per ms is a very fast swipe)
            if (velocity > 3.0) {
              if (now - lastHitTime.current > 400) { // 400ms cooldown between rips
                lastHitTime.current = now;
                setHits((prev) => prev + 1);
                
                // Animate hand swiping/grabbing
                handAnimation.start({
                  rotate: dx > 0 ? [-20, 40, 0] : [20, -40, 0],
                  scale: [1, 0.8, 1],
                  transition: { duration: 0.2 }
                });
              }
            }
          }
        }
      }

      lastMousePos.current = { x: currentX, y: currentY, time: now };
    };

    window.addEventListener("pointermove", moveCursor);
    return () => window.removeEventListener("pointermove", moveCursor);
  }, [appState, cursorX, cursorY, handAnimation]);

  // Handle hit (rip) effects
  useEffect(() => {
    if (hits > 0 && hits < 5) {
      playSound("rip");
      presentControls.start({
        scale: [1, 0.9, 1.05, 1],
        rotate: [0, Math.random() > 0.5 ? 10 : -10, 0], // slight jitter when ripped
        transition: { duration: 0.2 }
      });
    } else if (hits >= 5) {
      playSound("pop");
      setAppState("opened");
    }
  }, [hits, presentControls]);

  const requestPermission = () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      (DeviceMotionEvent as any).requestPermission()
        .then((permissionState: string) => {
          if (permissionState === 'granted') {
            // Permission granted
          }
        })
        .catch(console.error);
    }
  };

  const handleShake = () => {
    if (appState !== "shake") return;

    const now = Date.now();
    if (now - lastShakeTime.current < 500) return; // 500ms cooldown
    lastShakeTime.current = now;

    playSound("shake");
    presentControls.start({
      x: [0, -10, 10, -10, 10, 0],
      rotate: [0, -5, 5, -5, 5, 0],
      transition: { duration: 0.4 }
    });
    
    setShakeCount((prev) => {
      const newCount = prev + 1;
      if (newCount === 5) {
        setTimeout(() => {
          setAppState("rip");
        }, 500);
      }
      return newCount;
    });
  };

  return (
    <div 
      className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-gradient-to-br from-yellow-200 via-pink-200 to-purple-200 overflow-hidden touch-none cursor-crosshair fixed inset-0"
      onPointerDown={() => {
        requestPermission();
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume();
        }
        if (appState === "shake") handleShake();
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/40 via-transparent to-transparent pointer-events-none"></div>
      
      <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none w-full max-w-lg mx-auto h-full">
        {/* Present Area */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center shrink-0">
          {appState !== "opened" ? (
            <motion.div
              ref={presentRef}
              animate={presentControls}
              className="w-56 h-56 relative pointer-events-auto"
            >
              <img 
                src={hits < 2 ? "/present_closed.png" : hits < 4 ? "/present_ripped_1.png" : "/present_ripped_2.png"}
                alt="Present Box" 
                draggable="false"
                className="w-full h-full object-contain mix-blend-multiply select-none"
              />
            </motion.div>
          ) : (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.6 }}
              className="w-64 h-64 sm:w-72 sm:h-72 relative pointer-events-auto"
            >
              <img 
                src="/present_opened_new.png" 
                alt="Opened Present" 
                draggable="false"
                className="w-full h-full object-contain mix-blend-multiply z-10 relative select-none"
              />
              
              {/* Tickets popping out centered and fanned out */}
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  initial={{ x: "-50%", y: 0, scale: 0, opacity: 0, rotate: 0 }}
                  animate={{ 
                    x: "-50%",
                    y: -140 - (Math.abs(1 - i) * 10), // slight vertical curve
                    scale: 1.4,
                    opacity: 1,
                    rotate: (i - 1) * 10 
                  }}
                  transition={{ delay: 0.3 + (i * 0.1), duration: 1.2, type: "spring", bounce: 0.4 }}
                  className="absolute top-[66%] left-1/2 w-40 sm:w-48 z-50"
                >
                  <img 
                    src="/kaya-yanar-23-ft.jpg" 
                    alt="Kaya Yanar Ticket" 
                    draggable="false"
                    className="w-full h-auto rounded-xl shadow-2xl border-4 border-white select-none"
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Text Instruction - fixed height container to prevent shift */}
        <div className="h-24 sm:h-32 flex items-center justify-center mt-6 shrink-0 w-full px-4">
          <motion.h1 
            key={appState}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl sm:text-4xl md:text-6xl font-extrabold text-indigo-950 text-center tracking-tight drop-shadow-sm max-w-sm"
          >
            {appState === "shake" && "Schüttel mir!"}
            {appState === "rip" && "Öffne mir!"}
            {appState === "opened" && "Happy Birthday Mudda!"}
          </motion.h1>
        </div>
      </div>

      {/* Custom Cursor Hand */}
      {appState === "rip" && (
        <motion.div
          animate={handAnimation}
          style={{ 
            x: handX, 
            y: handY,
            position: "fixed",
            top: 0,
            left: 0,
            pointerEvents: "none",
            zIndex: 9999
          }}
          className="w-32 h-32"
        >
          <img 
            src="/grabbing_hand.png" 
            alt="Hand" 
            draggable="false"
            className="w-full h-full object-contain mix-blend-multiply drop-shadow-xl select-none"
          />
        </motion.div>
      )}
    </div>
  );
}
