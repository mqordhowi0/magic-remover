import React, { useState, useRef, useEffect } from 'react';
import { removeBackground } from "@imgly/background-removal";

function App() {
  // --- STATE DATA ---
  const [imageFile, setImageFile] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  
  // --- STATE UI ---
  const [loadingPhase, setLoadingPhase] = useState('idle'); 
  const [modelReady, setModelReady] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Menunggu...");
  const [isProcessingEffect, setIsProcessingEffect] = useState(false);
  
  // --- STATE TOOLS ---
  const canvasRef = useRef(null);
  const originalImageRef = useRef(null);
  
  const [activeTool, setActiveTool] = useState('none'); 
  const [brushSize, setBrushSize] = useState(50);
  
  // DYNAMIC RANGE
  const [maxShiftRange, setMaxShiftRange] = useState(20); 
  
  // --- STATE OPTIMASI (COMMIT ON RELEASE) ---
  const [edgeShift, setEdgeShift] = useState(0); 
  const [feather, setFeather] = useState(0);

  const [edgeShiftPreview, setEdgeShiftPreview] = useState(0);
  const [featherPreview, setFeatherPreview] = useState(0);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  
  // --- STATE CURSOR ---
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [showCursor, setShowCursor] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  // 1. AUTO PRELOAD
  useEffect(() => {
    const timer = setTimeout(() => {
        const preloadModel = async () => {
        setLoadingPhase('preload');
        try {
            const emptyBlob = new Blob([new Uint8Array(100)], { type: 'image/png' });
            const config = {
                model: 'medium',
                progress: (key, current, total) => {
                    const percent = Math.round((current / total) * 100); 
                    setDownloadProgress(percent);
                    setProgressStatus(`Menyiapkan AI... ${percent}%`);
                }
            };
            await removeBackground(emptyBlob, config);
            setModelReady(true);
            setDownloadProgress(100);
            setProgressStatus("AI Siap! 🚀");
        } catch (err) {
            console.log("Preload finished");
            setModelReady(true);
            setDownloadProgress(100);
        } finally {
            setLoadingPhase('idle');
        }
        };
        preloadModel();
    }, 2000); 
    return () => clearTimeout(timer);
  }, []);

  // 2. LOAD GAMBAR & SETUP RANGE
  useEffect(() => {
    if (imageFile) {
      const img = new Image();
      img.src = imageFile;
      img.onload = () => { 
          originalImageRef.current = img; 
          
          // FIX: Skala slider lebih halus (1.5% dari sisi terpendek)
          const minDim = Math.min(img.width, img.height);
          // Minimal 10px, Maksimal 50px (cukup untuk detail)
          const calculatedMax = Math.max(10, Math.min(50, Math.floor(minDim * 0.015)));
          setMaxShiftRange(calculatedMax);
      };
    }
  }, [imageFile]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageFile(url);
      setProcessedImage(null);
      setActiveTool('none');
      
      setEdgeShift(0); setEdgeShiftPreview(0);
      setFeather(0); setFeatherPreview(0);
      
      setTimeout(() => {
          processImage(file);
      }, 100);
    }
  };

  const handleResetAll = () => {
      setImageFile(null);
      setProcessedImage(null);
      setEdgeShift(0); setEdgeShiftPreview(0);
      setFeather(0); setFeatherPreview(0);
      setActiveTool('none');
  };

  const processImage = async (file) => {
    setLoadingPhase('processing');
    setDownloadProgress(0); 
    
    if (modelReady) {
        setProgressStatus("Menganalisa Pixel..."); 
        setDownloadProgress(20); 
    } else {
        setProgressStatus("Mendownload AI Engine...");
    }
    
    setTimeout(async () => {
        try {
            const config = {
                model: 'medium',
                progress: (key, current, total) => {
                    const percent = Math.round((current / total) * 100);
                    setDownloadProgress(percent);
                    setProgressStatus(`Proses Data... ${percent}%`);
                }
            };
            const blob = await removeBackground(file, config);
            const url = URL.createObjectURL(blob);
            setProcessedImage(url);
            setDownloadProgress(100);
            setProgressStatus("Selesai!");
            if (!modelReady) setModelReady(true);
        } catch (error) {
            console.error(error);
            setProgressStatus("Gagal. Coba refresh.");
        } finally {
            setLoadingPhase('idle');
        }
    }, 100);
  };

  // --- CORE LOGIC ---
  useEffect(() => {
    if (!processedImage) return;
    setIsProcessingEffect(true);
    const timeoutId = setTimeout(() => {
        drawCanvas();
        setIsProcessingEffect(false);
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [processedImage, edgeShift, feather]); 

  // FUNGSI MORFOLOGI
  const performMorphology = (imageData, shift) => {
      const width = imageData.width;
      const height = imageData.height;
      const src = imageData.data;
      const radius = Math.abs(shift);
      
      if (radius === 0) return imageData;

      const output = new Uint8ClampedArray(src.length);
      output.set(src);

      for (let y = 0; y < height; y++) {
          const rowOffset = y * width;
          for (let x = 0; x < width; x++) {
              const centerIdx = (rowOffset + x) * 4 + 3;
              
              if (shift < 0) { // EROSION
                  if (src[centerIdx] === 0) continue; 
                  let keep = true;
                  for (let dy = -radius; dy <= radius; dy++) {
                      const ny = y + dy;
                      if (ny < 0 || ny >= height) { keep = false; break; }
                      const neighborRowOffset = ny * width;
                      for (let dx = -radius; dx <= radius; dx++) {
                          const nx = x + dx;
                          if (nx < 0 || nx >= width) { keep = false; break; }
                          if (src[(neighborRowOffset + nx) * 4 + 3] === 0) {
                              keep = false; break;
                          }
                      }
                      if (!keep) break;
                  }
                  output[centerIdx] = keep ? 255 : 0;
              } else { // DILATION
                  if (src[centerIdx] > 0) {
                      output[centerIdx] = 255; continue; 
                  }
                  let grow = false;
                  for (let dy = -radius; dy <= radius; dy++) {
                      const ny = y + dy;
                      if (ny < 0 || ny >= height) continue;
                      const neighborRowOffset = ny * width;
                      for (let dx = -radius; dx <= radius; dx++) {
                          const nx = x + dx;
                          if (nx < 0 || nx >= width) continue;
                          if (src[(neighborRowOffset + nx) * 4 + 3] > 0) {
                              grow = true; break;
                          }
                      }
                      if (grow) break;
                  }
                  if (grow) {
                      const baseIdx = (rowOffset + x) * 4;
                      output[baseIdx] = 0; output[baseIdx + 1] = 0; output[baseIdx + 2] = 0;
                      output[baseIdx + 3] = 255;
                  }
              }
          }
      }
      return new ImageData(output, width, height);
  };

  const drawCanvas = () => {
    if (!processedImage || !canvasRef.current || !originalImageRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgAI = new Image();
    imgAI.src = processedImage;
    
    imgAI.onload = () => {
      canvas.width = imgAI.width;
      canvas.height = imgAI.height;
      const w = canvas.width;
      const h = canvas.height;
      
      const PROCESS_MAX_SIZE = 500;
      let scale = 1;
      if (Math.max(w, h) > PROCESS_MAX_SIZE) {
          scale = PROCESS_MAX_SIZE / Math.max(w, h);
      }
      
      const sw = Math.floor(w * scale);
      const sh = Math.floor(h * scale);

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = sw; maskCanvas.height = sh;
      const mCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
      mCtx.drawImage(imgAI, 0, 0, sw, sh);

      const rawData = mCtx.getImageData(0, 0, sw, sh);
      const data = rawData.data;
      for (let i = 3; i < data.length; i += 4) {
          data[i] = data[i] > 100 ? 255 : 0; 
      }
      mCtx.putImageData(rawData, 0, 0);

      if (edgeShift !== 0) {
          const scaledShift = Math.round(edgeShift * scale);
          const effectiveShift = (edgeShift !== 0 && scaledShift === 0) 
                ? (edgeShift > 0 ? 1 : -1) : scaledShift;
          const binaryData = mCtx.getImageData(0, 0, sw, sh);
          const morphedData = performMorphology(binaryData, effectiveShift);
          mCtx.putImageData(morphedData, 0, 0);
      }

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      if (feather > 0) { ctx.filter = `blur(${feather}px)`; }
      ctx.drawImage(maskCanvas, 0, 0, w, h);
      ctx.filter = 'none';
      ctx.restore();

      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(originalImageRef.current, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    };
  };

  const handleResetTools = () => {
    setEdgeShift(0); setEdgeShiftPreview(0);
    setFeather(0); setFeatherPreview(0);
    setActiveTool('none');
  };

  const onSliderChange = (setterPreview) => (e) => {
      setterPreview(Number(e.target.value));
      setIsDraggingSlider(true);
  };
  
  const onSliderCommit = (setterCommit, value) => () => {
      setterCommit(value);
      setIsDraggingSlider(false);
  };

  const handleMouseMove = (e) => {
    if (activeTool === 'none') return;
    setCursorPos({ x: e.clientX, y: e.clientY });
    setShowCursor(true);
    if (isDrawing) applyTool(e);
  };
  const startDrawing = (e) => { if (activeTool !== 'none') { setIsDrawing(true); applyTool(e); } };
  const stopDrawing = () => setIsDrawing(false);

  const applyTool = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const scaledBrushSize = brushSize * scaleX; 

    if (activeTool === 'erase') {
      ctx.globalCompositeOperation = 'destination-out'; 
      ctx.filter = `blur(${feather > 0 ? 1 : 0}px)`; 
      ctx.beginPath(); ctx.arc(x, y, scaledBrushSize / 2, 0, Math.PI * 2); ctx.fill();
      ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; 
    } else if (activeTool === 'restore' && originalImageRef.current) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, scaledBrushSize / 2, 0, Math.PI * 2); ctx.clip(); 
      if(feather > 0) ctx.filter = `blur(1px)`; 
      ctx.drawImage(originalImageRef.current, 0, 0, canvas.width, canvas.height);
      ctx.restore(); 
    }
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    const url = canvas.toDataURL("image/png");
    const link = document.createElement('a');
    link.download = 'magic-result-hd.png';
    link.href = url;
    link.click();
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-white font-sans overflow-hidden relative">
      
      {activeTool !== 'none' && showCursor && (
        <div 
            className={`fixed pointer-events-none rounded-full border-2 z-50 mix-blend-difference ${activeTool === 'restore' ? 'border-green-400 bg-green-400/20' : 'border-red-500 bg-red-500/20'}`}
            style={{ left: cursorPos.x, top: cursorPos.y, width: `${brushSize}px`, height: `${brushSize}px`, transform: 'translate(-50%, -50%)' }}
        />
      )}

      {/* HEADER */}
      <header className="h-16 flex items-center justify-between px-4 md:px-6 bg-slate-900 border-b border-slate-800 shrink-0 z-20">
          <div className="flex items-center gap-3">
            <h1 onClick={handleResetAll} className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 cursor-pointer hover:opacity-80 transition-opacity">
                Magic Remover
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {imageFile && (
                <button onClick={handleResetAll} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-full text-xs font-bold border border-slate-700 transition-all">
                    <span>📁</span><span className="hidden sm:inline">Ganti Foto</span>
                </button>
            )}
            {loadingPhase === 'preload' && (
               <div className="hidden md:block w-32">
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-cyan-500 h-full rounded-full transition-all duration-300" style={{ width: `${downloadProgress}%` }}></div>
                  </div>
               </div>
            )}
          </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 relative w-full h-full p-4 overflow-hidden pb-12 flex items-center justify-center">
        
        {!imageFile && (
            <div className="w-full max-w-4xl flex flex-col items-center animate-fade-in overflow-y-auto max-h-full">
                <div className="w-full bg-slate-900/50 border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-3xl p-10 text-center relative transition-all group overflow-hidden shrink-0">
                    <input type="file" accept="image/*" onChange={handleFileChange} disabled={loadingPhase === 'processing'} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-cyan-500/10 rounded-full blur-[100px] group-hover:bg-cyan-500/20 transition-all"></div>
                    <div className="relative z-0">
                        <div className="text-7xl mb-6 group-hover:scale-110 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]">📂</div>
                        <h2 className="text-4xl font-black text-white mb-3 tracking-tight">Upload Foto</h2>
                        <p className="text-slate-400 text-lg mb-8">Klik atau Geser file gambar ke area ini.</p>
                        <button className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-8 rounded-full shadow-lg shadow-cyan-500/20 transition-all transform group-hover:scale-105">Pilih Gambar</button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-6 shrink-0 pb-10">
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4 hover:border-slate-600 transition-colors">
                        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-xl">🔒</div>
                        <div className="text-left"><h3 className="font-bold text-slate-200 text-sm">Privasi 100%</h3><p className="text-xs text-slate-500">Proses lokal di browser.</p></div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4 hover:border-slate-600 transition-colors">
                        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-xl">💎</div>
                        <div className="text-left"><h3 className="font-bold text-slate-200 text-sm">Resolusi Asli</h3><p className="text-xs text-slate-500">HD tanpa kompresi.</p></div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4 hover:border-slate-600 transition-colors">
                        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-xl">⚡</div>
                        <div className="text-left"><h3 className="font-bold text-slate-200 text-sm">Cepat</h3><p className="text-xs text-slate-500">Optimasi AI.</p></div>
                    </div>
                </div>
            </div>
        )}

        {imageFile && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full h-full pb-6">
                
                {/* Panel Kiri (Original) */}
                <div className="hidden lg:flex flex-col bg-slate-900 rounded-2xl border border-slate-800 p-3 h-full overflow-hidden">
                    <div className="flex justify-between items-center mb-2 shrink-0">
                        <span className="text-xs font-bold text-slate-500 uppercase">Original</span>
                    </div>
                    <div className="flex-1 bg-[url('https://placehold.co/20x20/0f172a/1e293b/png')] rounded-lg flex items-center justify-center overflow-hidden border border-slate-800">
                        <img src={imageFile} alt="Original" className="max-w-full max-h-full object-contain" />
                    </div>
                </div>

                {/* Panel Kanan (Editor) */}
                <div className="flex flex-col bg-slate-900 rounded-2xl border border-slate-800 p-3 h-full overflow-hidden relative">
                    
                    {/* TOOLBAR */}
                    <div className="flex flex-col xl:flex-row gap-3 mb-2 shrink-0 bg-slate-950 p-2 rounded-xl border border-slate-800">
                        <div className="flex bg-slate-800 p-1 rounded-lg gap-1 shrink-0 overflow-x-auto">
                            <button onClick={() => setActiveTool('none')} className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap ${activeTool === 'none' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}><span>👁️</span></button>
                            <button onClick={() => setActiveTool('erase')} className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap ${activeTool === 'erase' ? 'bg-red-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}><span>🧹</span></button>
                            <button onClick={() => setActiveTool('restore')} className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap ${activeTool === 'restore' ? 'bg-green-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}><span>🖌️</span></button>
                            <button onClick={handleResetTools} className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold text-yellow-500 hover:bg-yellow-500/10 transition-all border border-yellow-500/30 whitespace-nowrap"><span>↺</span></button>
                        </div>

                        <div className="flex-1 px-2 flex flex-col justify-center gap-1 min-w-[200px]">
                             <div className="flex justify-between items-center mb-0.5">
                                 <span className="text-[10px] text-slate-300 font-bold">
                                    {activeTool === 'none' && "Mode: Rapikan Tepi & Perhalus"}
                                    {activeTool === 'erase' && "Mode: Hapus Manual (Brush)"}
                                    {activeTool === 'restore' && "Mode: Pulihkan Manual (Brush)"}
                                 </span>
                                 {isDraggingSlider && activeTool === 'none' && (
                                     <span className="text-[9px] text-yellow-400 animate-pulse font-bold bg-yellow-400/10 px-2 rounded">Lepas untuk terapkan...</span>
                                 )}
                                 {isProcessingEffect && !isDraggingSlider && (
                                     <span className="text-[9px] text-cyan-400 animate-pulse font-bold">Memproses...</span>
                                 )}
                             </div>

                             {activeTool === 'none' && (
                                <>
                                    <div className="flex items-center gap-2 h-5">
                                        <span className="text-[9px] text-red-400 font-bold w-6 text-right">Kikis</span>
                                        <div className="flex-1 relative h-6 flex items-center">
                                            <input 
                                                type="range" 
                                                min={-maxShiftRange} max={maxShiftRange} step="1" 
                                                value={edgeShiftPreview} 
                                                onChange={onSliderChange(setEdgeShiftPreview)}
                                                onMouseUp={onSliderCommit(setEdgeShift, edgeShiftPreview)}
                                                onTouchEnd={onSliderCommit(setEdgeShift, edgeShiftPreview)}
                                                className="w-full h-1.5 bg-slate-700 rounded-lg accent-cyan-500 cursor-pointer appearance-none z-10" 
                                            />
                                            <div className="absolute left-1/2 top-1 bottom-1 w-0.5 bg-slate-500 -translate-x-1/2 z-0 pointer-events-none"></div>
                                        </div>
                                        <span className="text-[9px] text-green-400 font-bold w-6">Tumbuh</span>
                                    </div>
                                    <div className="flex items-center gap-2 h-5">
                                        <span className="text-[9px] text-cyan-400 font-bold w-6 text-right">Halus</span>
                                        <input 
                                            type="range" 
                                            min="0" max="20" step="1" 
                                            value={featherPreview} 
                                            onChange={onSliderChange(setFeatherPreview)}
                                            onMouseUp={onSliderCommit(setFeather, featherPreview)}
                                            onTouchEnd={onSliderCommit(setFeather, featherPreview)}
                                            className="flex-1 h-1.5 bg-slate-700 rounded-lg accent-cyan-500 cursor-pointer" 
                                        />
                                        <span className="text-[9px] text-slate-400 font-bold w-6">{featherPreview}</span>
                                    </div>
                                </>
                             )}
                             {activeTool !== 'none' && (
                                <div className="flex items-center gap-2 animate-fade-in h-full">
                                    <span className={`text-[9px] font-bold ${activeTool === 'restore' ? 'text-green-400' : 'text-red-400'}`}>Size</span>
                                    <input type="range" min="10" max="200" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className={`flex-1 h-1.5 bg-slate-700 rounded-lg cursor-pointer ${activeTool === 'restore' ? 'accent-green-500' : 'accent-red-500'}`} />
                                </div>
                             )}
                        </div>
                        
                        <button onClick={downloadCanvas} className="shrink-0 bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-5 py-2 rounded-lg hover:shadow-lg transition-all text-xs font-bold flex items-center justify-center gap-2">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                             <span>Download</span>
                        </button>
                    </div>

                    {/* CANVAS AREA - FIX: Background di Canvas, bukan di Div */}
                    <div 
                        className="flex-1 relative w-full h-full rounded-lg overflow-hidden flex items-center justify-center bg-slate-950/50"
                        onMouseEnter={() => activeTool !== 'none' && setShowCursor(true)}
                        onMouseLeave={() => setShowCursor(false)}
                    >
                        {loadingPhase === 'processing' && (
                            <div className="absolute inset-0 z-20 bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
                                <div className="relative mb-4">
                                    <div className="w-16 h-16 border-4 border-slate-700 rounded-full"></div>
                                    <div className="w-16 h-16 border-4 border-cyan-500 rounded-full animate-spin border-t-transparent absolute top-0 left-0 shadow-[0_0_15px_rgba(6,182,212,0.5)]"></div>
                                </div>
                                <p className="text-cyan-400 font-bold text-lg animate-pulse">{progressStatus}</p>
                            </div>
                        )}
                        <canvas 
                            ref={canvasRef} 
                            onMouseMove={handleMouseMove} 
                            onMouseDown={startDrawing} 
                            onMouseUp={stopDrawing} 
                            onMouseOut={stopDrawing} 
                            className={`max-w-full max-h-full object-contain z-10 block transition-colors ${activeTool !== 'none' ? 'border-2 border-yellow-500/50 cursor-none' : 'border border-slate-700'}`}
                            style={{ 
                                touchAction: 'none',
                                // FIX: Background pattern hanya di dalam canvas
                                backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
                                backgroundSize: '20px 20px',
                                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                                backgroundColor: 'white'
                            }} 
                        />
                    </div>
                </div>
            </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="absolute bottom-0 left-0 w-full px-4 py-3 bg-slate-950/80 backdrop-blur-md border-t border-slate-800 flex flex-col md:flex-row justify-between items-center text-[10px] md:text-xs text-slate-500 z-30">
        <div className="mb-2 md:mb-0">
          Made with ❤️ by <span className="text-slate-300 font-bold">Muhammad Qordhowi Abdurrahman</span>
        </div>
        <div className="flex gap-4 items-center">
          <a href="https://www.instagram.com/macchiatoberaskencur/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-pink-500 transition-colors">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7.75 2h8.5C19.55 2 22 4.45 22 7.75v8.5C22 19.55 19.55 22 16.25 22h-8.5C4.45 22 2 19.55 2 16.25v-8.5C2 4.45 4.45 2 7.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5z"/>
            <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0 1.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7z"/>
            <circle cx="17.5" cy="6.5" r="1.25"/>
            </svg>
            <span className="hidden sm:inline">macchiatoberaskencur</span>
          </a>
          <a href="mailto:mqordhowi0@gmail.com" className="flex items-center gap-1 hover:text-cyan-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
            <span className="hidden sm:inline">mqordhowi0@gmail.com</span>
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;