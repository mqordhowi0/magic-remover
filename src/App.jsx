import React, { useState, useRef, useEffect } from 'react';
import { removeBackground } from "@imgly/background-removal";

function App() {
  // --- STATE DATA ---
  const [imageFile, setImageFile] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  
  // --- STATE UI & LOADING ---
  const [isLoading, setIsLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  
  // State Progress
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Menunggu...");
  
  // --- STATE TOOLS ---
  const canvasRef = useRef(null);
  const originalImageRef = useRef(null);
  const [activeTool, setActiveTool] = useState('none'); 
  const [brushSize, setBrushSize] = useState(50);
  const [edgeSmooth, setEdgeSmooth] = useState(0); 
  
  // --- STATE CURSOR ---
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [showCursor, setShowCursor] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  // 1. AUTO PRELOAD
  useEffect(() => {
    const timer = setTimeout(() => {
        const preloadModel = async () => {
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
        }
        };
        preloadModel();
    }, 2000); 

    return () => clearTimeout(timer);
  }, []);

  // 2. LOAD GAMBAR ASLI
  useEffect(() => {
    if (imageFile) {
      const img = new Image();
      img.src = imageFile;
      img.onload = () => { originalImageRef.current = img; };
    }
  }, [imageFile]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageFile(url);
      setProcessedImage(null);
      setActiveTool('none');
      
      setTimeout(() => {
          processImage(file);
      }, 100);
    }
  };

  const processImage = async (file) => {
    setIsLoading(true);
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
                    setProgressStatus(`Download Data... ${percent}%`);
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
            setIsLoading(false);
        }
    }, 100);
  };

  // --- DRAW CANVAS ---
  useEffect(() => {
    drawCanvas();
  }, [processedImage, edgeSmooth]); 

  const drawCanvas = () => {
    if (!processedImage || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = processedImage;
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      if (edgeSmooth > 0) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.filter = `blur(${edgeSmooth}px)`;
        const loops = Math.max(1, edgeSmooth / 2); 
        for (let i = 0; i < loops; i++) ctx.drawImage(img, 0, 0); 
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over'; 
      }
    };
  };

  // --- TOOLS ---
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
      ctx.beginPath();
      ctx.arc(x, y, scaledBrushSize / 2, 0, Math.PI * 2); 
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; 
    } else if (activeTool === 'restore' && originalImageRef.current) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, scaledBrushSize / 2, 0, Math.PI * 2);
      ctx.clip(); 
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
      
      {/* CURSOR */}
      {activeTool !== 'none' && showCursor && (
        <div 
            className={`fixed pointer-events-none rounded-full border-2 z-50 mix-blend-difference ${activeTool === 'restore' ? 'border-green-400 bg-green-400/20' : 'border-red-500 bg-red-500/20'}`}
            style={{ left: cursorPos.x, top: cursorPos.y, width: `${brushSize}px`, height: `${brushSize}px`, transform: 'translate(-50%, -50%)' }}
        />
      )}

      {/* HEADER */}
      <header className="h-16 flex items-center justify-between px-6 bg-slate-900 border-b border-slate-800 shrink-0 z-20">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
                Magic Remover
            </h1>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                <span className={`h-2 w-2 rounded-full transition-all duration-500 ${modelReady ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}></span>
                <span>{modelReady ? "Ready" : "Loading Engine..."}</span>
            </div>
          </div>
          
          {(!modelReady || isLoading) && (
              <div className="w-1/3 max-w-xs">
                  <div className="flex justify-between text-[10px] text-cyan-400 mb-1">
                      <span>{progressStatus}</span>
                      <span>{downloadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-cyan-500 h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${downloadProgress}%` }}></div>
                  </div>
              </div>
          )}
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 relative w-full h-full p-4 overflow-hidden pb-12 flex items-center justify-center">
        
        {/* TAMPILAN AWAL (UPLOAD SCREEN) - UPDATED: COMPACT & INFORMATIF */}
        {!imageFile && (
            <div className="w-full max-w-4xl flex flex-col items-center">
                
                {/* 1. Box Upload */}
                <div className="w-full bg-slate-900/50 border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-3xl p-10 text-center relative transition-all group overflow-hidden">
                    <input type="file" accept="image/*" onChange={handleFileChange} disabled={isLoading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    
                    {/* Background Glow Effect */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-cyan-500/10 rounded-full blur-[100px] group-hover:bg-cyan-500/20 transition-all"></div>

                    <div className="relative z-0">
                        <div className="text-7xl mb-6 group-hover:scale-110 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                            📂
                        </div>
                        <h2 className="text-4xl font-black text-white mb-3 tracking-tight">
                            Upload Foto Disini
                        </h2>
                        <p className="text-slate-400 text-lg mb-8">
                            Klik atau Geser file gambar ke area ini.
                        </p>
                        <button className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-8 rounded-full shadow-lg shadow-cyan-500/20 transition-all transform group-hover:scale-105">
                            Pilih Gambar
                        </button>
                    </div>
                </div>

                {/* 2. Info Badges (Privasi & Keamanan) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-6">
                    {/* Badge 1 */}
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4 hover:border-slate-600 transition-colors">
                        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-xl">🔒</div>
                        <div className="text-left">
                            <h3 className="font-bold text-slate-200 text-sm">Privasi 100%</h3>
                            <p className="text-xs text-slate-500">Foto diproses di browser, tidak di-upload ke server.</p>
                        </div>
                    </div>
                    {/* Badge 2 */}
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4 hover:border-slate-600 transition-colors">
                        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-xl">💎</div>
                        <div className="text-left">
                            <h3 className="font-bold text-slate-200 text-sm">Resolusi Asli</h3>
                            <p className="text-xs text-slate-500">Kualitas gambar tetap HD, tidak dikompres/dikecilkan.</p>
                        </div>
                    </div>
                    {/* Badge 3 */}
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4 hover:border-slate-600 transition-colors">
                        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-xl">⚡</div>
                        <div className="text-left">
                            <h3 className="font-bold text-slate-200 text-sm">Mode Offline</h3>
                            <p className="text-xs text-slate-500">Setelah loading awal, bisa dipakai tanpa internet.</p>
                        </div>
                    </div>
                </div>

            </div>
        )}

        {/* WORKSPACE AREA (TAMPIL SETELAH UPLOAD) */}
        {imageFile && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full h-full pb-6">
                
                {/* Panel Kiri */}
                <div className="flex flex-col bg-slate-900 rounded-2xl border border-slate-800 p-3 h-full overflow-hidden">
                    <div className="flex justify-between items-center mb-2 shrink-0">
                        <span className="text-xs font-bold text-slate-500 uppercase">Original</span>
                        <button onClick={() => {setImageFile(null); setProcessedImage(null)}} className="text-xs text-red-400 hover:text-white hover:bg-red-500 px-2 py-1 rounded transition">✕ Ganti</button>
                    </div>
                    <div className="flex-1 bg-[url('https://placehold.co/20x20/0f172a/1e293b/png')] rounded-lg flex items-center justify-center overflow-hidden border border-slate-800">
                        <img src={imageFile} alt="Original" className="max-w-full max-h-full object-contain" />
                    </div>
                </div>

                {/* Panel Kanan */}
                <div className="flex flex-col bg-slate-900 rounded-2xl border border-slate-800 p-3 h-full overflow-hidden relative">
                    {/* Toolbar */}
                    <div className="flex items-center gap-2 mb-2 shrink-0 bg-slate-950 p-1.5 rounded-xl border border-slate-800 overflow-x-auto custom-scrollbar">
                        <div className="flex bg-slate-800 p-1 rounded-lg gap-1 shrink-0">
                            <button onClick={() => setActiveTool('none')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTool === 'none' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>👁️</button>
                            <button onClick={() => setActiveTool('erase')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTool === 'erase' ? 'bg-red-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}>🧹</button>
                            <button onClick={() => setActiveTool('restore')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTool === 'restore' ? 'bg-green-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}>🖌️</button>
                        </div>
                        <div className="flex-1 px-2 min-w-[120px]">
                             {activeTool !== 'none' ? (
                                <div className="flex items-center gap-2 animate-fade-in">
                                    <span className={`text-[10px] font-bold ${activeTool === 'restore' ? 'text-green-400' : 'text-red-400'}`}>Size</span>
                                    <input type="range" min="10" max="200" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className={`w-full h-1.5 bg-slate-700 rounded-lg cursor-pointer ${activeTool === 'restore' ? 'accent-green-500' : 'accent-red-500'}`} />
                                </div>
                             ) : (
                                <div className="flex items-center gap-2 animate-fade-in">
                                    <span className="text-[10px] text-cyan-400 font-bold">Halus</span>
                                    <input type="range" min="0" max="20" value={edgeSmooth} onChange={(e) => setEdgeSmooth(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-700 rounded-lg accent-cyan-500 cursor-pointer" />
                                </div>
                             )}
                        </div>
                        <button onClick={downloadCanvas} className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-2 rounded-lg hover:shadow-lg transition-all" title="Download HD">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        </button>
                    </div>

                    <div 
                        className={`flex-1 relative w-full h-full rounded-lg overflow-hidden border-2 transition-colors flex items-center justify-center ${activeTool !== 'none' ? 'border-yellow-500/50 cursor-none' : 'border-slate-800'}`}
                        style={{
                            backgroundColor: '#e5e5e5',
                            backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                        }}
                        onMouseEnter={() => activeTool !== 'none' && setShowCursor(true)}
                        onMouseLeave={() => setShowCursor(false)}
                    >
                        {isLoading && (
                            <div className="absolute inset-0 z-20 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
                                <div className="relative mb-4">
                                    <div className="w-16 h-16 border-4 border-slate-700 rounded-full"></div>
                                    <div className="w-16 h-16 border-4 border-cyan-500 rounded-full animate-spin border-t-transparent absolute top-0 left-0 shadow-[0_0_15px_rgba(6,182,212,0.5)]"></div>
                                </div>
                                <p className="text-cyan-400 font-bold text-lg animate-pulse">{progressStatus}</p>
                                <p className="text-slate-400 text-xs mt-1">Sedang memisahkan objek...</p>
                            </div>
                        )}
                        
                        <canvas
                            ref={canvasRef}
                            onMouseMove={handleMouseMove}
                            onMouseDown={startDrawing}
                            onMouseUp={stopDrawing}
                            onMouseOut={stopDrawing}
                            className="max-w-full max-h-full object-contain z-10 block"
                            style={{ touchAction: 'none' }} 
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
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
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